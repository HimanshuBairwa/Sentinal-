import asyncpg
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: asyncpg.Pool | None = None

async def init_db_pool() -> asyncpg.Pool:
    """Initialize the asyncpg connection pool."""
    global _pool
    if _pool is None:
        logger.info(f"Connecting to database at {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'localhost'}...")
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN,
            max_size=settings.DB_POOL_MAX,
            command_timeout=30,
        )
        
        # Verify connection
        async with _pool.acquire() as conn:
            await conn.execute("SELECT 1")
            
        logger.info("Successfully connected to database pool.")
    return _pool

async def close_db_pool():
    """Close the asyncpg connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed.")

def get_db() -> asyncpg.Pool:
    """Dependency to get the database pool for FastAPI endpoints."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool
