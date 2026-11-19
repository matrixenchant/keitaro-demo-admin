import asyncio
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

TTL = 300.0
TIMEOUT = 3.0
_cache: dict[str, tuple[float, dict]] = {}


def clear_cache() -> None:
    _cache.clear()


def host_of(domain: str) -> str:
    d = domain.strip()
    return (urlparse(d if "//" in d else f"//{d}").hostname or d).lower()


async def _lookup(host: str) -> None:
    """Отдельная функция, чтобы тесты подменяли её и не ходили в сеть."""
    await asyncio.get_running_loop().getaddrinfo(host, 443)


async def check_host(host: str) -> dict:
    hit = _cache.get(host)
    if hit and time.monotonic() - hit[0] < TTL:
        return hit[1]
    error = None
    try:
        await asyncio.wait_for(_lookup(host), TIMEOUT)
    except asyncio.TimeoutError:
        error = "timeout"
    except OSError as e:
        error = str(e) or e.__class__.__name__
    result = {"host": host, "resolves": error is None, "error": error, "checked_at": datetime.now(timezone.utc)}
    _cache[host] = (time.monotonic(), result)
    return result


async def attach_domain_status(items: list[dict]) -> None:
    """Проставляет item['domain_status'] (None, если домена нет); уникальные хосты проверяются один раз."""
    hosts = {i: host_of(it["domain"]) for i, it in enumerate(items) if it.get("domain")}
    unique = list(dict.fromkeys(hosts.values()))
    results = dict(zip(unique, await asyncio.gather(*(check_host(h) for h in unique))))
    for i, it in enumerate(items):
        it["domain_status"] = results[hosts[i]] if i in hosts else None
