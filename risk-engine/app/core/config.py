from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Service
    HOST: str = "0.0.0.0"
    PORT: int = 8082
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "info"

    # Database (raw asyncpg DSN)
    DATABASE_URL: str = "postgresql://sentinel:sentinel_dev_secret@localhost:5432/sentinel"
    DB_POOL_MIN: int = 5
    DB_POOL_MAX: int = 20

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Kafka
    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_CONSUMER_GROUP: str = "sentinel-risk-engine"
    KAFKA_AUTH_EVENTS_TOPIC: str = "auth.events"
    KAFKA_RISK_DECISIONS_TOPIC: str = "risk.decisions"

    # ML Model
    MODEL_PATH: str = "/models/current/model.lgb"
    FEATURE_NAMES_PATH: str = "/models/current/feature_names.json"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "models"
    MLFLOW_TRACKING_URI: str = "http://mlflow:5000"

    # IP Intelligence
    GEO_IP_API_URL: str = "http://ip-api.com/json"
    GEO_IP_CACHE_TTL: int = 3600

    # Risk thresholds
    RISK_BLOCK_THRESHOLD: float = 80.0
    RISK_CHALLENGE_THRESHOLD: float = 60.0
    RISK_REVIEW_THRESHOLD: float = 40.0

    # Score weights
    WEIGHT_RULES: float = 0.30
    WEIGHT_ML: float = 0.45
    WEIGHT_IP: float = 0.15
    WEIGHT_VELOCITY: float = 0.10

    # Fail open: if ML model not loaded, skip ML score
    RISK_ENGINE_FAIL_OPEN: bool = True

    class Config:
        env_file = ".env"

settings = Settings()
