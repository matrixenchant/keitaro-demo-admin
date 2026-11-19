import pytest

GEO_BODY = {"name": "  My camp ", "geo": ["us", "de", "US"], "offer_id": 18813}


async def test_create_happy_path(client, fake):
    r = await client.post("/api/campaigns", json=GEO_BODY)
    assert r.status_code == 201, r.text
    data = r.json()

    camp_call = fake.calls[0][1]
    alias = camp_call.pop("alias")
    assert len(alias) == 10
    assert camp_call == {
        "name": "test_kuznetsov_My camp", "type": "position", "domain_id": 5, "group_id": 10332,
        "traffic_source_id": 836, "cost_type": "CPC", "state": "active",
    }
    cid = data["campaign"]["id"]
    s1, s2 = fake.calls[1][1], fake.calls[2][1]
    assert s1 == {
        "campaign_id": cid, "type": "regular", "name": "Flow 1", "position": 1, "schema": "redirect",
        "action_type": "http", "action_payload": "https://google.com",
        "filters": [{"name": "country", "mode": "accept", "payload": ["US", "DE"]}],
    }
    assert s2 == {
        "campaign_id": cid, "type": "regular", "name": "Flow 2", "position": 2, "schema": "landings",
        "action_type": "http", "offers": [{"offer_id": 18813, "share": 100, "state": "active"}],
    }
    assert data["tracking_url"] == f"https://kylovoa.com/{alias}"
    assert [s["name"] for s in data["streams"]] == ["Flow 1", "Flow 2"]
    assert data["streams"][1]["editable"] is True and data["streams"][0]["editable"] is False

    hist = (await client.get("/api/campaigns/history")).json()
    assert len(hist) == 1 and hist[0]["keitaro_campaign_id"] == cid and hist[0]["geo"] == ["US", "DE"]

    lst = (await client.get("/api/campaigns")).json()
    assert lst[0]["id"] == cid and lst[0]["created_here"] is True


@pytest.mark.parametrize("fail_at", [1, 2])
async def test_rollback_on_stream_failure(client, fake, fail_at):
    fake.fail_stream_number = fail_at
    r = await client.post("/api/campaigns", json=GEO_BODY)
    assert r.status_code == 502
    assert r.json()["detail"] == "Keitaro: stream boom"
    assert any(c[0] == "delete_campaign" for c in fake.calls)
    assert fake.campaigns == {}
    assert (await client.get("/api/campaigns/history")).json() == []


@pytest.mark.parametrize("geo", [["XX"], [], "", ["USA"], ["US", "ZZ"]])
async def test_geo_validation(client, fake, geo):
    r = await client.post("/api/campaigns", json={**GEO_BODY, "geo": geo})
    assert r.status_code == 422
    assert fake.calls == []


async def test_geo_comma_string(client, fake):
    r = await client.post("/api/campaigns", json={**GEO_BODY, "geo": "us, de"})
    assert r.status_code == 201
    assert fake.calls[1][1]["filters"][0]["payload"] == ["US", "DE"]


async def test_unknown_offer_422(client, fake):
    r = await client.post("/api/campaigns", json={**GEO_BODY, "offer_id": 1})
    assert r.status_code == 422
    assert fake.calls == []


async def test_blank_name_422(client):
    assert (await client.post("/api/campaigns", json={**GEO_BODY, "name": "   "})).status_code == 422


async def test_refs(client):
    d = (await client.get("/api/refs/defaults")).json()
    assert d["domain"]["id"] == 5 and d["group"] == {"id": 10332, "name": "FORTESTS"} and d["source"]["id"] == 836
    offers = (await client.get("/api/refs/offers", params={"q": "offer"})).json()
    assert [o["id"] for o in offers] == [18813, 18814, 18815]
    assert [o["id"] for o in (await client.get("/api/refs/offers", params={"q": "1881"})).json()][:1] == [18813]
    countries = (await client.get("/api/refs/countries")).json()
    assert {"code": "AU", "name": "Australia"} in countries
    assert (await client.get("/api/health")).json() == {"status": "ok"}


