import asyncio
from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.keitaro.client import KeitaroClient
from app.models import OfferChange, StreamOffer, TrackedStream
from app.services import dns, refs
from app.services import shares as sh
from app.services.campaigns import invalidate_streams, map_campaign, map_stream, my_campaign_ids, sort_streams
from app.services.campaigns import row_stats as _stats
from app.services.tracking import apply_sync, aware, campaign_streams, stream_dirty

DRAFT_MSG = "Есть неопубликованные изменения"


def _log(session: AsyncSession, campaign_id: int, stream_id: int, action: str, offer_id: int | None,
         before: dict[int, int], after: dict[int, int], summary: str | None = None) -> None:
    session.add(
        OfferChange(
            keitaro_campaign_id=campaign_id, stream_id=stream_id, action=action, offer_id=offer_id,
            shares_before={str(k): v for k, v in before.items()},
            shares_after={str(k): v for k, v in after.items()},
            summary=summary,
        )
    )


# ---------- синхронизация ----------


async def sync_campaign(kc: KeitaroClient, session: AsyncSession, campaign_id: int, force: bool = False) -> None:
    current = await campaign_streams(session, campaign_id)
    if not force and any(stream_dirty(s) for s in current):
        raise HTTPException(409, DRAFT_MSG)
    kt_streams, offers = await asyncio.gather(kc.list_streams(campaign_id), refs.offers(kc))
    summary = await apply_sync(session, campaign_id, current, kt_streams, {o["id"]: o["name"] for o in offers})
    if summary:
        _log(session, campaign_id, 0, "sync", None, {}, {}, summary)
    await session.commit()
    invalidate_streams(campaign_id)


async def ensure_synced(kc: KeitaroClient, session: AsyncSession, campaign_id: int) -> list[TrackedStream]:
    streams = await campaign_streams(session, campaign_id)
    if not streams:  # кампания ещё не синхронизировалась
        await sync_campaign(kc, session, campaign_id)
        streams = await campaign_streams(session, campaign_id)
    return streams


async def sync(kc, session, campaign_id: int, force: bool, interval: str = "today") -> dict:
    await kc.get_campaign(campaign_id)  # 404, если кампании нет
    await sync_campaign(kc, session, campaign_id, force)
    return await get_detail(kc, session, campaign_id, interval)


async def get_detail(kc: KeitaroClient, session: AsyncSession, campaign_id: int, interval: str) -> dict:
    tz = get_settings().REPORT_TIMEZONE
    campaign, stream_rows, offer_rows, kt_streams = await asyncio.gather(
        kc.get_campaign(campaign_id),
        kc.build_report(campaign_id, ["stream_id"], interval, tz),
        kc.build_report(campaign_id, ["stream_id", "offer_id"], interval, tz),
        kc.list_streams(campaign_id),
    )
    streams = await ensure_synced(kc, session, campaign_id)
    stream_stats = {int(r["stream_id"]): _stats(r) for r in stream_rows if r.get("stream_id") is not None}
    offer_stats = {
        (int(r["stream_id"]), int(r["offer_id"])): _stats(r)
        for r in offer_rows
        if r.get("stream_id") is not None and r.get("offer_id") is not None
    }
    totals = {k: sum(s[k] for s in stream_stats.values()) for k in ("clicks", "unique", "bots")}
    item = map_campaign(campaign, await my_campaign_ids(session))
    await dns.attach_domain_status([item])
    drift = kt_drift(streams, kt_streams)
    mapped = [map_stream(s, stream_stats, offer_stats) for s in streams]
    for m in mapped:
        m["kt_drift"] = m["id"] in drift
    return {
        "campaign": item,
        "streams": sort_streams(mapped),
        "totals": totals,
        "dirty": any(stream_dirty(s) for s in streams),
        "kt_drift": bool(drift) or bool({ks["id"] for ks in kt_streams} - {s.keitaro_stream_id for s in streams}),
        "synced_at": min((aware(s.synced_at) for s in streams), default=None),
    }


