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
        """Load all enabled rules from DB into memory cache and precompile AST."""
        rules = await self.repo.get_all_enabled()
        self._rules_cache = []
        for rule in rules:
            if not rule["is_enabled"]:
                continue
            try:
                # Pre-compile the AST!
                compiled = self.parser.parse(rule["expression"])
                self._rules_cache.append({
                    "id": rule["id"],
                    "rule_id": rule["rule_id"],
                    "compiled": compiled,
                    "score_contribution": float(rule["score_contribution"])
                })
            except Exception as e:
                logger.warning(f"Rule {rule['rule_id']} compilation error: {e}")
                
        self._cache_loaded = True
        logger.info(f"Loaded and precompiled {len(self._rules_cache)} rules into memory cache.")

    def evaluate(self, features: Features) -> Tuple[float, List[str]]:
        """
        Evaluate all rules against feature set.
        Returns (max_score, list_of_triggered_rule_ids)
        Safe: uses py-expression-eval, never eval()
        """
        feature_dict = asdict(features)
        triggered_ids = []
        triggered_db_ids = []
        max_score = 0.0

        for rule in self._rules_cache:
            try:
                result = rule["compiled"].evaluate(feature_dict)
                if result:
                    triggered_ids.append(rule["rule_id"])
                    triggered_db_ids.append(rule["id"])
                    max_score = max(max_score, rule["score_contribution"])
            except Exception as e:
                logger.warning(f"Rule {rule['rule_id']} eval error: {e}")

        # Fire-and-forget: batch increment hit_count
        if triggered_db_ids:
            # We track tasks in main.py to await on shutdown
            import app.main
            task = asyncio.create_task(self.repo.increment_hit_counts(triggered_db_ids))
            app.main._background_tasks.add(task)
            task.add_done_callback(app.main._background_tasks.discard)

        return max_score, triggered_ids

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
