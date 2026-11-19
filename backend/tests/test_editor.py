import pytest

CID = 7


@pytest.fixture
def setup(fake):
    fake.campaigns[CID] = {"id": CID, "name": "C", "alias": "abc", "domain": "https://kylovoa.com/", "state": "active"}
    fake.streams[1] = {"id": 1, "campaign_id": CID, "type": "default", "name": "Offers", "position": 1,
                       "schema": "landings", "state": "active", "filters": [],
                       "offers": [{"id": 11, "offer_id": 18813, "share": 100, "state": "active"}]}
    fake.streams[2] = {"id": 2, "campaign_id": CID, "type": "regular", "name": "Geo", "position": 1,
                       "schema": "redirect", "action_payload": "https://google.com", "state": "active",
                       "filters": [{"name": "country", "mode": "accept", "payload": ["US"]}], "offers": []}
    fake.streams[3] = {"id": 3, "campaign_id": 999, "type": "regular", "name": "Other", "position": 1,
                       "schema": "landings", "state": "active", "filters": [], "offers": []}
    return fake


def url(stream=1, offer=None):
    base = f"/api/campaigns/{CID}/streams/{stream}/offers"
    return f"{base}/{offer}" if offer else base


async def test_detail_with_stats(client, setup):
    setup.report[("stream_id",)] = [
        {"stream_id": 1, "clicks": 10, "campaign_unique_clicks": 6, "bots": 2},
        {"stream_id": 2, "clicks": 5, "campaign_unique_clicks": 4, "bots": 1},
    ]
    setup.report[("stream_id", "offer_id")] = [{"stream_id": 1, "offer_id": 18813, "clicks": 10, "campaign_unique_clicks": 6, "bots": 2}]
    r = await client.get(f"/api/campaigns/{CID}", params={"interval": "all_time"})
    assert r.status_code == 200
    d = r.json()
    assert [s["id"] for s in d["streams"]] == [2, 1]  # regular перед default
    assert d["totals"] == {"clicks": 15, "unique": 10, "bots": 3}
    s_off = d["streams"][1]
    assert s_off["stats"] == {"clicks": 10, "unique": 6, "bots": 2}
    assert s_off["offers"][0]["name"] == "Offer A"
    assert s_off["offers"][0]["stats"]["unique"] == 6
    assert d["streams"][0]["editable"] is False and d["streams"][0]["schema"] == "redirect"
    assert d["streams"][0]["filters"] == [{"name": "country", "mode": "accept", "payload": ["US"]}]
    assert ("report", CID, ("stream_id",), "all_time", "Europe/Moscow") in setup.calls


async def test_detail_bad_interval_and_missing(client, setup):
    assert (await client.get(f"/api/campaigns/{CID}", params={"interval": "bogus"})).status_code == 422
    assert (await client.get("/api/campaigns/12345")).status_code == 404


def updates(fake):
    return [c for c in fake.calls if c[0] == "update_stream"]


def base(stream=1):
    return f"/api/campaigns/{CID}/streams/{stream}"


async def stream_of(client, sid=1):
    d = (await client.get(f"/api/campaigns/{CID}")).json()
    return next(s for s in d["streams"] if s["id"] == sid)


def sx(d, sid=1):
    return next(x for x in d["streams"] if x["id"] == sid)


def shares_of(s, status="active"):
    return {o["offer_id"]: o["share"] for o in s["offers"] if o["status"] == status}


async def test_first_get_autosyncs(client, setup):
    d = (await client.get(f"/api/campaigns/{CID}")).json()
    s = sx(d)
    assert d["dirty"] is False and d["synced_at"] and s["dirty"] is False and s["has_offers"] is True
    o = s["offers"][0]
    assert (o["share"], o["published"], o["published_share"], o["pending"], o["pinned"], o["status"]) == (100, True, 100, None, False, "active")
    assert o["name"] == "Offer A" and o["accessible"] is True
    assert sx(d, 2)["has_offers"] is False
    assert not updates(setup)


async def test_add_is_draft_only_and_survives_refresh(client, setup):
    r = await client.post(url(), json={"offer_id": 18814})
    assert r.status_code == 200, r.text
    d = r.json()
    s = sx(d)
    assert d["dirty"] is True and s["dirty"] is True
    assert shares_of(s) == {18813: 50, 18814: 50}
    new = [o for o in s["offers"] if o["offer_id"] == 18814][0]
    assert new["pending"] == "added" and new["published"] is False
    assert [o for o in s["offers"] if o["offer_id"] == 18813][0]["pending"] == "changed"
    assert not updates(setup)
    # перезагрузка: черновик на месте, Keitaro прежний
    s2 = await stream_of(client)
    assert shares_of(s2) == {18813: 50, 18814: 50} and s2["dirty"] is True
    assert [o["share"] for o in setup.streams[1]["offers"]] == [100]
    assert (await client.get("/api/campaigns")).json()[0]["has_draft"] is True


async def test_add_validation(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    assert (await client.post(url(), json={"offer_id": 18814})).status_code == 409
    assert (await client.post(url(), json={"offer_id": 1})).status_code == 422
    assert (await client.post(url(stream=2), json={"offer_id": 18814})).status_code == 400  # redirect
    assert (await client.post(url(stream=3), json={"offer_id": 18814})).status_code == 404  # чужая кампания
    assert (await client.post(url(stream=99), json={"offer_id": 18814})).status_code == 404
    assert (await client.post(f"{base(2)}/publish")).status_code == 400
    assert not updates(setup)


async def test_publish_payload_state_and_clears_dirty(client, setup):
    setup.streams[1]["offers"][0]["state"] = "disabled"
    await client.post(url(), json={"offer_id": 18814})
    await client.post(url(), json={"offer_id": 18815})
    r = await client.post(f"{base()}/publish")
    assert r.status_code == 200, r.text
    assert updates(setup)[-1][1:] == (1, {"offers": [
        {"offer_id": 18813, "share": 34, "state": "disabled"},
        {"offer_id": 18814, "share": 33, "state": "active"},
        {"offer_id": 18815, "share": 33, "state": "active"}]})
    d = r.json()
    assert d["dirty"] is False
    s = sx(d)
    assert all(o["pending"] is None and o["published"] for o in s["offers"])
    assert [o["published_share"] for o in s["offers"]] == [34, 33, 33]
    actions = [c["action"] for c in (await client.get(f"/api/campaigns/{CID}/changes")).json()]
    assert actions[0] == "publish"
    assert (await client.post(f"{base()}/publish")).status_code == 400  # нечего публиковать


async def test_discard_deletes_added_and_restores_removed(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    await client.post(f"{base()}/publish")
    await client.post(url(), json={"offer_id": 18815})
    await client.delete(url(offer=18814))
    r = await client.post(f"{base()}/discard")
    assert r.status_code == 200
    s = sx(r.json())
    assert [(o["offer_id"], o["share"], o["status"]) for o in s["offers"]] == [(18813, 50, "active"), (18814, 50, "active")]
    assert s["dirty"] is False and r.json()["dirty"] is False
    assert len(updates(setup)) == 1  # только публикация


async def test_remove_then_publish_archives_and_restore_roundtrip(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    await client.post(f"{base()}/publish")
    r = await client.delete(url(offer=18814))
    s = sx(r.json())
    gone = [o for o in s["offers"] if o["offer_id"] == 18814][0]
    assert (gone["status"], gone["share"], gone["pending"], gone["published"]) == ("removed", 0, "removed", True)
    assert shares_of(s) == {18813: 100} and s["dirty"] is True
    await client.post(f"{base()}/publish")
    assert [o["offer_id"] for o in updates(setup)[-1][2]["offers"]] == [18813]
    assert [o["offer_id"] for o in setup.streams[1]["offers"]] == [18813]
    s = await stream_of(client)
    gone = [o for o in s["offers"] if o["offer_id"] == 18814][0]
    assert (gone["status"], gone["pending"], gone["published"]) == ("removed", None, False) and s["dirty"] is False

    r = await client.post(f"{url(offer=18814)}/restore")
    assert r.status_code == 200
    s = sx(r.json())
    assert shares_of(s) == {18813: 50, 18814: 50} and s["dirty"] is True
    assert [o for o in s["offers"] if o["offer_id"] == 18814][0]["pending"] == "added"
    await client.post(f"{base()}/publish")
    assert {o["offer_id"]: o["share"] for o in setup.streams[1]["offers"]} == {18813: 50, 18814: 50}
    assert (await client.post(f"{url(offer=18814)}/restore")).status_code == 409


async def test_add_of_archived_offer_acts_as_restore(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    await client.post(f"{base()}/publish")
    await client.delete(url(offer=18814))
    await client.post(f"{base()}/publish")
    r = await client.post(url(), json={"offer_id": 18814})
    assert r.status_code == 200
    assert shares_of(sx(r.json())) == {18813: 50, 18814: 50}
    assert [c["action"] for c in (await client.get(f"/api/campaigns/{CID}/changes")).json()][0] == "restore"


async def test_remove_added_draft_deletes_row_and_last_offer_guard(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    r = await client.delete(url(offer=18814))
    s = sx(r.json())
    assert [o["offer_id"] for o in s["offers"]] == [18813] and s["dirty"] is False  # даже в архив не попал
    assert (await client.delete(url(offer=18813))).status_code == 400
    assert (await client.delete(url(offer=555))).status_code == 404


async def test_pin_survives_add_remove_restore(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    await client.post(url(), json={"offer_id": 18815})
    await client.put(url(), json={"shares": [
        {"offer_id": 18813, "share": 25}, {"offer_id": 18814, "share": 40}, {"offer_id": 18815, "share": 35}], "pinned": [18813]})
    s = await stream_of(client)
    assert [o["pinned"] for o in s["offers"]] == [True, False, False]
    r = await client.delete(url(offer=18815))
    assert shares_of(sx(r.json())) == {18813: 25, 18814: 75}
    setup.offers.append({"id": 18816, "name": "Offer D", "state": "active", "country": []})
    from app.services import refs
    refs.clear_cache()
    r = await client.post(url(), json={"offer_id": 18816})
    assert shares_of(sx(r.json())) == {18813: 25, 18814: 38, 18816: 37}
    r = await client.patch(url(offer=18813), json={"pinned": False})
    s = sx(r.json())
    assert [o["pinned"] for o in s["offers"]] == [False, False, False]
    assert shares_of(s) == {18813: 25, 18814: 38, 18816: 37}  # pin/unpin не пересчитывает
    changes = [c["action"] for c in (await client.get(f"/api/campaigns/{CID}/changes")).json()]
    assert "unpin" in changes and "set_shares" in changes


async def test_pin_all_blocks_recalc(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    await client.patch(url(offer=18813), json={"pinned": True})
    await client.patch(url(offer=18814), json={"pinned": True})
    r = await client.post(url(), json={"offer_id": 18815})
    assert r.status_code == 200  # новый оффер не закреплён
    await client.patch(url(offer=18815), json={"pinned": True})
    r = await client.delete(url(offer=18814))
    assert r.status_code == 422 and "закреплены" in r.json()["detail"]
    assert (await client.patch(url(offer=999), json={"pinned": True})).status_code == 404


async def test_set_shares_validation(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    for bad in (
        [{"offer_id": 18813, "share": 60}, {"offer_id": 18814, "share": 30}],
        [{"offer_id": 18813, "share": 100}],
        [{"offer_id": 18813, "share": 110}, {"offer_id": 18814, "share": -10}],
    ):
        assert (await client.put(url(), json={"shares": bad})).status_code == 422
    ok = [{"offer_id": 18814, "share": 20}, {"offer_id": 18813, "share": 80}]
    assert (await client.put(url(), json={"shares": ok, "pinned": [1]})).status_code == 422
    r = await client.put(url(), json={"shares": ok})
    assert shares_of(sx(r.json())) == {18813: 80, 18814: 20}
    assert not updates(setup)


async def test_sync_marks_keitaro_deleted_offers_archived(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    await client.post(f"{base()}/publish")
    setup.streams[1]["offers"] = [{"id": 11, "offer_id": 18813, "share": 100, "state": "active"}]  # 18814 удалили в Keitaro
    r = await client.post(f"/api/campaigns/{CID}/sync")
    assert r.status_code == 200, r.text
    s = sx(r.json())
    gone = [o for o in s["offers"] if o["offer_id"] == 18814][0]
    assert (gone["status"], gone["share"], gone["published"], gone["pending"]) == ("removed", 0, False, None)
    assert shares_of(s) == {18813: 100} and s["dirty"] is False
    changes = (await client.get(f"/api/campaigns/{CID}/changes")).json()
    assert changes[0]["action"] == "sync" and changes[0]["summary"]
    # повторная синхронизация без изменений в журнал не пишет
    await client.post(f"/api/campaigns/{CID}/sync")
    assert len((await client.get(f"/api/campaigns/{CID}/changes")).json()) == len(changes)
    # и вернуть оффер можно
    assert (await client.post(f"{url(offer=18814)}/restore")).status_code == 200


async def test_sync_conflicts_when_dirty_and_force(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    r = await client.post(f"/api/campaigns/{CID}/sync")
    assert r.status_code == 409 and "неопубликованные" in r.json()["detail"]
    setup.streams[1]["offers"].append({"id": 12, "offer_id": 18815, "share": 0, "state": "active"})
    r = await client.post(f"/api/campaigns/{CID}/sync", params={"force": True})
    assert r.status_code == 200
    s = sx(r.json())
    assert [o["offer_id"] for o in s["offers"]] == [18813, 18815] and r.json()["dirty"] is False  # черновик сброшен


async def test_sync_pulls_new_and_drops_deleted_streams(client, setup):
    await client.get(f"/api/campaigns/{CID}")
    setup.streams[4] = {"id": 4, "campaign_id": CID, "type": "regular", "name": "New", "position": 2, "schema": "landings",
                        "state": "active", "filters": [], "offers": [{"id": 31, "offer_id": 18814, "share": 100, "state": "active"}]}
    del setup.streams[2]
    d = (await client.post(f"/api/campaigns/{CID}/sync")).json()
    assert sorted(s["id"] for s in d["streams"]) == [1, 4]


async def test_publish_conflict_when_keitaro_changed(client, setup):
    await client.post(url(), json={"offer_id": 18814})
    setup.streams[1]["offers"] = [{"id": 11, "offer_id": 18813, "share": 70, "state": "active"},
                                  {"id": 12, "offer_id": 18815, "share": 30, "state": "active"}]
    r = await client.post(f"{base()}/publish")
    assert r.status_code == 409 and "подтяните" in r.json()["detail"]
    assert not updates(setup)


async def test_add_offer_without_read_access(client, setup):
    setup.forbidden_offers.add(13333)
    r = await client.post(url(), json={"offer_id": 13333})
    assert r.status_code == 200, r.text
    added = [o for o in sx(r.json())["offers"] if o["offer_id"] == 13333][0]
    assert added["accessible"] is False and added["name"] == "Оффер #13333"
    await client.post(f"{base()}/publish")
    assert 13333 in [o["offer_id"] for o in updates(setup)[-1][2]["offers"]]


async def test_add_offer_readable_but_unlisted(client, setup):
    setup.hidden_offers.add(777)
    r = await client.post(url(), json={"offer_id": 777})
    assert r.status_code == 200
    assert [o for o in sx(r.json())["offers"] if o["offer_id"] == 777][0]["name"] == "Hidden 777"


async def test_detail_domain_status_and_working_url(client, setup, dns_failing):
    d = (await client.get(f"/api/campaigns/{CID}")).json()["campaign"]
    assert d["working_url"] == "https://keitaro.test/abc"
    assert d["domain_status"]["host"] == "kylovoa.com" and d["domain_status"]["resolves"] is True
    from app.services import dns
    dns.clear_cache()
    dns_failing.add("kylovoa.com")
    d = (await client.get(f"/api/campaigns/{CID}")).json()["campaign"]
    assert d["domain_status"]["resolves"] is False and d["domain_status"]["error"]


async def test_no_domain_no_status(client, setup):
    setup.campaigns[CID]["domain"] = None
    d = (await client.get(f"/api/campaigns/{CID}")).json()["campaign"]
    assert d["domain_status"] is None and d["tracking_url"] is None


async def _archive_18814(client):
    await client.post(url(), json={"offer_id": 18814})
    await client.post(f"{base()}/publish")
    await client.delete(url(offer=18814))
    await client.post(f"{base()}/publish")  # 18814 ушёл из Keitaro → архив


async def test_discard_after_restore_returns_offer_to_archive(client, setup):
    await _archive_18814(client)
    await client.post(f"{url(offer=18814)}/restore")
    r = await client.post(f"{base()}/discard")
    s = sx(r.json())
    back = [o for o in s["offers"] if o["offer_id"] == 18814][0]
    assert (back["status"], back["share"], back["published"], back["pending"]) == ("removed", 0, False, None)
    assert shares_of(s) == {18813: 100} and s["dirty"] is False


async def test_force_sync_after_restore_keeps_archive(client, setup):
    await _archive_18814(client)
    await client.post(f"{url(offer=18814)}/restore")
    r = await client.post(f"/api/campaigns/{CID}/sync", params={"force": "true"})
    assert r.status_code == 200, r.text
    back = [o for o in sx(r.json())["offers"] if o["offer_id"] == 18814][0]
    assert (back["status"], back["published"]) == ("removed", False)


async def test_restored_flag_cleared_by_publish(client, setup):
    await _archive_18814(client)
    await client.post(f"{url(offer=18814)}/restore")
    await client.post(f"{base()}/publish")
    await client.delete(url(offer=18814))
    s = sx((await client.post(f"{base()}/discard")).json())
    # после публикации оффер обычный опубликованный: отмена удаления возвращает его активным
    assert shares_of(s) == {18813: 50, 18814: 50}


async def test_kt_drift_flag_when_keitaro_changed_behind_us(client, setup):
    d = (await client.get(f"/api/campaigns/{CID}")).json()
    assert d["kt_drift"] is False and sx(d)["kt_drift"] is False
    setup.streams[1]["offers"].append({"id": 12, "offer_id": 18814, "share": 0, "state": "active"})  # правка в Keitaro
    d = (await client.get(f"/api/campaigns/{CID}")).json()
    assert d["kt_drift"] is True and sx(d)["kt_drift"] is True and sx(d, 2)["kt_drift"] is False
    d = (await client.post(f"/api/campaigns/{CID}/sync")).json()
    assert d["kt_drift"] is False


async def test_kt_drift_on_new_stream_in_keitaro(client, setup):
    await client.get(f"/api/campaigns/{CID}")
    setup.streams[4] = {"id": 4, "campaign_id": CID, "type": "regular", "name": "New", "position": 3,
                        "schema": "landings", "state": "active", "filters": [], "offers": []}
    assert (await client.get(f"/api/campaigns/{CID}")).json()["kt_drift"] is True


async def test_remove_after_restore_returns_offer_to_archive(client, setup):
    await _archive_18814(client)
    await client.post(f"{url(offer=18814)}/restore")
    r = await client.delete(url(offer=18814))
    assert r.status_code == 200, r.text
    s = sx(r.json())
    back = [o for o in s["offers"] if o["offer_id"] == 18814]
    assert back and (back[0]["status"], back[0]["published"], back[0]["share"]) == ("removed", False, 0)
    assert shares_of(s) == {18813: 100} and s["dirty"] is False
    # и его снова можно вернуть
    assert (await client.post(f"{url(offer=18814)}/restore")).status_code == 200
