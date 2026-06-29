from dataclasses import dataclass, asdict, fields
import numpy as np
import asyncio
from datetime import datetime
from app.models.schema import ScoreRequest
from app.repository.feature_store import FeatureStore

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

class FeatureExtractor:
    def __init__(self, feature_store: FeatureStore):
        self.store = feature_store

    async def extract(self, request: ScoreRequest) -> Features:
        f = Features()

        # Parallel Redis calls for velocity
        vel_tasks = await asyncio.gather(
            self.store.get_velocity(request.ip_address, "login_attempts", 60),
            self.store.get_velocity(request.ip_address, "login_attempts", 300),
            self.store.get_velocity(request.ip_address, "login_attempts", 900),
            self.store.get_velocity(request.ip_address, "login_attempts", 3600),
            self.store.get_velocity(request.ip_address, "login_failures", 60),
            self.store.get_velocity(request.ip_address, "login_failures", 300),
            self.store.get_velocity(request.ip_address, "login_failures", 900),
            self.store.get_velocity(request.ip_address, "login_failures", 3600),
            self.store.get_unique_count(request.ip_address, "ips", 3600),
            self.store.get_unique_count(request.ip_address, "ips", 86400),
            self.store.get_unique_count(request.user_id or "anon", "devices", 86400),
            self.store.get_unique_count(request.user_id or "anon", "countries", 604800),
        )
        (f.v_login_attempts_1m, f.v_login_attempts_5m,
         f.v_login_attempts_15m, f.v_login_attempts_1h,
         f.v_login_failures_1m, f.v_login_failures_5m,
         f.v_login_failures_15m, f.v_login_failures_1h,
         f.v_unique_ips_1h, f.v_unique_ips_24h,
         f.v_unique_devices_24h, f.v_new_countries_7d) = vel_tasks

        # User history from Redis hash
        if request.user_id:
            history = await self.store.get_user_history(request.user_id)
            if history:
                f.hours_since_last_login = float(history.get("hours_since_last_login", 0))
                f.typical_login_hour_mean = float(history.get("typical_login_hour_mean", 12))
                f.total_login_count = float(history.get("total_login_count", 0))
                f.is_new_ip = 0.0 if request.ip_address in history.get("known_ips","") else 1.0
                f.is_new_device = 0.0 if request.device.fingerprint in history.get("known_devices","") else 1.0
                f.is_new_country = 0.0 if request.geo.country_code in history.get("known_countries","") else 1.0

        # Temporal
        now = datetime.utcnow()
        f.hour_of_day = float(now.hour)
        f.day_of_week = float(now.weekday())
        f.is_weekend = 1.0 if now.weekday() >= 5 else 0.0
        f.is_off_hours = 1.0 if now.hour < 6 or now.hour > 23 else 0.0

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
    return FeatureExtractor(get_feature_store())
