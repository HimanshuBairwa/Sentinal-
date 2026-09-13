from dataclasses import dataclass, asdict, fields
import numpy as np
import asyncio
import logging
from datetime import datetime, timezone
from math import radians, sin, cos, asin, sqrt
from app.models.schema import ScoreRequest
from app.repository.feature_store import FeatureStore

logger = logging.getLogger(__name__)


@dataclass
class Features:
    # VELOCITY (12 features)
    v_login_attempts_1m: float = 0.0
    v_login_attempts_5m: float = 0.0
    v_login_attempts_15m: float = 0.0
    v_login_attempts_1h: float = 0.0
    v_login_failures_1m: float = 0.0
    v_login_failures_5m: float = 0.0
    v_login_failures_15m: float = 0.0
    v_login_failures_1h: float = 0.0
    v_unique_ips_1h: float = 0.0
    v_unique_ips_24h: float = 0.0
    v_unique_devices_24h: float = 0.0
    v_new_countries_7d: float = 0.0

    # BEHAVIORAL HISTORY (16 features)
    hours_since_last_login: float = 0.0
    account_age_days: float = 0.0
    days_since_email_verified: float = 0.0
    typical_login_hour_mean: float = 12.0
    typical_login_hour_std: float = 4.0
    login_hour_z_score: float = 0.0
    is_new_ip: float = 0.0
    is_new_device: float = 0.0
    is_new_country: float = 0.0
    is_new_city: float = 0.0
    total_login_count: float = 0.0
    total_failed_login_count: float = 0.0
    locked_count_30d: float = 0.0
    active_sessions_count: float = 0.0
    historical_avg_risk_score: float = 0.0
    failed_login_streak: float = 0.0

    # GEO & NETWORK (10 features)
    geo_distance_from_usual_km: float = 0.0
    geo_distance_from_last_login_km: float = 0.0
    ip_is_vpn: float = 0.0
    ip_is_tor: float = 0.0
    ip_is_datacenter: float = 0.0
    ip_is_proxy: float = 0.0
    ip_reputation_score: float = 50.0
    asn_risk_score: float = 50.0
    country_risk_score: float = 0.0
    is_high_risk_country: float = 0.0

    # ACCOUNT STATE (6 features)
    password_age_days: float = 0.0
    has_mfa_enabled: float = 0.0
    email_verified: float = 0.0
    account_suspended_count: float = 0.0
    is_active: float = 1.0
    days_since_last_password_change: float = 0.0

    # DEVICE & CLIENT (6 features)
    device_trust_score: float = 50.0
    browser_type_encoded: float = 0.0
    os_type_encoded: float = 0.0
    is_mobile: float = 0.0
    is_headless_browser: float = 0.0
    is_bot_user_agent: float = 0.0

    # TEMPORAL (6 features)
    hour_of_day: float = 12.0
    day_of_week: float = 1.0
    is_weekend: float = 0.0
    is_off_hours: float = 0.0
    days_to_nearest_holiday: float = 30.0
    is_holiday_in_user_country: float = 0.0

    def to_numpy(self) -> np.ndarray:
        """Returns float32 array in EXACT same order as training."""
        return np.array(list(asdict(self).values()), dtype=np.float32)

    def velocity_score(self) -> float:
        """Compute velocity anomaly score 0-100."""
        score = 0.0
        if self.v_login_failures_1m > 5: score += 40
        elif self.v_login_failures_1m > 2: score += 20

        if self.v_login_attempts_5m > 10: score += 30
        elif self.v_login_attempts_5m > 5: score += 15

        if self.v_unique_ips_1h > 5: score += 20
        if self.v_unique_devices_24h > 3: score += 10
        return min(score, 100.0)

# Note: FEATURE_NAMES is defined after the class below using fields(Features)

