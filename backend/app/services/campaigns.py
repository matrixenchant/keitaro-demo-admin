import asyncio
import secrets
import time
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.keitaro.client import KeitaroClient, KeitaroError
from app.models import CreatedCampaign, TrackedStream
from app.schemas import CampaignCreate
from app.services import dns, refs
from app.services.tracking import apply_sync, aware, campaign_streams, campaigns_with_draft, pending, stream_dirty


def tracking_url(domain: str | None, alias: str | None) -> str | None:
    if not domain or not alias:
        return None
    return f"{domain.rstrip('/')}/{alias}"


def working_url(alias: str | None) -> str | None:
    base = get_settings().TRACKER_PUBLIC_URL
    return f"{base}/{alias}" if base and alias else None


def map_campaign(c: dict, mine: set[int]) -> dict:
    return {
        "id": c["id"],
        "name": c["name"],
        "alias": c.get("alias"),
        "state": c.get("state"),
        "group": c.get("group"),
        "domain": c.get("domain"),
        "tracking_url": tracking_url(c.get("domain"), c.get("alias")),
        "working_url": working_url(c.get("alias")),
        "created_here": c["id"] in mine,
        "created_at": c.get("created_at"),
    }


_TYPE_ORDER = {"forced": 0, "regular": 1, "default": 2}
ZERO = {"clicks": 0, "unique": 0, "bots": 0}


def map_stream(ts: TrackedStream, stats: dict, offer_stats: dict) -> dict:
    """stats: {stream_id: Stats}, offer_stats: {(stream_id, offer_id): Stats} — ключи по id Keitaro."""
    m = ts.meta or {}
    sid = ts.keitaro_stream_id
    return {
        "id": sid,
        "name": ts.name,
        "type": ts.type,
        "schema": ts.schema,
        "position": ts.position,
        "state": m.get("state"),
        "action_payload": m.get("action_payload"),
        "filters": [{"name": f["name"], "mode": f.get("mode"), "payload": f.get("payload")} for f in m.get("filters") or []],
        "editable": ts.has_offers,
        "has_offers": ts.has_offers,
        "dirty": stream_dirty(ts),
        "synced_at": aware(ts.synced_at),
        "stats": stats.get(sid, ZERO),
        "offers": [
            {
                "offer_id": o.offer_id,
                "name": o.name or f"Оффер #{o.offer_id}",
                "accessible": o.accessible,
                "share": o.share,
                "state": o.kt_state,
                "pinned": o.pinned,
                "status": o.status,
                "pending": pending(o),
                "published": o.kt_present,
                "published_share": o.kt_share,
                "stats": offer_stats.get((sid, o.offer_id), ZERO),
            }
            for o in ts.offers
        ],
    }


def row_stats(row: dict) -> dict:
    return {"clicks": row.get("clicks") or 0, "unique": row.get("campaign_unique_clicks") or 0, "bots": row.get("bots") or 0}


# Кэш потоков для списка кампаний: {campaign_id: (monotonic, streams)}
STREAMS_TTL = 300.0
STREAMS_CONCURRENCY = 8
_streams_cache: dict[int, tuple[float, list[dict]]] = {}
_streams_gen: dict[int, int] = {}  # растёт при инвалидации: ответ, запрошенный до правки, в кэш не попадёт


def invalidate_streams(campaign_id: int) -> None:
    _streams_cache.pop(campaign_id, None)
    _streams_gen[campaign_id] = _streams_gen.get(campaign_id, 0) + 1


def clear_streams_cache() -> None:
    _streams_cache.clear()
    _streams_gen.clear()


async def _cached_streams(
    kc: KeitaroClient, campaign_id: int, sem: asyncio.Semaphore, refresh: bool = False
) -> list[dict] | None:
    """refresh=True — не читать кэш, а перезаписать его свежим ответом."""
    hit = _streams_cache.get(campaign_id)
    if not refresh and hit and time.monotonic() - hit[0] < STREAMS_TTL:
        return hit[1]
    async with sem:
        gen = _streams_gen.get(campaign_id, 0)
        try:
            streams = await kc.list_streams(campaign_id)
        except KeitaroError:
            return None  # одна сбойная кампания не должна ронять весь список
    if _streams_gen.get(campaign_id, 0) == gen:
        _streams_cache[campaign_id] = (time.monotonic(), streams)
    return streams


def summarize_streams(streams: list[dict], offer_names: dict[int, str]) -> dict:
    """geo — коды из country-фильтров (accept); offers — офферы потоков со схемой landings."""
    live = [s for s in streams if s.get("state") != "deleted"]
    geo: dict[str, None] = {}
    offers: dict[int, None] = {}
    for s in live:
        for f in s.get("filters") or []:
            if f.get("name") == "country" and f.get("mode") == "accept" and isinstance(f.get("payload"), list):
                geo.update((str(c).upper(), None) for c in f["payload"])
        if s.get("schema") == "landings":
            offers.update((o["offer_id"], None) for o in s.get("offers") or [])
    return {
        "geo": list(geo),
        "offers": [{"id": i, "name": offer_names.get(i, f"Оффер #{i}"), "accessible": i in offer_names} for i in offers],
        "streams_count": len(live),
    }


