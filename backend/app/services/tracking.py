"""Локальное зеркало потоков Keitaro: синхронизация и вычисление статуса черновика."""
from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StreamOffer, TrackedStream


def pending(o: StreamOffer) -> str | None:
    if o.status == "active":
        if not o.kt_present:
            return "added"
        return "changed" if o.share != o.kt_share else None
    return "removed" if o.kt_present else None


def is_archived(o: StreamOffer) -> bool:
    return o.status == "removed" and not o.kt_present


def stream_dirty(ts: TrackedStream) -> bool:
    return any(pending(o) for o in ts.offers)


def aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


async def campaign_streams(session: AsyncSession, campaign_id: int) -> list[TrackedStream]:
    q = select(TrackedStream).where(TrackedStream.keitaro_campaign_id == campaign_id).order_by(TrackedStream.id)
    return list((await session.scalars(q)).all())


async def campaigns_with_draft(session: AsyncSession) -> set[int]:
    q = (
        select(TrackedStream.keitaro_campaign_id)
        .join(StreamOffer, StreamOffer.stream_id == TrackedStream.id)
        .where(
            or_(
                and_(StreamOffer.status == "active", StreamOffer.kt_present.is_(False)),
                and_(StreamOffer.status == "removed", StreamOffer.kt_present.is_(True)),
                and_(StreamOffer.status == "active", StreamOffer.kt_present.is_(True), StreamOffer.share != StreamOffer.kt_share),
            )
        )
        .distinct()
    )
    return set((await session.scalars(q)).all())


def _meta(ks: dict) -> dict:
    return {
        "filters": ks.get("filters") or [],
        "action_type": ks.get("action_type"),
        "action_payload": ks.get("action_payload"),
        "state": ks.get("state"),
    }


def _snapshot(streams: list[TrackedStream]) -> dict:
    return {
        (s.keitaro_stream_id, o.offer_id): (o.status, o.share, o.kt_present, o.kt_share)
        for s in streams
        for o in s.offers
    } | {(s.keitaro_stream_id, None): None for s in streams}


async def apply_sync(
    session: AsyncSession, campaign_id: int, current: list[TrackedStream], kt_streams: list[dict], names: dict[int, str]
) -> str | None:
    """Приводит локальные потоки в соответствие с Keitaro (без commit). Возвращает сводку изменений или None."""
    before = _snapshot(current)
    now = datetime.now(timezone.utc)
    local = {s.keitaro_stream_id: s for s in current}
    kt_ids = {ks["id"] for ks in kt_streams}
    for sid, ts in local.items():
        if sid not in kt_ids:
            await session.delete(ts)
    result = [s for sid, s in local.items() if sid in kt_ids]

    for ks in kt_streams:
        offers = ks.get("offers") or []
        ts = local.get(ks["id"])
        if ts is None:
            ts = TrackedStream(keitaro_campaign_id=campaign_id, keitaro_stream_id=ks["id"], offers=[])
            session.add(ts)
            result.append(ts)
        ts.name = ks.get("name") or ""
        ts.type = ks["type"]
        ts.schema = ks.get("schema") or ""
        ts.position = ks.get("position")
        ts.has_offers = ks.get("schema") == "landings" or bool(offers)
        ts.meta = _meta(ks)
        ts.synced_at = now

        rows = {o.offer_id: o for o in ts.offers}
        seen: set[int] = set()
        for ko in offers:
            oid = ko["offer_id"]
            seen.add(oid)
            row = rows.get(oid)
            if row is None:
                row = StreamOffer(offer_id=oid, pinned=False, name=None, accessible=False)
                ts.offers.append(row)
            row.kt_present = True
            row.kt_share = ko.get("share", 0)
            row.kt_state = ko.get("state")
            row.status = "active"
            row.share = row.kt_share
            row.restored = False
            if names.get(oid) is not None:
                row.name, row.accessible = names[oid], True
        for oid, row in list(rows.items()):
            if oid in seen:
                continue
            if row.status == "active" and not row.kt_present and not row.restored:
                ts.offers.remove(row)  # неопубликованное добавление: черновик сбрасывается
                continue
            row.kt_present, row.kt_share, row.status, row.share, row.pinned = False, None, "removed", 0, False
            row.restored = False

    after = _snapshot(result)
    if before == after:
        return None
    added = len([k for k in after.keys() - before.keys() if k[1] is not None])
    archived = sum(1 for k, v in after.items() if v and v[0] == "removed" and not v[2] and (k not in before or before[k][0] != "removed" or before[k][2]))
    parts = []
    if added:
        parts.append(f"новых офферов: {added}")
    if archived:
        parts.append(f"в архив: {archived}")
    new_streams = len({k[0] for k in after if k[1] is None} - {k[0] for k in before if k[1] is None})
    gone = len({k[0] for k in before if k[1] is None} - {k[0] for k in after if k[1] is None})
    if new_streams:
        parts.append(f"новых потоков: {new_streams}")
    if gone:
        parts.append(f"удалено потоков: {gone}")
    return ", ".join(parts) or "доли обновлены"
