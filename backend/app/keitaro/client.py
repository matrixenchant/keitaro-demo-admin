from typing import Any

import httpx

from app.config import get_settings


class KeitaroError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class KeitaroClient:
    def __init__(self, base_url: str, api_key: str, transport: httpx.AsyncBaseTransport | None = None):
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Api-Key": api_key, "Accept": "application/json"},
            timeout=30,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _request(self, method: str, path: str, **kw: Any) -> Any:
        try:
            resp = await self._http.request(method, path, **kw)
        except httpx.HTTPError as e:
            raise KeitaroError(0, f"сеть: {e.__class__.__name__}") from e
        if resp.status_code >= 400:
            try:
                msg = resp.json().get("error") or resp.text
            except Exception:
                msg = resp.text
            raise KeitaroError(resp.status_code, str(msg)[:500])
        return resp.json() if resp.content else None

    async def list_campaigns(self) -> list[dict]:
        return await self._request("GET", "/campaigns")

    async def get_campaign(self, campaign_id: int) -> dict:
        return await self._request("GET", f"/campaigns/{campaign_id}")

    async def create_campaign(self, payload: dict) -> dict:
        return await self._request("POST", "/campaigns", json=payload)

    async def delete_campaign(self, campaign_id: int) -> None:
        await self._request("DELETE", f"/campaigns/{campaign_id}")

    async def list_streams(self, campaign_id: int) -> list[dict]:
        return await self._request("GET", f"/campaigns/{campaign_id}/streams")

    async def create_stream(self, payload: dict) -> dict:
        return await self._request("POST", "/streams", json=payload)

    async def update_stream(self, stream_id: int, payload: dict) -> dict:
        return await self._request("PUT", f"/streams/{stream_id}", json=payload)

    async def list_offers(self) -> list[dict]:
        return await self._request("GET", "/offers")

    async def get_offer(self, offer_id: int) -> dict:
        return await self._request("GET", f"/offers/{offer_id}")

    async def list_domains(self) -> list[dict]:
        return await self._request("GET", "/domains")

    async def list_traffic_sources(self) -> list[dict]:
        return await self._request("GET", "/traffic_sources")

    async def list_groups(self, type_: str = "campaigns") -> list[dict]:
        return await self._request("GET", "/groups", params={"type": type_})

    async def build_report(self, campaign_id: int, dimensions: list[str], interval: str, timezone: str) -> list[dict]:
        body = {
            "range": {"interval": interval, "timezone": timezone},
            "dimensions": dimensions,
            "measures": ["clicks", "campaign_unique_clicks", "bots"],
            "filters": [{"name": "campaign_id", "operator": "EQUALS", "expression": campaign_id}],
        }
        data = await self._request("POST", "/report/build", json=body)
        return data.get("rows", [])

    async def build_campaigns_report(self, interval: str, timezone: str) -> list[dict]:
        """Статистика по всем кампаниям одним запросом (только чтение)."""
        body = {
            "range": {"interval": interval, "timezone": timezone},
            "dimensions": ["campaign_id"],
            "measures": ["clicks", "campaign_unique_clicks", "bots"],
        }
        data = await self._request("POST", "/report/build", json=body)
        return data.get("rows", [])


_client: KeitaroClient | None = None


def get_keitaro() -> KeitaroClient:
    global _client
    if _client is None:
        s = get_settings()
        _client = KeitaroClient(s.KEITARO_API_URL or "", s.KEITARO_API_KEY)
    return _client
