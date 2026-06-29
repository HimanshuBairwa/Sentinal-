import logging
from prometheus_client import Counter, Histogram, Gauge, start_http_server

logger = logging.getLogger(__name__)

DECISIONS_COUNTER = Counter(
    "sentinel_risk_decisions_total",
    "Total risk decisions by action",
    ["action"]
)
SCORE_HISTOGRAM = Histogram(
    "sentinel_risk_score_distribution",
    "Distribution of risk scores",
    buckets=[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
)
ML_INFERENCE_LATENCY = Histogram(
    "sentinel_ml_inference_seconds",
    "LightGBM inference latency",
    buckets=[0.0005, 0.001, 0.003, 0.005, 0.01, 0.025, 0.05]
)
FEATURE_EXTRACTION_LATENCY = Histogram(
    "sentinel_feature_extraction_seconds",
    "Feature extraction latency",
    buckets=[0.001, 0.003, 0.005, 0.01, 0.025]
)
PROCESSING_TIME = Histogram(
    "sentinel_risk_processing_seconds",
    "Total end-to-end scoring latency",
    buckets=[0.005, 0.01, 0.015, 0.025, 0.05, 0.1]
)
RULE_HITS = Counter(
    "sentinel_rule_hits_total",
    "Fraud rule hits",
    ["rule_id"]
)
RULES_EVALUATED = Counter(
    "sentinel_rules_evaluated_total",
    "Total rule evaluations"
)
KAFKA_EVENTS_PROCESSED = Counter(
    "sentinel_kafka_events_processed_total",
    "Auth events consumed from Kafka"
)
KAFKA_PUBLISH_FAILURES = Counter(
    "sentinel_kafka_publish_failures_total",
    "Risk decision publish failures"
)
KAFKA_CONSUMER_ERRORS = Counter(
    "sentinel_kafka_consumer_errors_total",
    "Kafka consumer processing errors"
)
MODEL_LOADED = Gauge(
    "sentinel_model_loaded",
    "Whether ML model is currently loaded (1=yes, 0=no)"
)

def start_metrics_server(port: int = 9102):
    start_http_server(port)
    logger.info(f"Prometheus metrics on port {port}")
