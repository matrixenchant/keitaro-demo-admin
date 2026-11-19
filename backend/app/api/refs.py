from typing import Annotated

import pycountry
from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.keitaro.client import KeitaroClient, get_keitaro
from app.schemas import Country, Defaults, OfferRef, Ref
from app.services import refs

router = APIRouter(prefix="/refs", tags=["refs"])
KC = Annotated[KeitaroClient, Depends(get_keitaro)]


@router.get("/defaults", response_model=Defaults)
async def defaults(kc: KC):
    return await refs.resolve_defaults(kc)


@router.get("/domains", response_model=list[Ref])
async def domains(kc: KC):
    return [{"id": d["id"], "name": d["name"]} for d in await refs.domains(kc)]


@router.get("/groups", response_model=list[Ref])
async def groups(kc: KC):
    return [{"id": g["id"], "name": g["name"]} for g in await refs.groups(kc)]


@router.get("/sources", response_model=list[Ref])
async def sources(kc: KC):
    return [{"id": s["id"], "name": s["name"]} for s in await refs.sources(kc)]


@router.get("/offers", response_model=list[OfferRef])
async def offers(kc: KC, q: str = "", limit: int = Query(20, ge=1, le=200)):
    q = q.strip().lower()
    found = [o for o in await refs.offers(kc) if not q or q in str(o["id"]) or q in o["name"].lower()]
    found.sort(key=lambda o: o.get("state") != "active")  # стабильная сортировка: активные первыми
    return [
        {"id": o["id"], "name": o["name"], "state": o.get("state"), "country": o.get("country") or []}
        for o in found[:limit]
    ]


@router.get("/offers/{offer_id}")
async def offer_by_id(kc: KC, offer_id: int = Path(ge=1)):
    """Проверка оффера по ID до добавления: 404 — такого оффера в Keitaro нет."""
    try:
        return await refs.ensure_offer_exists(kc, offer_id)
    except HTTPException as e:
        if e.status_code == 422:
            raise HTTPException(404, f"Оффер #{offer_id} не найден") from e
        raise


@router.get("/countries", response_model=list[Country])
async def countries():
    return sorted(({"code": c.alpha_2, "name": c.name} for c in pycountry.countries), key=lambda c: c["name"])
