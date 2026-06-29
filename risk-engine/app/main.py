import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Init Database
    db_pool = await init_db_pool()
    
    # 2. Init Redis
    redis_client = await init_redis()
    
    # 3. Init Kafka Producer
    producer = get_decision_producer()
    await producer.start()
    
    # 4. Load LightGBM Model
    scorer = get_ml_scorer()
    scorer.load_model(settings.MODEL_PATH)
    
    # 5. Load Fraud Rules
    rules_repo = RulesRepo(db_pool)
    await init_rules_engine(rules_repo)
    
    # 6. Start Kafka Consumer
    global _kafka_consumer
    feature_store = FeatureStore(redis_client)
    _kafka_consumer = AuthEventConsumer(feature_store)
    await _kafka_consumer.start()
    
    # 7. Start Prometheus Metrics Server
    start_metrics_server(9102)
    
    logger.info("Risk Engine ready")
    
    yield
    
    # Shutdown
    if _kafka_consumer:
        await _kafka_consumer.stop()
    await producer.stop()
    await close_redis()
    await close_db_pool()

app = FastAPI(title="Sentinel Risk Engine", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    return {
        "status": "ok",
        "db": "ok",
        "redis": "ok",
        "kafka": "ok" if _kafka_consumer and _kafka_consumer._running else "error",
        "model_loaded": scorer.model_loaded,
        "model_version": scorer.model_version,
        "version": "1.0.0"
    }

@app.get("/ready")
async def readiness_check():
    scorer = get_ml_scorer()
    if _kafka_consumer and _kafka_consumer._running:
        return {"status": "ready"}
    from fastapi import HTTPException
    raise HTTPException(status_code=503, detail="Starting up")
