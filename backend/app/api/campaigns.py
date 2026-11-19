from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.keitaro.client import KeitaroClient, get_keitaro
from app.models import CreatedCampaign
from app.api.editor import Interval
from app.schemas import CampaignCreate, CampaignCreated, CampaignListItem, HistoryItem
from app.services import campaigns as svc

router = APIRouter(prefix="/campaigns", tags=["campaigns"])
KC = Annotated[KeitaroClient, Depends(get_keitaro)]
DB = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=CampaignCreated, status_code=201)
async def create(body: CampaignCreate, kc: KC, session: DB):
    return await svc.create_campaign(kc, session, body)


@router.get("", response_model=list[CampaignListItem])
async def list_(
    kc: KC, session: DB, only_mine: bool = False, q: str = "", interval: Interval = "today", refresh: bool = False
):
    return await svc.list_campaigns(kc, session, only_mine, q, interval, refresh)


@router.get("/history", response_model=list[HistoryItem])
async def history(session: DB):
    return (await session.scalars(select(CreatedCampaign).order_by(CreatedCampaign.id.desc()))).all()