Features.FEATURE_NAMES = [field.name for field in fields(Features)]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two coordinates."""
    if lat1 == lat2 and lon1 == lon2:
        return 0.0
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))


class FeatureExtractor:
    def __init__(self, feature_store: FeatureStore, ip_intelligence=None):
        self.store = feature_store
        self.ip_intelligence = ip_intelligence

    async def extract(self, request: ScoreRequest) -> Features:
        f = Features()

        # Velocity is actor-scoped: per-user counters when the actor is known,
        # per-IP for anonymous traffic. This is what makes v_unique_ips_* mean
        # "how many sources has THIS actor been seen from", which is the
        # account-takeover signal the rules engine expects.
        velocity_key = request.user_id or request.ip_address

        vel_tasks = await asyncio.gather(
            self.store.get_velocity(request.ip_address, "login_attempts", 60),
            self.store.get_velocity(request.ip_address, "login_attempts", 300),
            self.store.get_velocity(request.ip_address, "login_attempts", 900),
            self.store.get_velocity(request.ip_address, "login_attempts", 3600),
            self.store.get_velocity(request.ip_address, "login_failures", 60),
            self.store.get_velocity(request.ip_address, "login_failures", 300),
            self.store.get_velocity(request.ip_address, "login_failures", 900),
            self.store.get_velocity(request.ip_address, "login_failures", 3600),
            self.store.get_unique_count(request.user_id or request.ip_address, "ips", 3600),
            self.store.get_unique_count(request.user_id or request.ip_address, "ips", 86400),
            self.store.get_unique_count(request.user_id or request.ip_address, "devices", 86400),
            self.store.get_unique_count(request.user_id or request.ip_address, "countries", 604800),
        )
        (f.v_login_attempts_1m, f.v_login_attempts_5m,
         f.v_login_attempts_15m, f.v_login_attempts_1h,
         f.v_login_failures_1m, f.v_login_failures_5m,
         f.v_login_failures_15m, f.v_login_failures_1h,
         f.v_unique_ips_1h, f.v_unique_ips_24h,
         f.v_unique_devices_24h, f.v_new_countries_7d) = vel_tasks

        # IP intelligence: populate the geo/network features the rules engine
        # and ML model expect (ip_is_vpn, ip_is_tor, ip_is_datacenter, ...).
        # Without this, 5 of the 16 seeded rules can never fire.
        if self.ip_intelligence is not None and request.ip_address:
            try:
                ip_score = await self.ip_intelligence.score(request.ip_address)
                f.ip_reputation_score = float(ip_score)
                flags = await self.ip_intelligence.get_flags(request.ip_address)
                f.ip_is_vpn = float(bool(flags.get("ip_is_vpn")))
                f.ip_is_tor = float(bool(flags.get("ip_is_tor")))
                f.ip_is_datacenter = float(bool(flags.get("ip_is_datacenter")))
                f.ip_is_proxy = float(bool(flags.get("ip_is_proxy")))
            except Exception as e:
                logger.warning("IP intelligence lookup failed for %s: %s", request.ip_address, e)

        # Temporal (UTC; consumers of timestamps are UTC-consistent)
        # Computed BEFORE the history block because login_hour_z_score depends on it.
        now = datetime.now(timezone.utc)
        f.hour_of_day = float(now.hour)
        f.day_of_week = float(now.weekday())
        f.is_weekend = 1.0 if now.weekday() >= 5 else 0.0
        f.is_off_hours = 1.0 if now.hour < 6 or now.hour > 23 else 0.0

        # User history from Redis hash
        if request.user_id:
            history = await self.store.get_user_history(request.user_id)
            if history:
                f.hours_since_last_login = float(history.get("hours_since_last_login", 0))
                f.typical_login_hour_mean = float(history.get("typical_login_hour_mean", 12))
                std = float(history.get("typical_login_hour_std", 4)) or 4.0
                f.typical_login_hour_std = std
                if std > 0:
                    delta = min(abs(f.hour_of_day - f.typical_login_hour_mean),
                                24 - abs(f.hour_of_day - f.typical_login_hour_mean))
                    f.login_hour_z_score = round(delta / std, 3)
                f.total_login_count = float(history.get("total_login_count", 0))
                f.total_failed_login_count = float(history.get("total_failed_login_count", 0))
                known_ips = history.get("known_ips", "")
                known_devices = history.get("known_devices", "")
                known_countries = history.get("known_countries", "")
                f.is_new_ip = 0.0 if request.ip_address and request.ip_address in known_ips else 1.0
                f.is_new_device = 0.0 if request.device.fingerprint and request.device.fingerprint in known_devices else 1.0
                f.is_new_country = 0.0 if request.geo.country_code and request.geo.country_code in known_countries else 1.0

                # Geo distance from the user's usual location (impossible-travel signal)
                try:
                    usual_lat = float(history.get("usual_lat", 0) or 0)
                    usual_lon = float(history.get("usual_lon", 0) or 0)
                    last_lat = float(history.get("last_lat", 0) or 0)
                    last_lon = float(history.get("last_lon", 0) or 0)
                    if usual_lat or usual_lon:
                        f.geo_distance_from_usual_km = round(
                            haversine_km(request.geo.lat, request.geo.lon, usual_lat, usual_lon), 1)
                    if last_lat or last_lon:
                        f.geo_distance_from_last_login_km = round(
                            haversine_km(request.geo.lat, request.geo.lon, last_lat, last_lon), 1)
                except (TypeError, ValueError):
                    pass

        # Device
        f.is_mobile = 1.0 if request.device.is_mobile else 0.0
        f.is_headless_browser = 1.0 if request.device.is_headless else 0.0
        f.is_bot_user_agent = 1.0 if self._is_bot_ua(request.user_agent) else 0.0

        return f

    def _is_bot_ua(self, ua: str) -> bool:
        bots = ["bot", "crawler", "spider", "scraper", "headless",
                "python-requests", "curl", "wget", "go-http-client"]
        ua_lower = ua.lower()
        return any(b in ua_lower for b in bots)


def get_feature_extractor() -> FeatureExtractor:
    from app.repository.feature_store import get_feature_store
    from app.domain.ip_intelligence import get_ip_intelligence
    return FeatureExtractor(get_feature_store(), get_ip_intelligence())
