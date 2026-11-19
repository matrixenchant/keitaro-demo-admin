import time
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import HTTPException

from app.config import get_settings
from app.keitaro.client import KeitaroClient, KeitaroError

TTL = 60.0
_cache: dict[str, tuple[float, Any]] = {}


async def _cached(key: str, fn: Callable[[], Awaitable[Any]]) -> Any:
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < TTL:
        return hit[1]
    data = await fn()
    _cache[key] = (time.monotonic(), data)
    return data


def clear_cache() -> None:
    _cache.clear()


async def domains(kc: KeitaroClient) -> list[dict]:
    return await _cached("domains", kc.list_domains)


async def groups(kc: KeitaroClient) -> list[dict]:
    return await _cached("groups", kc.list_groups)


async def sources(kc: KeitaroClient) -> list[dict]:
    return await _cached("sources", kc.list_traffic_sources)


async def offers(kc: KeitaroClient) -> list[dict]:
    return await _cached("offers", kc.list_offers)


async def ensure_offer_exists(kc: KeitaroClient, offer_id: int) -> dict:
    """Оффер может существовать, но быть недоступным для чтения нашему ключу (403)."""
    found = next((o for o in await offers(kc) if o["id"] == offer_id), None)
    if found:
        return {"id": offer_id, "name": found["name"], "accessible": True}
    try:
        o = await kc.get_offer(offer_id)
    except KeitaroError as e:
        if e.status == 403:
            return {"id": offer_id, "name": None, "accessible": False}
        if e.status == 404:
            raise HTTPException(422, f"Оффер {offer_id} не найден в Keitaro") from e
        raise
    return {"id": offer_id, "name": o.get("name"), "accessible": True}


def _pick(items: list[dict], env_id: int | None, name: str | None, what: str) -> dict:
    """env id приоритетнее; иначе поиск по имени (или первый активный, если name=None)."""
    if env_id is not None:
        found = next((i for i in items if i["id"] == env_id), None)
        return {"id": env_id, "name": found["name"] if found else None}
    if name is None:
        found = next((i for i in items if i.get("state") == "active"), None)
    else:
        found = next((i for i in items if i.get("name") == name), None)
    if not found:
        raise HTTPException(422, f"Не удалось определить {what} по умолчанию")
    return {"id": found["id"], "name": found["name"]}


async def resolve_defaults(kc: KeitaroClient) -> dict[str, dict]:
    s = get_settings()
    return {
        "domain": _pick(await domains(kc), s.DEFAULT_DOMAIN_ID, None, "домен"),
        "group": _pick(await groups(kc), s.DEFAULT_GROUP_ID, s.DEFAULT_GROUP_NAME, "группу"),
        "source": _pick(await sources(kc), s.DEFAULT_TRAFFIC_SOURCE_ID, s.DEFAULT_TRAFFIC_SOURCE_NAME, "источник трафика"),
    }
