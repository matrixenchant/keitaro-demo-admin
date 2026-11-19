from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CreatedCampaign(Base):
    __tablename__ = "created_campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    keitaro_campaign_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    alias: Mapped[str] = mapped_column(String(64))
    geo: Mapped[list[str]] = mapped_column(JSON)
    offer_id: Mapped[int] = mapped_column(Integer)
    domain_id: Mapped[int] = mapped_column(Integer)
    group_id: Mapped[int] = mapped_column(Integer)
    traffic_source_id: Mapped[int] = mapped_column(Integer)
    geo_stream_id: Mapped[int] = mapped_column(Integer)
    offers_stream_id: Mapped[int] = mapped_column(Integer)
    tracking_url: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OfferChange(Base):
    __tablename__ = "offer_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    keitaro_campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    stream_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(20))  # add | remove | restore | pin | unpin | set_shares | publish | discard | sync
    offer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares_before: Mapped[dict] = mapped_column(JSON)  # {offer_id: share}
    shares_after: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    summary: Mapped[str | None] = mapped_column(String(300), nullable=True)  # для sync


class TrackedStream(Base):
    """Поток кампании, подтянутый из Keitaro в нашу БД (основа черновика)."""

    __tablename__ = "tracked_streams"

    id: Mapped[int] = mapped_column(primary_key=True)
    keitaro_campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    keitaro_stream_id: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    type: Mapped[str] = mapped_column(String(32))
    schema: Mapped[str] = mapped_column(String(32), default="")
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_offers: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # filters, action_type, action_payload, state
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    offers: Mapped[list["StreamOffer"]] = relationship(
        back_populates="stream", order_by="StreamOffer.id", lazy="selectin", cascade="all, delete-orphan"
    )


class StreamOffer(Base):
    __tablename__ = "stream_offers"
    __table_args__ = (UniqueConstraint("stream_id", "offer_id", name="uq_stream_offer"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    stream_id: Mapped[int] = mapped_column(ForeignKey("tracked_streams.id", ondelete="CASCADE"))
    offer_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    accessible: Mapped[bool] = mapped_column(Boolean, default=True)
    share: Mapped[int] = mapped_column(Integer, default=0)  # значение черновика
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(10), default="active")  # active | removed
    kt_present: Mapped[bool] = mapped_column(Boolean, default=False)  # оффер есть в Keitaro (по последнему sync/publish)
    kt_share: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kt_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # возвращён из архива, но ещё не опубликован: «Отменить» вернёт его в архив, а не удалит
    restored: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    stream: Mapped[TrackedStream] = relationship(back_populates="offers")
