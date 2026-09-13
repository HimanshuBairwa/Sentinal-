"""
Risk engine unit tests.

Runs WITHOUT external dependencies (no Redis/Postgres/Kafka): components are
exercised directly with fakes/stubs. The old version used the removed
httpx.AsyncClient(app=...) API and required live infrastructure, so it failed
in CI (see .pytest_cache lastfailed).
"""
import asyncio
import math
from datetime import datetime, timezone

import pytest

from app.domain.features import Features, haversine_km
from app.domain.risk_aggregator import RiskAggregator, RiskDecision
from app.models.schema import ScoreRequest, GeoInfo, DeviceInfo


# ---------------------------------------------------------------------------
# Features
# ---------------------------------------------------------------------------

class FakeRedis:
    """Minimal async Redis stub covering the FeatureStore surface."""

    def __init__(self):
        self.zsets: dict = {}
        self.sets: dict = {}
        self.hashes: dict = {}
        self.kvs: dict = {}

    async def zremrangebyscore(self, key, lo, hi):
        zs = self.zsets.setdefault(key, {})
        for member in [m for m, s in zs.items() if s <= hi]:
            del zs[member]

    async def zcard(self, key):
        return len(self.zsets.get(key, {}))

    async def zadd(self, key, mapping):
        self.zsets.setdefault(key, {}).update(mapping)

    async def expire(self, key, ttl):
        pass

    async def scard(self, key):
        return len(self.sets.get(key, set()))

    async def sadd(self, key, value):
        self.sets.setdefault(key, set()).add(value)

    async def hgetall(self, key):
        return self.hashes.get(key, {})

    async def get(self, key):
        return self.kvs.get(key)

    async def setex(self, key, ttl, value):
        self.kvs[key] = value

    def pipeline(self):
        return FakePipeline(self)


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.ops = []

    def __getattr__(self, name):
        def enqueue(*args, **kwargs):
            self.ops.append((name, args, kwargs))
            return self
        return enqueue

    async def execute(self):
        results = []
        for name, args, kwargs in self.ops:
            results.append(await getattr(self.redis, name)(*args, **kwargs))
        self.ops = []
        return results


def test_features_count_matches_expected_vocabulary():
    # The ML model is trained on exactly this ordering — any drift is fatal.
    assert len(Features.FEATURE_NAMES) == 56
    assert Features.FEATURE_NAMES[0] == "v_login_attempts_1m"
    assert "ip_is_vpn" in Features.FEATURE_NAMES
    assert "ip_is_tor" in Features.FEATURE_NAMES
    assert "ip_is_datacenter" in Features.FEATURE_NAMES


def test_to_numpy_shape_and_dtype():
    f = Features()
    arr = f.to_numpy()
    assert arr.shape == (56,)
    assert arr.dtype.name == "float32"


def test_haversine_known_distances():
    # NYC → London ≈ 5570 km
    d = haversine_km(40.7128, -74.0060, 51.5074, -0.1278)
    assert 5500 < d < 5650
    # Same point = 0
    assert haversine_km(10, 20, 10, 20) == 0.0


def test_velocity_score_tiers():
    f = Features()
    f.v_login_failures_1m = 10
    assert f.velocity_score() >= 40
    f2 = Features()
    f2.v_login_attempts_5m = 20
    assert f2.velocity_score() >= 30
    f3 = Features()
    assert f3.velocity_score() == 0.0


# ---------------------------------------------------------------------------
# Aggregation → decision mapping
# ---------------------------------------------------------------------------

def make_request():
    return ScoreRequest(
        event_id="evt-1",
        event_type="user.login",
        request_id="req-1",
        ip_address="203.0.113.5",
    )


def test_aggregate_block_threshold():
    agg = RiskAggregator()
    decision = agg.aggregate(
        rule_score=90, ml_score=90, ip_score=90, velocity_score=90,
        triggered_rules=["RULE_002"], shap_top5=None, request=make_request(),
    )
    assert decision.action == "BLOCK"
    assert decision.final_score == 90.0


def test_aggregate_allow_low_scores():
    agg = RiskAggregator()
    decision = agg.aggregate(
        rule_score=5, ml_score=5, ip_score=5, velocity_score=0,
        triggered_rules=[], shap_top5=None, request=make_request(),
    )
    assert decision.action == "ALLOW"


def test_aggregate_clamps_to_100():
    agg = RiskAggregator()
    decision = agg.aggregate(
        rule_score=100, ml_score=100, ip_score=100, velocity_score=100,
        triggered_rules=[], shap_top5=None, request=make_request(),
    )
    assert decision.final_score == 100.0
    assert decision.action == "BLOCK"


def test_aggregate_rounds_scores_breakdown():
    agg = RiskAggregator()
    decision = agg.aggregate(
        rule_score=33.3333, ml_score=22.2222, ip_score=11.1111, velocity_score=0,
        triggered_rules=[], shap_top5=None, request=make_request(),
    )
    for v in decision.scores.values():
        assert v == round(v, 2)


# ---------------------------------------------------------------------------
# FeatureStore with the fake Redis
# ---------------------------------------------------------------------------

def test_feature_store_velocity_roundtrip():
    from app.repository.feature_store import FeatureStore

    async def run():
        redis = FakeRedis()
        store = FeatureStore(redis)
        await store.increment_velocity("1.2.3.4", "login_attempts", 60)
        await store.increment_velocity("1.2.3.4", "login_attempts", 60)
        assert await store.get_velocity("1.2.3.4", "login_attempts", 60) == 2.0
        await store.add_unique("user-1", "ips", "9.9.9.9", 3600)
        assert await store.get_unique_count("user-1", "ips", 3600) == 1.0

    asyncio.run(run())


def test_feature_store_ip_intel_flags_roundtrip():
    from app.repository.feature_store import FeatureStore

    async def run():
        redis = FakeRedis()
        store = FeatureStore(redis)
        await store.set_ip_intel_flags("1.2.3.4", {"ip_is_vpn": True})
        flags = await store.get_ip_intel_flags("1.2.3.4")
        assert flags["ip_is_vpn"] is True
        assert await store.get_ip_intel_flags("never-seen") == {}

    asyncio.run(run())


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

def test_score_request_defaults():
    req = ScoreRequest(
        event_id="e", event_type="t", request_id="r", ip_address="203.0.113.5",
    )
    assert req.geo.country_code == "XX"
    assert req.device.is_mobile is False
    assert req.metadata == {}


def test_geo_and_device_info():
    g = GeoInfo(country_code="RU", lat=55.75, lon=37.61)
    d = DeviceInfo(fingerprint="fp-1", is_headless=True)
    assert g.country_code == "RU"
    assert d.is_headless is True
