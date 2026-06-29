from dataclasses import dataclass
from uuid import uuid4
from typing import List, Dict, Optional
from app.core.config import settings
from app.models.schema import ScoreRequest

@dataclass
class RiskDecision:
    decision_id: str
    request_id: str
    user_id: Optional[str]
    ip_address: str
    final_score: float
    action: str             # ALLOW, REVIEW, CHALLENGE, BLOCK
    scores: dict            # {rules, ml, ip, velocity}
    triggered_rules: List[str]
    shap_top5: Optional[List[Dict]]
    processing_time_ms: float = 0.0

    def to_response(self) -> dict:
        return {
            "decision_id": self.decision_id,
            "request_id": self.request_id,
            "score": self.final_score,
            "action": self.action,
            "processing_time_ms": self.processing_time_ms,
            "triggered_rules": self.triggered_rules,
            "shap_top5": self.shap_top5,
            "scores": self.scores
        }

class RiskAggregator:
    def __init__(self):
        self.w_rules    = settings.WEIGHT_RULES
        self.w_ml       = settings.WEIGHT_ML
        self.w_ip       = settings.WEIGHT_IP
        self.w_velocity = settings.WEIGHT_VELOCITY
        self.block_threshold     = settings.RISK_BLOCK_THRESHOLD
        self.challenge_threshold = settings.RISK_CHALLENGE_THRESHOLD
        self.review_threshold    = settings.RISK_REVIEW_THRESHOLD

    def aggregate(
        self,
        rule_score: float,
        ml_score: float,
        ip_score: float,
        velocity_score: float,
        triggered_rules: List[str],
        shap_top5: Optional[List[Dict]],
        request: ScoreRequest,
    ) -> RiskDecision:
        final = (
            rule_score    * self.w_rules    +
            ml_score      * self.w_ml       +
            ip_score      * self.w_ip       +
            velocity_score * self.w_velocity
        )
        final = round(min(max(final, 0.0), 100.0), 2)

        if final >= self.block_threshold:
            action = "BLOCK"
        elif final >= self.challenge_threshold:
            action = "CHALLENGE"
        elif final >= self.review_threshold:
            action = "REVIEW"
        else:
            action = "ALLOW"

        return RiskDecision(
            decision_id=str(uuid4()),
            request_id=request.request_id,
            user_id=request.user_id,
            ip_address=request.ip_address,
            final_score=final,
            action=action,
            scores={
                "rules": round(rule_score, 2),
                "ml": round(ml_score, 2),
                "ip": round(ip_score, 2),
                "velocity": round(velocity_score, 2),
            },
            triggered_rules=triggered_rules,
            shap_top5=shap_top5,
        )

def get_risk_aggregator() -> RiskAggregator:
    return RiskAggregator()
