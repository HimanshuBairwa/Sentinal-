import asyncpg
import logging
from typing import List, Dict, Any
from datetime import datetime
from app.models.schema import RuleCreate, RuleUpdate

logger = logging.getLogger(__name__)


class RulesRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    _SELECT = """
        SELECT id, rule_id, name, description, expression, score_contribution,
               action, is_enabled, priority, hit_count, last_triggered_at, created_at
        FROM fraud_rules
    """

    async def get_all(self) -> List[Dict[str, Any]]:
        """Every rule, enabled and disabled, for the management UI."""
        query = self._SELECT + " ORDER BY priority DESC, created_at"
        async with self.pool.acquire() as conn:
            records = await conn.fetch(query)
            return [dict(r) for r in records]

    async def get_all_enabled(self) -> List[Dict[str, Any]]:
        query = self._SELECT + " WHERE is_enabled = true ORDER BY priority DESC"
        async with self.pool.acquire() as conn:
            records = await conn.fetch(query)
            return [dict(r) for r in records]

    async def create(self, rule: RuleCreate) -> Dict[str, Any]:
        query = """
            INSERT INTO fraud_rules (rule_id, name, description, expression,
                                    score_contribution, action, is_enabled, priority)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, rule_id, name, description, expression, score_contribution,
                      action, is_enabled, priority, hit_count, last_triggered_at, created_at
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                rule.rule_id, rule.name, rule.description, rule.expression,
                rule.score_contribution, rule.action, rule.is_enabled, rule.priority,
            )
            return dict(row)

    async def update_by_rule_id(self, rule_id: str, rule: RuleUpdate) -> Dict[str, Any] | None:
        query = """
            UPDATE fraud_rules
            SET name = $2, description = $3, expression = $4, score_contribution = $5,
                action = $6, is_enabled = $7, priority = $8, updated_at = NOW()
            WHERE rule_id = $1
            RETURNING id, rule_id, name, description, expression, score_contribution,
                      action, is_enabled, priority, hit_count, last_triggered_at, created_at
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                rule_id, rule.name, rule.description, rule.expression,
                rule.score_contribution, rule.action, rule.is_enabled, rule.priority,
            )
            return dict(row) if row else None

    async def delete_by_rule_id(self, rule_id: str) -> bool:
        query = "DELETE FROM fraud_rules WHERE rule_id = $1"
        async with self.pool.acquire() as conn:
            result = await conn.execute(query, rule_id)
            return result.endswith(" 1")

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
