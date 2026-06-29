from py_expression_eval import Parser
import asyncio
import logging
from typing import Tuple, List, Dict
from app.domain.features import Features
from app.repository.rules_repo import RulesRepo
from dataclasses import asdict

logger = logging.getLogger(__name__)

class RulesEngine:
    def __init__(self, rules_repo: RulesRepo):
        self.repo = rules_repo
        self.parser = Parser()
        self._rules_cache: List[Dict] = []
        self._cache_loaded = False

    async def load_rules(self):
        """Load all enabled rules from DB into memory cache."""
        rules = await self.repo.get_all_enabled()
        self._rules_cache = rules
        self._cache_loaded = True
        logger.info(f"Loaded {len(rules)} rules into memory cache.")

    def evaluate(self, features: Features) -> Tuple[float, List[str]]:
        """
        Evaluate all rules against feature set.
        Returns (max_score, list_of_triggered_rule_ids)
        Safe: uses py-expression-eval, never eval()
        """
        feature_dict = asdict(features)
        triggered = []
        max_score = 0.0

        for rule in self._rules_cache:
            if not rule["is_enabled"]:
                continue
            try:
                result = self.parser.parse(rule["expression"]).evaluate(feature_dict)
                if result:
                    triggered.append(rule["rule_id"])
                    max_score = max(max_score, float(rule["score_contribution"]))
                    # Fire-and-forget: increment hit_count
                    asyncio.create_task(
                        self.repo.increment_hit_count(rule["id"])
                    )
            except Exception as e:
                # Bad expression in DB — log and skip, never crash
                logger.warning(f"Rule {rule['rule_id']} eval error: {e}")

        return max_score, triggered

    async def reload_rules(self):
        """Hot-reload rules from DB."""
        await self.load_rules()

# Singleton instance
_rules_engine: RulesEngine | None = None

async def init_rules_engine(repo: RulesRepo) -> RulesEngine:
    global _rules_engine
    _rules_engine = RulesEngine(repo)
    await _rules_engine.load_rules()
    return _rules_engine

def get_rules_engine() -> RulesEngine:
    if _rules_engine is None:
        raise RuntimeError("RulesEngine is not initialized")
    return _rules_engine
