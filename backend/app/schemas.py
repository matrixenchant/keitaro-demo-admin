from datetime import datetime
from typing import Annotated, Any

import pycountry
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# Интервалы, которые пробрасываются в отчёт Keitaro
INTERVALS = ("today", "yesterday", "7_days_ago", "first_day_of_this_week", "1_month_ago", "all_time")


class Ref(BaseModel):
    id: int
    name: str | None = None


class OfferRef(BaseModel):
    id: int
    name: str
    state: str | None = None
    country: list[str] = []


class Country(BaseModel):
    code: str
    name: str


class Defaults(BaseModel):
    domain: Ref
    group: Ref
    source: Ref


class CampaignCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    geo: list[str] = Field(min_length=1)
    offer_id: int
    domain_id: int | None = None
    group_id: int | None = None
    traffic_source_id: int | None = None

    @field_validator("geo", mode="before")
    @classmethod
    def _normalize_geo(cls, v: Any) -> list[str]:
        items = v.replace(";", ",").replace(" ", ",").split(",") if isinstance(v, str) else v
        if not isinstance(items, list):
            raise ValueError("geo: ожидается список кодов или строка через запятую")
        codes = list(dict.fromkeys(str(c).strip().upper() for c in items if str(c).strip()))
        if not codes:
            raise ValueError("geo: нужен хотя бы один код страны")
        bad = [c for c in codes if len(c) != 2 or pycountry.countries.get(alpha_2=c) is None]
        if bad:
            raise ValueError(f"geo: неизвестные коды стран: {', '.join(bad)}")
        return codes


class Stats(BaseModel):
    clicks: int = 0
    unique: int = 0
    bots: int = 0


class DomainStatus(BaseModel):
    host: str
    resolves: bool
    error: str | None = None
    checked_at: datetime


class CampaignOut(BaseModel):
    id: int
    name: str
    alias: str | None = None
    state: str | None = None
    group: str | None = None
    domain: str | None = None
    tracking_url: str | None = None
    working_url: str | None = None
    domain_status: DomainStatus | None = None
    created_here: bool = False
    created_at: str | None = None


class OfferBrief(BaseModel):
    id: int
    name: str
    accessible: bool = True


class CampaignListItem(CampaignOut):
    geo: list[str] = []
    offers: list[OfferBrief] = []
    streams_count: int | None = None  # None — потоки не удалось загрузить
    has_draft: bool = False
    stats: Stats = Stats()


class FilterOut(BaseModel):
    name: str
    mode: str | None = None
    payload: Any = None


class StreamOfferOut(BaseModel):
    offer_id: int
    name: str
    accessible: bool = True
    share: int
    state: str | None = None
    pinned: bool = False
    status: str = "active"  # active | removed
    pending: str | None = None  # added | removed | changed
    published: bool = True
    published_share: int | None = None
    stats: Stats = Stats()


class StreamOut(BaseModel):
    id: int
    name: str
    type: str
    schema_: str = Field(alias="schema", serialization_alias="schema")
    position: int | None = None
    state: str | None = None
    action_payload: str | None = None
    filters: list[FilterOut] = []
    editable: bool
    has_offers: bool = False
    dirty: bool = False
    synced_at: datetime | None = None
    kt_drift: bool = False  # в Keitaro есть изменения, которых нет в нашем снимке
    stats: Stats = Stats()
    offers: list[StreamOfferOut] = []

    model_config = ConfigDict(populate_by_name=True)


class CampaignDetail(BaseModel):
    campaign: CampaignOut
    streams: list[StreamOut]
    totals: Stats
    dirty: bool = False
    synced_at: datetime | None = None
    kt_drift: bool = False  # в Keitaro есть изменения, которых нет в нашем снимке


class CampaignCreated(BaseModel):
    campaign: CampaignOut
    streams: list[StreamOut]
    tracking_url: str
    working_url: str | None = None


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    keitaro_campaign_id: int
    name: str
    alias: str
    geo: list[str]
    offer_id: int
    domain_id: int
    group_id: int
    traffic_source_id: int
    geo_stream_id: int
    offers_stream_id: int
    tracking_url: str
    created_at: datetime


class ChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    keitaro_campaign_id: int
    stream_id: int
    action: str
    offer_id: int | None
    shares_before: dict[str, int]
    shares_after: dict[str, int]
    summary: str | None = None
    created_at: datetime


class AddOfferBody(BaseModel):
    offer_id: int


class ShareItem(BaseModel):
    offer_id: int
    share: int


class SetSharesBody(BaseModel):
    shares: list[ShareItem]
    pinned: list[int] | None = None


class PinBody(BaseModel):
    pinned: bool