async def test_prefix_not_duplicated(client, fake):
    r = await client.post("/api/campaigns", json={**GEO_BODY, "name": "test_kuznetsov_campaign1"})
    assert r.status_code == 201, r.text
    assert fake.calls[0][1]["name"] == "test_kuznetsov_campaign1"
    assert r.json()["campaign"]["name"] == "test_kuznetsov_campaign1"


async def test_public_config(client):
    r = await client.get("/api/config")
    assert r.status_code == 200 and r.json() == {"name_prefix": "test_kuznetsov_"}


@pytest.mark.parametrize("raw,expected", [
    ("campaign1", "test_kuznetsov_campaign1"),
    ("  campaign1 ", "test_kuznetsov_campaign1"),
    ("test_kuznetsov_x", "test_kuznetsov_x"),
])
def test_with_prefix(raw, expected):
    from app.services.campaigns import with_prefix
    assert with_prefix(raw, "test_kuznetsov_") == expected


async def test_create_with_forbidden_offer(client, fake):
    fake.forbidden_offers.add(13333)
    r = await client.post("/api/campaigns", json={**GEO_BODY, "offer_id": 13333})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["streams"][1]["offers"][0]["accessible"] is False
    assert data["working_url"] == f"https://keitaro.test/{data['campaign']['alias']}"
    assert data["campaign"]["domain_status"]["resolves"] is True


async def test_list_domain_status_unique_hosts(client, fake, dns_failing):
    dns_failing.add("kylovoa.com")
    await client.post("/api/campaigns", json=GEO_BODY)
    await client.post("/api/campaigns", json=GEO_BODY)
    items = (await client.get("/api/campaigns")).json()
    assert len(items) == 2
    assert all(i["domain_status"]["resolves"] is False and i["working_url"] for i in items)


async def test_keitaro_status_ok_and_down(client, fake):
    from app import main
    main._status_cache.update(at=0.0, value=None)
    r = (await client.get("/api/status")).json()
    assert r["ok"] is True and r["host"] and r["error"] is None

    async def boom():
        raise RuntimeError("down")
    fake.list_traffic_sources = boom
    main._status_cache.update(at=0.0, value=None)
    r = (await client.get("/api/status")).json()
    assert r["ok"] is False and r["error"] == "RuntimeError"
    main._status_cache.update(at=0.0, value=None)


async def test_create_stores_synced_rows_without_draft(client, fake):
    r = await client.post("/api/campaigns", json={"name": "N", "geo": ["US"], "offer_id": 18813})
    assert r.status_code == 201, r.text
    cid = r.json()["campaign"]["id"]
    off = r.json()["streams"][1]["offers"][0]
    assert (off["pending"], off["published"], off["share"], off["name"]) == (None, True, 100, "Offer A")
    fake.calls.clear()
    d = (await client.get(f"/api/campaigns/{cid}")).json()  # без авто-синка: строки уже в БД
    assert d["dirty"] is False and d["synced_at"] and len(d["streams"]) == 2
    assert fake.stream_fetches.count(cid) == 1  # только сверка с Keitaro, авто-синка нет
    assert d["kt_drift"] is False
    assert not [c for c in (await client.get(f"/api/campaigns/{cid}/changes")).json() if c["action"] == "sync"]


async def test_offer_by_id_lookup(client, fake):
    fake.forbidden_offers.add(13333)
    r = await client.get("/api/refs/offers/18813")
    assert r.status_code == 200 and r.json() == {"id": 18813, "name": "Offer A", "accessible": True}
    r = await client.get("/api/refs/offers/13333")
    assert r.status_code == 200 and r.json() == {"id": 13333, "name": None, "accessible": False}
    r = await client.get("/api/refs/offers/999999")
    assert r.status_code == 404 and "не найден" in r.json()["detail"]
    assert (await client.get("/api/refs/offers/0")).status_code == 422
