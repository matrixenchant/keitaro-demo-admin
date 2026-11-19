import pytest

from app.services import campaigns as svc


@pytest.fixture
def setup(fake):
    for cid, name in ((7, "Alpha MX"), (8, "Beta"), (9, "Gamma")):
        fake.campaigns[cid] = {"id": cid, "name": name, "alias": f"a{cid}", "domain": "https://kylovoa.com/", "state": "active"}
    fake.streams[1] = {"id": 1, "campaign_id": 7, "type": "regular", "name": "Flow 1", "position": 1,
                       "schema": "redirect", "state": "active", "offers": [],
                       "filters": [{"name": "country", "mode": "accept", "payload": ["MX", "au"]}]}
    fake.streams[2] = {"id": 2, "campaign_id": 7, "type": "regular", "name": "Flow 2", "position": 2,
                       "schema": "landings", "state": "active",
                       "filters": [{"name": "country", "mode": "reject", "payload": ["RU"]},
                                   {"name": "country", "mode": "accept", "payload": ["MX", "RO"]}],
                       "offers": [{"offer_id": 18813, "share": 50}, {"offer_id": 555, "share": 50}]}
    fake.streams[3] = {"id": 3, "campaign_id": 7, "type": "regular", "name": "Old", "position": 3,
                       "schema": "landings", "state": "deleted",
                       "filters": [{"name": "country", "mode": "accept", "payload": ["DE"]}],
                       "offers": [{"offer_id": 18814, "share": 100}]}
    # офферы в потоке не-landings в список не попадают
    fake.streams[4] = {"id": 4, "campaign_id": 8, "type": "default", "name": "Act", "position": 1,
                       "schema": "action", "state": "active", "filters": [], "offers": [{"offer_id": 18814, "share": 100}]}
    fake.report[("campaign_id",)] = [
        {"campaign_id": 7, "clicks": 10, "campaign_unique_clicks": 6, "bots": 2},
        {"campaign_id": "9", "clicks": 3, "campaign_unique_clicks": None, "bots": 0},
        {"campaign_id": 4242, "clicks": 99, "campaign_unique_clicks": 99, "bots": 99},
    ]
    return fake


async def test_list_enriched(client, setup):
    r = await client.get("/api/campaigns", params={"interval": "all_time"})
    assert r.status_code == 200, r.text
    by_id = {c["id"]: c for c in r.json()}
    assert list(by_id) == [9, 8, 7]

    a = by_id[7]
    assert a["geo"] == ["MX", "AU", "RO"]  # accept, без дублей, deleted-поток и reject не учитываются
    assert a["offers"] == [{"id": 18813, "name": "Offer A", "accessible": True}, {"id": 555, "name": "Оффер #555", "accessible": False}]
    assert a["streams_count"] == 2
    assert a["stats"] == {"clicks": 10, "unique": 6, "bots": 2}
    assert a["tracking_url"] == "https://kylovoa.com/a7" and a["created_here"] is False

    assert by_id[8]["geo"] == [] and by_id[8]["offers"] == [] and by_id[8]["streams_count"] == 1
    assert by_id[8]["stats"] == {"clicks": 0, "unique": 0, "bots": 0}
    assert by_id[9]["streams_count"] == 0
    assert by_id[9]["stats"] == {"clicks": 3, "unique": 0, "bots": 0}

    # один отчёт на весь список, с переданным интервалом
    assert [c for c in setup.calls if c[0] == "campaigns_report"] == [("campaigns_report", "all_time", "Europe/Moscow")]


async def test_list_interval_validation_and_q(client, setup):
    assert (await client.get("/api/campaigns", params={"interval": "bogus"})).status_code == 422
    r = await client.get("/api/campaigns", params={"q": "alpha"})
    assert [c["id"] for c in r.json()] == [7]
    assert setup.stream_fetches == [7]  # потоки запрашиваются только для отфильтрованных
    assert ("campaigns_report", "today", "Europe/Moscow") in setup.calls


async def test_empty_list_makes_no_report(client, fake):
    assert (await client.get("/api/campaigns")).json() == []
    assert fake.calls == [] and fake.stream_fetches == []


async def test_streams_cached_with_ttl(client, setup, monkeypatch):
    await client.get("/api/campaigns")
    await client.get("/api/campaigns", params={"interval": "yesterday"})
    assert sorted(setup.stream_fetches) == [7, 8, 9]  # второй запрос — из кэша
    assert len([c for c in setup.calls if c[0] == "campaigns_report"]) == 2  # статистика не кэшируется

    monkeypatch.setattr(svc, "STREAMS_TTL", 0.0)
    await client.get("/api/campaigns")
    assert sorted(setup.stream_fetches) == [7, 7, 8, 8, 9, 9]