def sort_streams(streams: list[dict]) -> list[dict]:
    return sorted(streams, key=lambda s: (_TYPE_ORDER.get(s["type"], 9), s.get("position") or 0))


async def my_campaign_ids(session: AsyncSession) -> set[int]:
    return set((await session.scalars(select(CreatedCampaign.keitaro_campaign_id))).all())


def with_prefix(name: str, prefix: str) -> str:
    """Добавляет обязательный префикс, если его ещё нет (без дублирования)."""
    name = name.strip()
    return name if not prefix or name.startswith(prefix) else prefix + name


async def create_campaign(kc: KeitaroClient, session: AsyncSession, body: CampaignCreate) -> dict[str, Any]:
    settings = get_settings()
    body = body.model_copy(update={"name": with_prefix(body.name, settings.CAMPAIGN_NAME_PREFIX)})
    created = await refs.ensure_offer_exists(kc, body.offer_id)
    offers = await refs.offers(kc)

    d = await refs.resolve_defaults(kc)
    domain_id = body.domain_id or d["domain"]["id"]
    group_id = body.group_id or d["group"]["id"]
    source_id = body.traffic_source_id or d["source"]["id"]

    campaign = await kc.create_campaign(
        {
            "name": body.name,
            "alias": secrets.token_hex(5),
            "type": "position",
            "domain_id": domain_id,
            "group_id": group_id,
            "traffic_source_id": source_id,
            "cost_type": "CPC",
            "state": "active",
        }
    )
    cid = campaign["id"]
    try:
        geo_stream = await kc.create_stream(
            {
                "campaign_id": cid,
                "type": "regular",
                "name": "Flow 1",
                "position": 1,
                "schema": "redirect",
                "action_type": "http",
                "action_payload": settings.SAFE_REDIRECT_URL,
                "filters": [{"name": "country", "mode": "accept", "payload": body.geo}],
            }
        )
        offers_stream = await kc.create_stream(
            {
                "campaign_id": cid,
                "type": "regular",
                "name": "Flow 2",
                "position": 2,
                "schema": "landings",
                "action_type": "http",
                "offers": [{"offer_id": body.offer_id, "share": 100, "state": "active"}],
            }
        )
    except Exception:
        try:
            await kc.delete_campaign(cid)  # откат: в архив, best effort
        except Exception:
            pass
        raise

    domain = campaign.get("domain")
    if not domain:
        dom = next((x for x in await refs.domains(kc) if x["id"] == domain_id), None)
        domain = f"https://{dom['name']}/" if dom else None
    alias = campaign.get("alias")
    url = tracking_url(domain, alias) or ""

    session.add(
        CreatedCampaign(
            keitaro_campaign_id=cid,
            name=body.name,
            alias=alias or "",
            geo=body.geo,
            offer_id=body.offer_id,
            domain_id=domain_id,
            group_id=group_id,
            traffic_source_id=source_id,
            geo_stream_id=geo_stream["id"],
            offers_stream_id=offers_stream["id"],
            tracking_url=url,
        )
    )
    names = {o["id"]: o["name"] for o in offers}
    if created["accessible"] and created["name"]:
        names[body.offer_id] = created["name"]
    await apply_sync(session, cid, [], [geo_stream, offers_stream], names)  # сразу «опубликовано», без черновика
    await session.commit()
    invalidate_streams(cid)

    item = map_campaign({**campaign, "domain": domain}, {cid})
    await dns.attach_domain_status([item])
    return {
        "campaign": item,
        "streams": sort_streams([map_stream(s, {}, {}) for s in await campaign_streams(session, cid)]),
        "tracking_url": url,
        "working_url": item["working_url"],
    }


async def list_campaigns(
    kc: KeitaroClient, session: AsyncSession, only_mine: bool, q: str, interval: str = "today", refresh: bool = False
) -> list[dict]:
    mine = await my_campaign_ids(session)
    drafts = await campaigns_with_draft(session)
    q = q.strip().lower()
    items = []
    for c in sorted(await kc.list_campaigns(), key=lambda c: c["id"], reverse=True):
        if only_mine and c["id"] not in mine:
            continue
        if q and q not in str(c["id"]) and q not in c["name"].lower() and q not in (c.get("alias") or "").lower():
            continue
        items.append(map_campaign(c, mine))
    if not items:
        return items

    sem = asyncio.Semaphore(STREAMS_CONCURRENCY)
    rows, offers, *streams = await asyncio.gather(
        kc.build_campaigns_report(interval, get_settings().REPORT_TIMEZONE),
        refs.offers(kc),
        *(_cached_streams(kc, item["id"], sem, refresh) for item in items),
    )
    await dns.attach_domain_status(items)
    stats = {int(r["campaign_id"]): row_stats(r) for r in rows if r.get("campaign_id") is not None}
    names = {o["id"]: o["name"] for o in offers}
    for item, st in zip(items, streams):
        item["stats"] = stats.get(item["id"], ZERO)
        item["has_draft"] = item["id"] in drafts
        if st is not None:
            item.update(summarize_streams(st, names))
    return items
