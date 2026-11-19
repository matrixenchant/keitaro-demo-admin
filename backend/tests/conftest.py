import os

# Настройки нужны до импорта app (engine создаётся при импорте db)
os.environ.setdefault("KEITARO_API_KEY", "test-key")
os.environ.setdefault("KEITARO_HOST", "https://keitaro.test")

import copy  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.db import Base, get_session  # noqa: E402
from app.keitaro.client import KeitaroError, get_keitaro  # noqa: E402
from app.main import app  # noqa: E402
from app.services import campaigns as campaigns_svc  # noqa: E402
from app.services import dns as dns_svc  # noqa: E402
from app.services import refs  # noqa: E402


class FakeKeitaro:
    """In-memory реализация интерфейса KeitaroClient."""

    def __init__(self) -> None:
        self.campaigns: dict[int, dict] = {}
        self.streams: dict[int, dict] = {}
        self.offers = [
            {"id": 18813, "name": "Offer A", "state": "active", "country": ["US"]},
            {"id": 18814, "name": "Offer B", "state": "active", "country": []},
            {"id": 18815, "name": "Offer C", "state": "disabled", "country": []},
        ]
        self.domains = [{"id": 5, "name": "kylovoa.com", "state": "active"}]
        self.groups = [{"id": 10332, "name": "FORTESTS", "type": "campaigns"}]
        self.sources = [{"id": 836, "name": "FORTESTS", "state": "active"}]
        self.report: dict[tuple, list[dict]] = {}
        self.calls: list[tuple] = []
        self.fail_stream_number: int | None = None  # на каком по счёту create_stream падать
        self.stream_fetches: list[int] = []  # отдельно от calls: там только запись и отчёты
        self.fail_streams_for: set[int] = set()
        self.forbidden_offers: set[int] = set()  # есть в Keitaro, но не читаются ключом (403)
        self.hidden_offers: set[int] = set()  # нет в /offers, но get_offer -> 200
        self._next = 1000
        self._stream_creates = 0

    def _id(self) -> int:
        self._next += 1
        return self._next

    async def list_campaigns(self):
        return copy.deepcopy(list(self.campaigns.values()))

    async def get_campaign(self, campaign_id):
        if campaign_id not in self.campaigns:
            raise KeitaroError(404, "Campaign not found")
        return copy.deepcopy(self.campaigns[campaign_id])

    async def create_campaign(self, payload):
        self.calls.append(("create_campaign", payload))
        cid = self._id()
        self.campaigns[cid] = {
            "id": cid, "alias": payload["alias"], "name": payload["name"], "state": "active",
            "group": "FORTESTS", "domain": "https://kylovoa.com/", "created_at": "2025-01-01 00:00:00",
            **{k: payload[k] for k in ("domain_id", "group_id", "traffic_source_id")},
        }
        return copy.deepcopy(self.campaigns[cid])

    async def delete_campaign(self, campaign_id):
        self.calls.append(("delete_campaign", campaign_id))
        self.campaigns.pop(campaign_id, None)

    async def list_streams(self, campaign_id):
        self.stream_fetches.append(campaign_id)
        if campaign_id in self.fail_streams_for:
            raise KeitaroError(500, "streams boom")
        return copy.deepcopy([s for s in self.streams.values() if s["campaign_id"] == campaign_id])

    async def create_stream(self, payload):
        self.calls.append(("create_stream", payload))
        self._stream_creates += 1
        if self.fail_stream_number == self._stream_creates:
            raise KeitaroError(422, "stream boom")
        sid = self._id()
        offers = [{"id": self._id(), "stream_id": sid, **o} for o in payload.get("offers", [])]
        self.streams[sid] = {"id": sid, "state": "active", "filters": [], "offers": [], **payload, "offers": offers}
        return copy.deepcopy(self.streams[sid])

    async def update_stream(self, stream_id, payload):
        self.calls.append(("update_stream", stream_id, payload))
        self.streams[stream_id]["offers"] = [{"stream_id": stream_id, **o} for o in payload["offers"]]
        return copy.deepcopy(self.streams[stream_id])

    async def get_offer(self, offer_id):
        if offer_id in self.forbidden_offers:
            raise KeitaroError(403, "no permission")
        if offer_id in self.hidden_offers:
            return {"id": offer_id, "name": f"Hidden {offer_id}"}
        raise KeitaroError(404, "Offer not found")

    async def list_offers(self):
        return copy.deepcopy(self.offers)

    async def list_domains(self):
        return self.domains

    async def list_traffic_sources(self):
        return self.sources

    async def list_groups(self, type_="campaigns"):
        return self.groups

    async def build_campaigns_report(self, interval, timezone):
        self.calls.append(("campaigns_report", interval, timezone))
        return self.report.get(("campaign_id",), [])

    async def build_report(self, campaign_id, dimensions, interval, timezone):
        self.calls.append(("report", campaign_id, tuple(dimensions), interval, timezone))
        return self.report.get(tuple(dimensions), [])


@pytest.fixture(autouse=True)
def dns_failing(monkeypatch):
    """Резолвер не ходит в сеть: по умолчанию все хосты резолвятся; хосты из множества падают."""
    dns_svc.clear_cache()
    failing: set[str] = set()

    async def _lookup(host: str) -> None:
        if host in failing:
            raise OSError("NXDOMAIN")

    monkeypatch.setattr(dns_svc, "_lookup", _lookup)
    return failing


@pytest.fixture
def fake() -> FakeKeitaro:
    return FakeKeitaro()


@pytest_asyncio.fixture
async def client(fake, tmp_path):
    refs.clear_cache()
    campaigns_svc.clear_streams_cache()
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 't.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _session():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_keitaro] = lambda: fake
    app.dependency_overrides[get_session] = _session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()
