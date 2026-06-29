import asyncpg
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

class DecisionsRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def save(self, decision: Any):
        # We assume decision is an instance of RiskDecision
        query = """
            INSERT INTO risk_decisions (
                id, request_id, user_id, ip_address, final_score, action, 
                scores, triggered_rules, shap_top5, processing_time_ms
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
        """
        async with self.pool.acquire() as conn:
            try:
                await conn.execute(
                    query,
                    decision.decision_id,
                    decision.request_id,
                    decision.user_id,
                    decision.ip_address,
                    decision.final_score,
                    decision.action,
                    json.dumps(decision.scores),
                    decision.triggered_rules,
                    json.dumps(decision.shap_top5) if decision.shap_top5 else None,
                    decision.processing_time_ms
                )
            except Exception as e:
                logger.error(f"Failed to save decision to db: {e}")

def get_decisions_repo() -> DecisionsRepo:
    from app.core.database import get_db
    return DecisionsRepo(get_db())
