import redis.asyncio as aioredis
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global Redis client
_redis: aioredis.Redis | None = None

async def init_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        logger.info("Connecting to Redis...")
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2.0
        )
        # Verify connection
        await _redis.ping()
        logger.info("Successfully connected to Redis.")
    return _redis

async def close_redis():
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
        logger.info("Redis connection closed.")

def get_redis() -> aioredis.Redis:
    """Dependency to get the Redis client."""
    if _redis is None:
        raise RuntimeError("Redis is not initialized")
    return _redis
