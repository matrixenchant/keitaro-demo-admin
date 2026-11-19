"""Чистые функции расчёта долей (share) офферов в потоке."""


class SharesError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def even_split(n: int, total: int = 100) -> list[int]:
    if n <= 0:
        return []
    base, rem = divmod(total, n)
    return [base + 1 if i < rem else base for i in range(n)]


def recalc(active: list[dict]) -> dict[int, int]:
    """active: [{offer_id, share, pinned}] по порядку. Закреплённые сохраняют долю, остальные делят остаток поровну."""
    if not active:
        return {}
    pinned = [o for o in active if o["pinned"]]
    free = [o for o in active if not o["pinned"]]
    rest = 100 - sum(o["share"] for o in pinned)
    if rest < 0:
        raise SharesError(422, "Сумма закреплённых долей больше 100%")
    if not free:
        if rest != 0:
            raise SharesError(422, "Все офферы закреплены — открепите хотя бы один")
        return {o["offer_id"]: o["share"] for o in active}
    split = dict(zip((o["offer_id"] for o in free), even_split(len(free), rest)))
    return {o["offer_id"]: o["share"] if o["pinned"] else split[o["offer_id"]] for o in active}


def set_shares(current: list[int], shares: list[tuple[int, int]]) -> dict[int, int]:
    ids = [o for o, _ in shares]
    if len(set(ids)) != len(ids):
        raise SharesError(422, "Дубли офферов в списке долей")
    if set(ids) != set(current):
        raise SharesError(422, "Набор офферов должен совпадать с текущим набором в потоке")
    if any(isinstance(s, bool) or not isinstance(s, int) or not 0 <= s <= 100 for _, s in shares):
        raise SharesError(422, "Доли должны быть целыми числами от 0 до 100")
    if sum(s for _, s in shares) != 100:
        raise SharesError(422, "Сумма долей должна быть ровно 100")
    by_id = dict(shares)
    return {i: by_id[i] for i in current}
