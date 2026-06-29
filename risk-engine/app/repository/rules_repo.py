import asyncpg
import logging
from app.models.schema import RuleCreate, RuleResponse
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class RulesRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def get_all_enabled(self) -> List[Dict[str, Any]]:
        query = """
            SELECT id, rule_id, name, description, expression, score_contribution, 
                   action, is_enabled, priority, hit_count, last_triggered_at, created_at
            FROM fraud_rules
            WHERE is_enabled = true
            ORDER BY priority DESC
        """
        async with self.pool.acquire() as conn:
            records = await conn.fetch(query)
            return [dict(r) for r in records]

    async def increment_hit_counts(self, ids: List[str]):
        query = """
            UPDATE fraud_rules 
            SET hit_count = hit_count + 1, last_triggered_at = NOW() 
            WHERE id = ANY($1)
        """
        async with self.pool.acquire() as conn:
            await conn.execute(query, ids)

def get_rules_repo() -> RulesRepo:
    from app.core.database import get_db
    return RulesRepo(get_db())