def kt_drift(streams: list[TrackedStream], kt_streams: list[dict]) -> set[int]:
    """ID потоков, которые в Keitaro уже не совпадают с нашим снимком (изменили мимо нас)."""
    by_id = {ks["id"]: ks for ks in kt_streams}
    out: set[int] = set()
    for ts in streams:
        ks = by_id.get(ts.keitaro_stream_id)
        if ks is None:  # поток удалён в Keitaro
            out.add(ts.keitaro_stream_id)
            continue
        if not ts.has_offers:
            continue
        now = {o["offer_id"]: o.get("share") for o in ks.get("offers") or []}
        known = {o.offer_id: o.kt_share for o in ts.offers if o.kt_present}
        if now != known:
            out.add(ts.keitaro_stream_id)
    return out


# ---------- черновик (запросов на запись в Keitaro нет) ----------


async def _load(kc, session, campaign_id: int, stream_id: int) -> TrackedStream:
    streams = await ensure_synced(kc, session, campaign_id)
    ts = next((s for s in streams if s.keitaro_stream_id == stream_id), None)
    if ts is None:
        raise HTTPException(404, f"Поток {stream_id} не найден в кампании {campaign_id}")
    if not ts.has_offers:
        raise HTTPException(400, "Поток не содержит офферов (схема не landings)")
    return ts


def _active(ts: TrackedStream) -> list[StreamOffer]:
    return [o for o in ts.offers if o.status == "active"]


def _shares(rows: Iterable[StreamOffer]) -> dict[int, int]:
    return {o.offer_id: o.share for o in rows}


def _find(ts: TrackedStream, offer_id: int) -> StreamOffer | None:
    return next((o for o in ts.offers if o.offer_id == offer_id), None)


def _recalc(rows: list[StreamOffer]) -> dict[int, int]:
    return sh.recalc([{"offer_id": o.offer_id, "share": o.share, "pinned": o.pinned} for o in rows])


def _apply(rows: list[StreamOffer], new: dict[int, int]) -> None:
    for o in rows:
        o.share = new[o.offer_id]


async def _done(kc, session, campaign_id: int, interval: str) -> dict:
    await session.commit()
    return await get_detail(kc, session, campaign_id, interval)