async def test_refresh_bypasses_and_updates_cache(client, setup):
    await client.get("/api/campaigns")
    setup.streams[2]["offers"] = [{"offer_id": 18814, "share": 100}]  # правка мимо админки, в самом Keitaro
    setup.stream_fetches.clear()

    stale = (await client.get("/api/campaigns")).json()
    assert [o["id"] for o in stale[2]["offers"]] == [18813, 555] and setup.stream_fetches == []

    fresh = (await client.get("/api/campaigns", params={"refresh": "true"})).json()
    assert [o["id"] for o in fresh[2]["offers"]] == [18814]
    assert sorted(setup.stream_fetches) == [7, 8, 9]

    setup.stream_fetches.clear()  # свежий ответ лёг в кэш
    again = (await client.get("/api/campaigns")).json()
    assert [o["id"] for o in again[2]["offers"]] == [18814] and setup.stream_fetches == []


async def test_cache_invalidated_by_editor_mutation(client, setup):
    assert [o["id"] for o in (await client.get("/api/campaigns")).json()[2]["offers"]] == [18813, 555]
    r = await client.post("/api/campaigns/7/streams/2/offers", json={"offer_id": 18814})
    assert r.status_code == 200, r.text
    lst = (await client.get("/api/campaigns")).json()
    assert [o["id"] for o in lst[2]["offers"]] == [18813, 555] and lst[2]["has_draft"] is True  # черновик Keitaro не меняет
    assert lst[0]["has_draft"] is False
    setup.streams[2]["offers"] = [{"offer_id": 18813, "share": 50}, {"offer_id": 555, "share": 50}]
    r = await client.post("/api/campaigns/7/streams/2/publish")
    assert r.status_code == 200, r.text
    setup.stream_fetches.clear()
    lst = (await client.get("/api/campaigns")).json()
    assert [o["id"] for o in lst[2]["offers"]] == [18813, 555, 18814] and lst[2]["has_draft"] is False
    assert 8 not in setup.stream_fetches and 9 not in setup.stream_fetches  # чужие записи кэша не тронуты


async def test_created_campaign_appears_enriched(client, setup):
    await client.get("/api/campaigns")
    r = await client.post("/api/campaigns", json={"name": "New", "geo": ["US", "DE"], "offer_id": 18813})
    assert r.status_code == 201, r.text
    first = (await client.get("/api/campaigns", params={"only_mine": True})).json()
    assert len(first) == 1
    assert first[0]["geo"] == ["US", "DE"] and first[0]["offers"] == [{"id": 18813, "name": "Offer A", "accessible": True}]
    assert first[0]["streams_count"] == 2 and first[0]["created_here"] is True and first[0]["has_draft"] is False


async def test_streams_failure_is_isolated_and_not_cached(client, setup):
    setup.fail_streams_for = {7}
    by_id = {c["id"]: c for c in (await client.get("/api/campaigns")).json()}
    assert by_id[7]["streams_count"] is None and by_id[7]["geo"] == [] and by_id[7]["offers"] == []
    assert by_id[7]["stats"]["clicks"] == 10  # статистика при этом есть
    assert by_id[8]["streams_count"] == 1

    setup.fail_streams_for = set()
    by_id = {c["id"]: c for c in (await client.get("/api/campaigns")).json()}
    assert by_id[7]["streams_count"] == 2 and by_id[7]["geo"] == ["MX", "AU", "RO"]


async def test_concurrency_is_bounded(client, setup, monkeypatch):
    import asyncio

    for cid in range(100, 130):
        setup.campaigns[cid] = {"id": cid, "name": f"C{cid}", "alias": None, "state": "active"}
    monkeypatch.setattr(svc, "STREAMS_CONCURRENCY", 4)
    active = peak = 0
    orig = setup.list_streams

    async def slow(campaign_id):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        try:
            return await orig(campaign_id)
        finally:
            active -= 1

    setup.list_streams = slow
    assert len((await client.get("/api/campaigns")).json()) == 33
    assert 1 < peak <= 4


async def test_fetch_started_before_invalidation_is_not_cached(client, setup):
    orig = setup.list_streams

    async def racy(campaign_id):
        data = await orig(campaign_id)
        if campaign_id == 7:
            svc.invalidate_streams(7)  # правка в редакторе пришлась на время запроса потоков
        return data

    setup.list_streams = racy
    await client.get("/api/campaigns")
    setup.list_streams = orig
    setup.stream_fetches.clear()
    await client.get("/api/campaigns")
    assert setup.stream_fetches == [7]
