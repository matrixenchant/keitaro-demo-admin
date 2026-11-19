from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.keitaro.client import KeitaroClient, get_keitaro
from app.schemas import AddOfferBody, CampaignDetail, ChangeOut, PinBody, SetSharesBody
from app.services import editor

router = APIRouter(prefix="/campaigns", tags=["editor"])
KC = Annotated[KeitaroClient, Depends(get_keitaro)]
DB = Annotated[AsyncSession, Depends(get_session)]
Interval = Literal["today", "yesterday", "7_days_ago", "first_day_of_this_week", "1_month_ago", "all_time"]


@router.get("/{campaign_id}", response_model=CampaignDetail, response_model_by_alias=True)
async def detail(campaign_id: int, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.get_detail(kc, session, campaign_id, interval)


@router.get("/{campaign_id}/changes", response_model=list[ChangeOut])
async def changes(campaign_id: int, session: DB):
    return await editor.list_changes(session, campaign_id)


@router.post("/{campaign_id}/streams/{stream_id}/offers", response_model=CampaignDetail)
async def add_offer(campaign_id: int, stream_id: int, body: AddOfferBody, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.add_offer(kc, session, campaign_id, stream_id, body.offer_id, interval)


@router.delete("/{campaign_id}/streams/{stream_id}/offers/{offer_id}", response_model=CampaignDetail)
async def remove_offer(campaign_id: int, stream_id: int, offer_id: int, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.remove_offer(kc, session, campaign_id, stream_id, offer_id, interval)


@router.put("/{campaign_id}/streams/{stream_id}/offers", response_model=CampaignDetail)
async def set_shares(campaign_id: int, stream_id: int, body: SetSharesBody, kc: KC, session: DB, interval: Interval = "today"):
    shares = [(s.offer_id, s.share) for s in body.shares]
    return await editor.set_shares(kc, session, campaign_id, stream_id, shares, body.pinned, interval)


@router.post("/{campaign_id}/streams/{stream_id}/offers/{offer_id}/restore", response_model=CampaignDetail)
async def restore_offer(campaign_id: int, stream_id: int, offer_id: int, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.restore_offer(kc, session, campaign_id, stream_id, offer_id, interval)


@router.patch("/{campaign_id}/streams/{stream_id}/offers/{offer_id}", response_model=CampaignDetail)
async def pin_offer(campaign_id: int, stream_id: int, offer_id: int, body: PinBody, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.set_pinned(kc, session, campaign_id, stream_id, offer_id, body.pinned, interval)


@router.post("/{campaign_id}/streams/{stream_id}/discard", response_model=CampaignDetail)
async def discard(campaign_id: int, stream_id: int, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.discard(kc, session, campaign_id, stream_id, interval)


@router.post("/{campaign_id}/streams/{stream_id}/publish", response_model=CampaignDetail)
async def publish(campaign_id: int, stream_id: int, kc: KC, session: DB, interval: Interval = "today"):
    return await editor.publish(kc, session, campaign_id, stream_id, interval)


@router.post("/{campaign_id}/sync", response_model=CampaignDetail)
async def sync(campaign_id: int, kc: KC, session: DB, force: bool = False, interval: Interval = "today"):
    return await editor.sync(kc, session, campaign_id, force, interval)
