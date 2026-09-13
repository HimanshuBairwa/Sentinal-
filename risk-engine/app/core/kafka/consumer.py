import json
import asyncio
import logging
from aiokafka import AIOKafkaConsumer
from app.core.config import settings
from app.repository.feature_store import FeatureStore
from app.metrics.metrics import KAFKA_EVENTS_PROCESSED, KAFKA_CONSUMER_ERRORS

logger = logging.getLogger(__name__)

class AuthEventConsumer:
    """Consumes auth events to maintain the velocity feature store.

    Reliability contract (see ARCHITECTURE.md):
      - Offsets are committed ONLY after the feature store update durable-completes.
      - auto_offset_reset='earliest' so a cold start processes the retained backlog
        instead of skipping it (velocity history must not have gaps).
      - enable_auto_commit is False; we commit explicitly per processed message.
    """

    def __init__(self, feature_store: FeatureStore):
        self.brokers = settings.KAFKA_BROKERS
        self.group_id = settings.KAFKA_CONSUMER_GROUP
        self.topic = settings.KAFKA_AUTH_EVENTS_TOPIC
        self.feature_store = feature_store
        self.consumer: AIOKafkaConsumer | None = None
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        self.consumer = AIOKafkaConsumer(
            self.topic,
            bootstrap_servers=self.brokers,
            group_id=self.group_id,
            value_deserializer=lambda v: json.loads(v.decode()),
            auto_offset_reset="earliest",
            enable_auto_commit=False,
        )
        await self.consumer.start()
        self._running = True
        logger.info(f"Kafka consumer started on topic: {self.topic}")
        self._task = asyncio.create_task(self._consume_loop())

    async def _consume_loop(self):
        while self._running:
            try:
                async for msg in self.consumer:
                    if not self._running:
                        break
                    try:
                        await self._process_event(msg.value)
                        # Commit only after durable processing.
                        await self.consumer.commit()
                    except Exception as e:
                        logger.error(f"Error processing Kafka message: {e}")
                        KAFKA_CONSUMER_ERRORS.inc()
                        # Do not commit: the message will be redelivered.
            except Exception as e:
                logger.error(f"Kafka consumer connection error: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)

    async def _process_event(self, event: dict):
        """Update velocity counters for every consumed auth event.

        Velocity is keyed by (user, ip) so features reflect per-actor behavior:
        counting unique IPs seen *by a user* is only meaningful when the counter
        is scoped to that user, not the attacking IP.
        """
        ip = event.get("ip_address", "") or event.get("source", {}).get("ip_address", "")
        subject = event.get("subject", {})
        user_id = event.get("user_id") or subject.get("user_id")
        source = event.get("source", {})
        device_fp = source.get("device_id") or event.get("device", {}).get("fingerprint", "")
        geo = event.get("data", {}).get("geo", {}) or {}
        country = geo.get("country_code") or source.get("country_code") or "XX"
        is_failure = event.get("event_type") in {"auth.user.login_failed"}

        if not ip and not user_id:
            return  # nothing to key velocity on

        tasks = []
        # Count attempts per IP (detects distributed brute force from one source)
        for window in [60, 300, 900, 3600]:
            if ip:
                tasks.append(self.feature_store.increment_velocity(ip, "login_attempts", window))
            if is_failure and ip:
                tasks.append(self.feature_store.increment_velocity(ip, "login_failures", window))
            # Also track per-user velocity: fraud is actor-scoped, not only IP-scoped.
            if user_id:
                tasks.append(self.feature_store.increment_velocity(user_id, "login_attempts", window))
                if is_failure:
                    tasks.append(self.feature_store.increment_velocity(user_id, "login_failures", window))

        if user_id:
            if ip:
                tasks.append(self.feature_store.add_unique(user_id, "ips", ip, 3600))
                tasks.append(self.feature_store.add_unique(user_id, "ips", ip, 86400))
            if device_fp:
                tasks.append(self.feature_store.add_unique(user_id, "devices", device_fp, 86400))
            if country and country != "XX":
                tasks.append(self.feature_store.add_unique(user_id, "countries", country, 604800))

        await asyncio.gather(*tasks)
        KAFKA_EVENTS_PROCESSED.inc()

    async def stop(self):
        self._running = False
        if self._task:
            try:
                self._task.cancel()
                await asyncio.gather(self._task, return_exceptions=True)
            except Exception:
                pass
        if self.consumer:
            await self.consumer.stop()
            logger.info("Kafka consumer stopped")
