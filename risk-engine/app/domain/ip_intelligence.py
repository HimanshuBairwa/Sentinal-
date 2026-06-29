import json
import httpx
import logging
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

class IPIntelligence:
    def __init__(self, redis: aioredis.Redis, api_url: str, cache_ttl: int):
        self.redis = redis
        self.api_url = api_url
        self.cache_ttl = cache_ttl

    async def score(self, ip: str) -> float:
        """Returns IP risk score 0-100. Cached in Redis."""
        cached = await self.redis.get(f"ip_intel:{ip}")
        if cached:
            data = json.loads(cached)
        else:
            data = await self._fetch_ip_data(ip)
            await self.redis.setex(
                f"ip_intel:{ip}", self.cache_ttl, json.dumps(data)
            )
        return self._compute_score(data)

    async def get_flags(self, ip: str) -> dict:
        """Returns VPN/TOR/datacenter flags for feature extraction."""
        cached = await self.redis.get(f"ip_intel:{ip}")
        data = json.loads(cached) if cached else await self._fetch_ip_data(ip)
        return {
            "ip_is_vpn": self._is_vpn(data),
            "ip_is_tor": self._is_tor(data),
            "ip_is_datacenter": self._is_datacenter(data),
            "ip_is_proxy": self._is_proxy(data),
        }

    async def _fetch_ip_data(self, ip: str) -> dict:
        """Call ip-api.com with 300ms timeout. Return empty dict on failure."""
        try:
            async with httpx.AsyncClient(timeout=0.3) as client:
                r = await client.get(
                    f"{self.api_url}/{ip}",
                    params={"fields": "status,country,countryCode,city,lat,lon,isp,org,as,proxy,hosting,mobile"}
                )
                return r.json() if r.status_code == 200 else {}
        except Exception as e:
            logger.warning(f"IP Intel lookup failed for {ip}: {e}")
            return {}  # Always fail open on IP lookup

    def _compute_score(self, data: dict) -> float:
        score = 0.0
        if data.get("proxy"): score += 35
        if data.get("hosting"): score += 30
        if "tor" in data.get("isp", "").lower(): score += 40
        if not data:  # Unknown IP — moderate risk
            score = 30.0
        return min(score, 100.0)

    def _is_vpn(self, data): return bool(data.get("proxy"))
    def _is_tor(self, data): return "tor" in data.get("isp","").lower()
    def _is_datacenter(self, data): return bool(data.get("hosting"))
    def _is_proxy(self, data): return bool(data.get("proxy"))

def get_ip_intelligence() -> IPIntelligence:
    from app.core.redis_client import get_redis
    return IPIntelligence(get_redis(), settings.GEO_IP_API_URL, settings.GEO_IP_CACHE_TTL)
