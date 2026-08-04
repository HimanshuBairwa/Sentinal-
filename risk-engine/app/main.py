import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.core.config import settings
from app.core.database import init_db_pool, close_db_pool
from app.core.redis_client import init_redis, close_redis
from app.core.kafka.producer import get_decision_producer
from app.core.kafka.consumer import AuthEventConsumer
from app.metrics.metrics import start_metrics_server
from app.domain.ml_scorer import get_ml_scorer
from app.domain.rules_engine import init_rules_engine
from app.repository.rules_repo import RulesRepo
from app.repository.feature_store import FeatureStore

from app.api.v1 import score, rules #, explain, model

logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

# Global consumer instance for graceful shutdown
_kafka_consumer = None
_background_tasks = set()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Init Database
    try:
        db_pool = await init_db_pool()
    except Exception as e:
        logger.error(f"Database connection failed: {e}. Service will start without DB.")
        db_pool = None
    
    # 2. Init Redis
    redis_client = await init_redis()
    
    # 3. Init Kafka Producer
    producer = get_decision_producer()
    try:
        await producer.start()
    except Exception as e:
        logger.error(f"Kafka producer failed to start: {e}")
    
    # 4. Load LightGBM Model (non-fatal if missing)
    scorer = get_ml_scorer()
    try:
        scorer.load_model(settings.MODEL_PATH)
    except Exception as e:
        logger.warning(f"Model load failed: {e}. Running in rules-only mode.")
    
    # 5. Load Fraud Rules (non-fatal if table doesn't exist yet)
    if db_pool:
        try:
            rules_repo = RulesRepo(db_pool)
            await init_rules_engine(rules_repo)
        except Exception as e:
            logger.warning(f"Rules loading failed: {e}. Will retry on first request.")
    else:
        logger.warning("Skipping rules loading - no DB connection.")
    
    # 6. Start Kafka Consumer (non-fatal)
    global _kafka_consumer
    try:
        feature_store = FeatureStore(redis_client)
        _kafka_consumer = AuthEventConsumer(feature_store)
        await _kafka_consumer.start()
    except Exception as e:
        logger.error(f"Kafka consumer failed to start: {e}")
    
    # 7. Start Prometheus Metrics Server
    try:
        start_metrics_server(9102)
    except Exception as e:
        logger.warning(f"Metrics server failed: {e}")
    
    logger.info("Risk Engine ready")
    
    yield
    
    # Shutdown
    logger.info(f"Waiting for {len(_background_tasks)} background tasks to complete...")
    if _background_tasks:
        await asyncio.gather(*_background_tasks, return_exceptions=True)
        
    if _kafka_consumer:
        await _kafka_consumer.stop()
    await producer.stop()
    await close_redis()
    await close_db_pool()

app = FastAPI(title="Sentinel Risk Engine", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenTelemetry
FastAPIInstrumentor.instrument_app(app)

# Mount Routers
app.include_router(score.router, prefix="/api/v1/risk", tags=["Risk Scoring"])
app.include_router(rules.router, prefix="/api/v1/rules", tags=["Fraud Rules"])

@app.get("/health")
async def health_check():
    scorer = get_ml_scorer()
    db_status = "error"
    redis_status = "error"
    try:
        from app.core.database import get_db
        async with get_db().acquire() as conn:
            await conn.execute("SELECT 1")
        db_status = "ok"
    except Exception as exc:
        logger.warning("database health check failed: %s", exc)
    try:
        from app.core.redis_client import get_redis
        await get_redis().ping()
        redis_status = "ok"
    except Exception as exc:
        logger.warning("redis health check failed: %s", exc)
    healthy = db_status == "ok" and redis_status == "ok"
    return {
        "status": "ok" if healthy else "degraded",
        "db": db_status,
        "redis": redis_status,
        "kafka": "ok" if _kafka_consumer and _kafka_consumer._running else "error",
        "model_loaded": scorer.model_loaded,
        "model_version": scorer.model_version,
        "version": "1.0.0"
    }

@app.get("/ready")
async def readiness_check():
    scorer = get_ml_scorer()
    if _kafka_consumer and _kafka_consumer._running:
        try:
            from app.core.database import get_db
            async with get_db().acquire() as conn:
                await conn.execute("SELECT 1")
            from app.core.redis_client import get_redis
            await get_redis().ping()
        except Exception:
            raise HTTPException(status_code=503, detail="Dependencies unavailable")
        return {"status": "ready"}
    raise HTTPException(status_code=503, detail="Starting up")
