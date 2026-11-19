import pytest

from app.services.shares import SharesError, even_split, recalc, set_shares


@pytest.mark.parametrize("n", range(1, 101))
def test_even_split_sums_to_100(n):
    parts = even_split(n)
    assert len(parts) == n and sum(parts) == 100
    assert max(parts) - min(parts) <= 1
    assert parts == sorted(parts, reverse=True)  # остаток у первых


def test_even_split_examples():
    assert even_split(0) == []
    assert even_split(1) == [100]
    assert even_split(3) == [34, 33, 33]
    assert even_split(2) == [50, 50]
    assert even_split(7)[:2] == [15, 15]
    assert even_split(3, 75) == [25, 25, 25]
    assert even_split(2, 75) == [38, 37]


def A(*items):
    return [{"offer_id": i, "share": s, "pinned": p} for i, s, p in items]


def test_recalc_no_pins_even():
    assert recalc(A((1, 0, False), (2, 0, False), (3, 0, False))) == {1: 34, 2: 33, 3: 33}
    assert recalc(A((1, 100, False))) == {1: 100}
    assert recalc([]) == {}


def test_recalc_keeps_pinned_and_splits_rest():
    assert recalc(A((1, 25, True), (2, 0, False), (3, 0, False), (4, 0, False))) == {1: 25, 2: 25, 3: 25, 4: 25}
    assert recalc(A((1, 25, True), (2, 0, False), (3, 0, False))) == {1: 25, 2: 38, 3: 37}  # остаток первому
    assert recalc(A((1, 40, False), (2, 30, True), (3, 30, True))) == {1: 40, 2: 30, 3: 30}


def test_recalc_pinned_exactly_100_leaves_zero():
    assert recalc(A((1, 100, True), (2, 0, False))) == {1: 100, 2: 0}


def test_recalc_all_pinned_ok_when_100():
    assert recalc(A((1, 60, True), (2, 40, True))) == {1: 60, 2: 40}


def test_recalc_all_pinned_not_100_422():
    with pytest.raises(SharesError) as e:
        recalc(A((1, 60, True), (2, 30, True)))
    assert e.value.status == 422 and "закреплены" in e.value.message


def test_recalc_pinned_over_100_422():
    with pytest.raises(SharesError) as e:
        recalc(A((1, 70, True), (2, 40, True), (3, 0, False)))
    assert e.value.status == 422


def test_set_shares_ok_keeps_current_order():
    assert set_shares([1, 2], [(2, 30), (1, 70)]) == {1: 70, 2: 30}
    assert set_shares([1, 2], [(1, 100), (2, 0)]) == {1: 100, 2: 0}


@pytest.mark.parametrize(
    "shares",
    [
        [(1, 50), (2, 49)],  # сумма 99
        [(1, 60), (2, 50)],  # сумма 110
        [(1, 101), (2, -1)],  # вне диапазона
        [(1, 100)],  # другой набор
        [(1, 50), (2, 25), (3, 25)],  # лишний оффер
        [(1, 50), (1, 50)],  # дубль
    ],
)
def test_set_shares_invalid_422(shares):
    with pytest.raises(SharesError) as e:
        set_shares([1, 2], shares)
    assert e.value.status == 422
