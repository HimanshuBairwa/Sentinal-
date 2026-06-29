import time
import asyncio
from uuid import uuid4
import redis.asyncio as aioredis
from app.models.schema import ScoreRequest

class FeatureStore:
    def __init__(self, redis: aioredis.Redis):
        self.redis = redis

    async def get_velocity(self, key: str, metric: str, window_seconds: int) -> float:
        redis_key = f"vel:{key}:{metric}:{window_seconds}"
        now = time.time()
        window_start = now - window_seconds
        
        # Remove expired entries and count remaining
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zcard(redis_key)
        results = await pipe.execute()
        return float(results[1])

    async def increment_velocity(self, key: str, metric: str, window_seconds: int):
        redis_key = f"vel:{key}:{metric}:{window_seconds}"
        now = time.time()
        pipe = self.redis.pipeline()
        pipe.zadd(redis_key, {f"{now}_{uuid4()}": now})
        pipe.expire(redis_key, window_seconds * 2)
        await pipe.execute()

    async def get_unique_count(self, key: str, dimension: str, window_seconds: int) -> float:
        redis_key = f"uniq:{key}:{dimension}:{window_seconds}"
        count = await self.redis.scard(redis_key)
        return float(count)

    async def add_unique(self, key: str, dimension: str, value: str, window_seconds: int):
        redis_key = f"uniq:{key}:{dimension}:{window_seconds}"
        pipe = self.redis.pipeline()
        pipe.sadd(redis_key, value)
        pipe.expire(redis_key, window_seconds * 2)
        await pipe.execute()

    async def get_user_history(self, user_id: str) -> dict:
        key = f"user_hist:{user_id}"
        data = await self.redis.hgetall(key)
        return data

    async def update_velocity(self, request: ScoreRequest):
        """Called fire-and-forget after scoring. Updates all velocity counters."""
        tasks = []
        for window in [60, 300, 900, 3600]:
            tasks.append(self.increment_velocity(request.ip_address, "login_attempts", window))
            
        if request.user_id:
            if request.device.fingerprint:
                tasks.append(self.add_unique(request.user_id, "devices", request.device.fingerprint, 86400))
            if request.geo.country_code:
                tasks.append(self.add_unique(request.user_id, "countries", request.geo.country_code, 604800))
        
        await asyncio.gather(*tasks)

def get_feature_store() -> FeatureStore:
    from app.core.redis_client import get_redis
    return FeatureStore(get_redis())
