import asyncio
import time
import logging
from fastapi import APIRouter, Depends
from app.models.schema import ScoreRequest, ScoreResponse
from app.repository.feature_store import FeatureStore, get_feature_store
from app.domain.features import FeatureExtractor, get_feature_extractor
from app.domain.ip_intelligence import IPIntelligence, get_ip_intelligence
from app.domain.rules_engine import RulesEngine, get_rules_engine
from app.domain.ml_scorer import LightGBMScorer, get_ml_scorer
from app.domain.risk_aggregator import RiskAggregator, get_risk_aggregator
from app.repository.decisions_repo import DecisionsRepo, get_decisions_repo
from app.core.kafka.producer import RiskDecisionProducer, get_decision_producer
from app.metrics.metrics import SCORE_HISTOGRAM, DECISIONS_COUNTER, PROCESSING_TIME

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/score", response_model=ScoreResponse)
async def score_request(
    request: ScoreRequest,
    feature_extractor: FeatureExtractor = Depends(get_feature_extractor),
    feature_store: FeatureStore = Depends(get_feature_store),
    ip_intel: IPIntelligence = Depends(get_ip_intelligence),
    rules_engine: RulesEngine = Depends(get_rules_engine),
    ml_scorer: LightGBMScorer = Depends(get_ml_scorer),
    risk_aggregator: RiskAggregator = Depends(get_risk_aggregator),
    decisions_repo: DecisionsRepo = Depends(get_decisions_repo),
    kafka_producer: RiskDecisionProducer = Depends(get_decision_producer),
):
    start = time.perf_counter()

    # Parallel I/O
    features_task = asyncio.create_task(feature_extractor.extract(request))
    ip_task = asyncio.create_task(ip_intel.score(request.ip_address))
    features, ip_score = await asyncio.gather(features_task, ip_task)

    # Scoring (CPU-bound, offloaded to thread pool)
    rule_score, triggered_rules = await asyncio.to_thread(rules_engine.evaluate, features)
    ml_score, shap_top5 = await asyncio.to_thread(ml_scorer.score, features.to_numpy())
    velocity_score = features.velocity_score()

    # Aggregate
    decision = risk_aggregator.aggregate(
        rule_score, ml_score, ip_score, velocity_score,
        triggered_rules, shap_top5, request
    )

    processing_ms = (time.perf_counter() - start) * 1000
    decision.processing_time_ms = round(processing_ms, 3)

    import app.main
    for bg_task in [
        asyncio.create_task(decisions_repo.save(decision)),
        asyncio.create_task(kafka_producer.publish_decision(decision)),
        asyncio.create_task(feature_store.update_velocity(request))
    ]:
        app.main._background_tasks.add(bg_task)
        bg_task.add_done_callback(app.main._background_tasks.discard)

    # Record metrics
    SCORE_HISTOGRAM.observe(decision.final_score)
    DECISIONS_COUNTER.labels(action=decision.action).inc()
    PROCESSING_TIME.observe(processing_ms / 1000.0)

    return decision.to_response()
