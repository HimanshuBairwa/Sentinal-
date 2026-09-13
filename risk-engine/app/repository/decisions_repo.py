import asyncpg
import ipaddress
import json
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)

def _as_uuid_or_none(value: Any):
    """Coerce to a Postgres UUID, or None if not UUID-shaped.

    The decisions table's user_id column is UUID; scoring requests may carry
    non-UUID identifiers (anonymous sessions, synthetic user ids). Dropping
    rather than crashing keeps the decision durable — the ip_address and
    request_id still identify the event.
    """
    if value in (None, ""):
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None

def _as_inet_or_none(value: Any):
    """Coerce to INET or None. The decisions table's ip_address is INET."""
    if not value:
        return None
    try:
        ipaddress.ip_address(str(value))
        return str(value)
    except ValueError:
        # Not a valid IP literal — store the canonical unroutable marker so
        # the column's INET type is satisfied and the event stays queryable.
        return "0.0.0.0"

class DecisionsRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def save(self, decision: Any):
        query = """
            INSERT INTO risk_decisions (
                id, request_id, user_id, ip_address, final_score, action,
                scores, triggered_rules, shap_top5, processing_time_ms
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
        """
        user_id = _as_uuid_or_none(decision.user_id)
        ip_address = _as_inet_or_none(decision.ip_address)
        async with self.pool.acquire() as conn:
            try:
                await conn.execute(
                    query,
                    decision.decision_id,
                    decision.request_id,
                    user_id,
                    ip_address,
                    decision.final_score,
                    decision.action,
                    json.dumps(decision.scores),
                    decision.triggered_rules,
                    json.dumps(decision.shap_top5) if decision.shap_top5 else None,
                    decision.processing_time_ms
                )
            except Exception as e:
                logger.error("Failed to save decision to db: %s", e)

def get_decisions_repo() -> DecisionsRepo:
    from app.core.database import get_db
    return DecisionsRepo(get_db())