async def add_offer(kc, session, campaign_id: int, stream_id: int, offer_id: int, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    row = _find(ts, offer_id)
    if row and row.status == "active":
        raise HTTPException(409, f"Оффер {offer_id} уже есть в потоке")
    if row:  # в архиве / помечен удалённым — то же, что «Вернуть»
        return await restore_offer(kc, session, campaign_id, stream_id, offer_id, interval)
    info = await refs.ensure_offer_exists(kc, offer_id)
    before = _shares(_active(ts))
    row = StreamOffer(offer_id=offer_id, name=info["name"], accessible=info["accessible"], share=0,
                      pinned=False, status="active", kt_present=False)
    active = [*_active(ts), row]
    _apply(active, _recalc(active))  # ошибка пересчёта — до изменения потока
    ts.offers.append(row)
    _log(session, campaign_id, stream_id, "add", offer_id, before, _shares(active))
    return await _done(kc, session, campaign_id, interval)


async def remove_offer(kc, session, campaign_id: int, stream_id: int, offer_id: int, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    row = _find(ts, offer_id)
    if row is None or row.status != "active":
        raise HTTPException(404, f"Оффера {offer_id} нет в потоке")
    rest = [o for o in _active(ts) if o is not row]
    if not rest:
        raise HTTPException(400, "В потоке должен остаться хотя бы один оффер")
    new = _recalc(rest)
    before = _shares(_active(ts))
    if row.kt_present:
        row.status, row.share, row.pinned = "removed", 0, False
    elif row.restored:  # вернули из архива и передумали — обратно в архив, а не стереть
        row.status, row.share, row.pinned, row.restored = "removed", 0, False, False
    else:  # добавлен в черновике — привязку удаляем
        ts.offers.remove(row)
    _apply(rest, new)
    _log(session, campaign_id, stream_id, "remove", offer_id, before, _shares(rest))
    return await _done(kc, session, campaign_id, interval)


async def restore_offer(kc, session, campaign_id: int, stream_id: int, offer_id: int, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    row = _find(ts, offer_id)
    if row is None:
        raise HTTPException(404, f"Оффера {offer_id} нет в потоке")
    if row.status != "removed":
        raise HTTPException(409, f"Оффер {offer_id} уже активен")
    before = _shares(_active(ts))
    active = [*_active(ts), row]
    row.pinned, row.share = False, 0
    _apply(active, _recalc(active))
    row.status = "active"
    row.restored = not row.kt_present  # из архива (в Keitaro его нет)
    _log(session, campaign_id, stream_id, "restore", offer_id, before, _shares(active))
    return await _done(kc, session, campaign_id, interval)


async def set_pinned(kc, session, campaign_id: int, stream_id: int, offer_id: int, pinned: bool, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    row = _find(ts, offer_id)
    if row is None or row.status != "active":
        raise HTTPException(404, f"Активного оффера {offer_id} нет в потоке")
    if row.pinned != pinned:
        row.pinned = pinned
        cur = _shares(_active(ts))
        _log(session, campaign_id, stream_id, "pin" if pinned else "unpin", offer_id, cur, cur)
    return await _done(kc, session, campaign_id, interval)


async def set_shares(kc, session, campaign_id: int, stream_id: int, shares: list[tuple[int, int]],
                     pinned: list[int] | None = None, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    active = _active(ts)
    new = sh.set_shares([o.offer_id for o in active], shares)
    if pinned is not None and not set(pinned) <= set(new):
        raise HTTPException(422, "Закреплять можно только активные офферы потока")
    before = _shares(active)
    _apply(active, new)
    if pinned is not None:
        for o in active:
            o.pinned = o.offer_id in pinned
    _log(session, campaign_id, stream_id, "set_shares", None, before, new)
    return await _done(kc, session, campaign_id, interval)


async def discard(kc, session, campaign_id: int, stream_id: int, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    before = _shares(_active(ts))
    for o in list(ts.offers):
        if o.status == "active" and not o.kt_present:
            if o.restored:  # возвращён из архива — обратно в архив
                o.status, o.share, o.pinned, o.restored = "removed", 0, False, False
            else:  # добавлен в черновике — привязку удаляем
                ts.offers.remove(o)
        elif o.kt_present:
            o.status, o.share = "active", o.kt_share or 0
    _log(session, campaign_id, stream_id, "discard", None, before, _shares(_active(ts)))
    return await _done(kc, session, campaign_id, interval)


async def publish(kc, session, campaign_id: int, stream_id: int, interval: str = "today") -> dict:
    ts = await _load(kc, session, campaign_id, stream_id)
    active = _active(ts)
    if not active:
        raise HTTPException(400, "В потоке должен остаться хотя бы один оффер")
    if sum(o.share for o in active) != 100:
        raise HTTPException(422, "Сумма долей должна быть ровно 100")
    if not stream_dirty(ts):
        raise HTTPException(400, "Нет изменений для публикации")

    # конфликт: поток в Keitaro изменили мимо нас
    ks = next((s for s in await kc.list_streams(campaign_id) if s["id"] == stream_id), None)
    kt_now = {o["offer_id"]: o.get("share") for o in (ks or {}).get("offers") or []}
    kt_known = {o.offer_id: o.kt_share for o in ts.offers if o.kt_present}
    if ks is None or kt_now != kt_known:
        raise HTTPException(409, "Поток изменился в Keitaro — подтяните изменения")

    payload = [{"offer_id": o.offer_id, "share": o.share, "state": o.kt_state or "active"} for o in active]
    try:
        await kc.update_stream(stream_id, {"offers": payload})
    finally:
        invalidate_streams(campaign_id)  # кэш списка кампаний устарел (в т.ч. при неясном исходе запроса)

    for o in ts.offers:
        o.restored = False
        if o.status == "active":
            o.kt_present, o.kt_share = True, o.share
        else:
            o.kt_present, o.kt_share = False, None
    _log(session, campaign_id, stream_id, "publish", None, kt_known, _shares(active))
    return await _done(kc, session, campaign_id, interval)


async def list_changes(session: AsyncSession, campaign_id: int) -> list[OfferChange]:
    q = select(OfferChange).where(OfferChange.keitaro_campaign_id == campaign_id).order_by(OfferChange.id.desc())
    return list((await session.scalars(q)).all())
