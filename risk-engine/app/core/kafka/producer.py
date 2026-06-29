import json
import logging
from datetime import datetime
from aiokafka import AIOKafkaProducer
from app.core.config import settings
from app.domain.risk_aggregator import RiskDecision
from app.metrics.metrics import KAFKA_PUBLISH_FAILURES

logger = logging.getLogger(__name__)

class RiskDecisionProducer:
    def __init__(self):
        self.brokers = settings.KAFKA_BROKERS
        self.topic = settings.KAFKA_RISK_DECISIONS_TOPIC
        self.producer: AIOKafkaProducer | None = None

    async def start(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=self.brokers,
            value_serializer=lambda v: json.dumps(v, default=str).encode(),
            compression_type="snappy",
            acks=1,
            max_batch_size=16384,
        )
        await self.producer.start()
        logger.info(f"Kafka producer started for topic: {self.topic}")

    async def publish_decision(self, decision: RiskDecision):
        if not self.producer:
            return
            
        try:
            event = {
                "decision_id": decision.decision_id,
                "request_id": decision.request_id,
                "user_id": decision.user_id,
                "ip_address": decision.ip_address,
                "final_score": decision.final_score,
                "action": decision.action,
                "scores": decision.scores,
                "triggered_rules": decision.triggered_rules,
                "shap_top5": decision.shap_top5,
                "processing_time_ms": decision.processing_time_ms,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            await self.producer.send(
                self.topic,
                key=decision.decision_id.encode(),
                value=event,
            )
        except Exception as e:
            logger.error(f"Failed to publish risk decision: {e}")
            KAFKA_PUBLISH_FAILURES.inc()

    async def stop(self):
        if self.producer:
            await self.producer.stop()
            logger.info("Kafka producer stopped")

_producer = RiskDecisionProducer()

def get_decision_producer() -> RiskDecisionProducer:
    return _producer
