import json
import asyncio
import logging
from aiokafka import AIOKafkaConsumer
from app.core.config import settings
from app.repository.feature_store import FeatureStore
from app.metrics.metrics import KAFKA_EVENTS_PROCESSED, KAFKA_CONSUMER_ERRORS

logger = logging.getLogger(__name__)

class AuthEventConsumer:
    def __init__(self, feature_store: FeatureStore):
        self.brokers = settings.KAFKA_BROKERS
        self.group_id = settings.KAFKA_CONSUMER_GROUP
        self.topic = settings.KAFKA_AUTH_EVENTS_TOPIC
        self.feature_store = feature_store
        self.consumer: AIOKafkaConsumer | None = None
        self._running = False

    async def start(self):
        self.consumer = AIOKafkaConsumer(
            self.topic,
            bootstrap_servers=self.brokers,
            group_id=self.group_id,
            value_deserializer=lambda v: json.loads(v.decode()),
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        await self.consumer.start()
        self._running = True
        logger.info(f"Kafka consumer started on topic: {self.topic}")
        asyncio.create_task(self._consume_loop())

    async def _consume_loop(self):
        async for msg in self.consumer:
            if not self._running:
                break
            try:
                await self._process_event(msg.value)
            except Exception as e:
                logger.error(f"Error processing Kafka message: {e}")
                KAFKA_CONSUMER_ERRORS.inc()

    async def _process_event(self, event: dict):
        """Update velocity counters for every consumed auth event."""
        ip = event.get("ip_address", "")
        user_id = event.get("user_id")
        device_fp = event.get("device", {}).get("fingerprint", "")
        country = event.get("geo", {}).get("country_code", "XX")
        is_failure = event.get("event_type") == "user.login.failure"

        tasks = []
        for window in [60, 300, 900, 3600]:
            tasks.append(self.feature_store.increment_velocity(ip, "login_attempts", window))
            if is_failure:
                tasks.append(self.feature_store.increment_velocity(ip, "login_failures", window))

        if user_id:
            tasks.append(self.feature_store.add_unique(user_id, "devices", device_fp, 86400))
            tasks.append(self.feature_store.add_unique(user_id, "countries", country, 604800))
            tasks.append(self.feature_store.add_unique(user_id, "ips", ip, 3600))

        await asyncio.gather(*tasks)
        KAFKA_EVENTS_PROCESSED.inc()

    async def stop(self):
        self._running = False
        if self.consumer:
            await self.consumer.stop()
            logger.info("Kafka consumer stopped")
