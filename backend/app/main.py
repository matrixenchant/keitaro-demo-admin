import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import campaigns, editor, refs
from app.config import get_settings
from app.keitaro.client import KeitaroClient, KeitaroError, get_keitaro
from app.services.shares import SharesError

app = FastAPI(title="Keitaro Admin")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(KeitaroError)
async def keitaro_error_handler(_: Request, exc: KeitaroError) -> JSONResponse:
    status = 404 if exc.status == 404 else 502
    return JSONResponse({"detail": f"Keitaro: {exc.message}"}, status_code=status)


@app.exception_handler(SharesError)
async def shares_error_handler(_: Request, exc: SharesError) -> JSONResponse:
    return JSONResponse({"detail": exc.message}, status_code=exc.status)


api = APIRouter(prefix="/api")


@api.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


_status_cache: dict = {"at": 0.0, "value": None}


@api.get("/status")
async def keitaro_status(kc: KeitaroClient = Depends(get_keitaro)) -> dict:
    """Жив ли сервер Keitaro: лёгкий запрос к API, результат кэшируется на 15 с."""
    if _status_cache["value"] and time.monotonic() - _status_cache["at"] < 15:
        return _status_cache["value"]
    host = urlparse(get_settings().KEITARO_API_URL or "").hostname or ""
    started = time.monotonic()
    try:
        await kc.list_traffic_sources()
        value = {"ok": True, "host": host, "latency_ms": round((time.monotonic() - started) * 1000), "error": None}
    except Exception as e:  # сеть, таймаут, ошибка ключа — для статуса всё равно «недоступен»
        message = e.message if isinstance(e, KeitaroError) else type(e).__name__
        value = {"ok": False, "host": host, "latency_ms": None, "error": message}
    _status_cache.update(at=time.monotonic(), value=value)
    return value


@api.get("/config")
async def public_config() -> dict[str, str]:
    """Настройки, которые нужны фронту без обращения к Keitaro."""
    return {"name_prefix": get_settings().CAMPAIGN_NAME_PREFIX}


api.include_router(refs.router)
api.include_router(campaigns.router)
api.include_router(editor.router)
app.include_router(api)
