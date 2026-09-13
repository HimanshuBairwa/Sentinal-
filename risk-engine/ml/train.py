"""
Model training pipeline for Sentinel.

Trains the LightGBM fraud classifier on a REALISTIC synthetic dataset that
mirrors the behavioral distributions the risk engine sees in production:

- Legitimate users: low velocity, known devices/IPs, business hours, no VPN/TOR.
- Fraud actors: high failure velocity, new devices/countries, impossible
  travel, datacenter/VPN IPs, off-hours activity.

This replaces the trivially-separable gaussian blobs (which produced a fake
AUC ~1.0) with realistic, overlapping classes so metrics actually mean
something and the model generalizes to real traffic shapes.
"""
import os
import json
import logging
import lightgbm as lgb
import numpy as np
from datetime import datetime, timezone
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from app.domain.features import Features

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

RNG = np.random.default_rng(42)


def _clip(v, lo=0.0, hi=None):
    if hi is not None:
        return np.clip(v, lo, hi)
    return np.clip(v, lo, None)


def generate_realistic_data(n_samples=100_000, fraud_rate=0.08):
    """Generate a realistic, OVERLAPPING dataset of auth events with labels.

    Two noise sources prevent trivial separability (the original synthetic
    data scored a fake AUC of 1.0, which made every metric meaningless):
      - ~18% of fraud events are "patient attackers": low velocity, known
        devices, residential IPs. They look almost identical to legit users —
        this is what keeps real-world fraud AUC in the 0.85–0.95 range.
      - ~8% of legit events are "risky-looking": users traveling, new devices,
        shared office VPNs, shared IPs. False-positive pressure is real.
    """
    n_features = len(Features.FEATURE_NAMES)
    X = np.zeros((n_samples, n_features), dtype=np.float32)
    idx = {name: i for i, name in enumerate(Features.FEATURE_NAMES)}

    n_fraud = int(n_samples * fraud_rate)
    n_legit = n_samples - n_fraud
    y = np.zeros(n_samples, dtype=np.int8)
    y[n_legit:] = 1

    # Contamination: patient attackers (fraud that looks clean) and
    # risky-looking legitimate sessions. These mix the distributions so the
    # classes genuinely overlap.
    n_patient = int(n_fraud * 0.18)
    n_risky_legit = int(n_legit * 0.08)

    # ---------------- Legitimate population ----------------
    # Velocity: mostly quiet accounts; a long tail of power users.
    legit_attempts_1m = RNG.gamma(1.2, 0.8, n_legit)
    legit_attempts_5m = legit_attempts_1m * RNG.uniform(1.2, 3.5, n_legit)
    legit_attempts_15m = legit_attempts_5m * RNG.uniform(1.1, 2.8, n_legit)
    legit_attempts_1h = legit_attempts_15m * RNG.uniform(1.1, 2.5, n_legit)
    legit_failures_1m = RNG.poisson(0.12, n_legit)
    legit_failures_5m = RNG.poisson(0.5, n_legit)
    legit_failures_15m = RNG.poisson(1.1, n_legit)
    legit_failures_1h = RNG.poisson(3.2, n_legit)

    # History: established accounts, known devices/IPs, verified email, MFA often on.
    legit_new_ip = RNG.choice([0.0, 1.0], n_legit, p=[0.93, 0.07])
    legit_new_device = RNG.choice([0.0, 1.0], n_legit, p=[0.95, 0.05])
    legit_new_country = RNG.choice([0.0, 1.0], n_legit, p=[0.985, 0.015])
    legit_age_days = RNG.uniform(30, 3000, n_legit)
    legit_mfa = RNG.choice([0.0, 1.0], n_legit, p=[0.35, 0.65])
    legit_email_verified = RNG.choice([0.0, 1.0], n_legit, p=[0.02, 0.98])
    legit_hour = np.clip(RNG.normal(13, 3.5, n_legit), 0, 23)
    legit_off_hours = ((legit_hour < 6) | (legit_hour > 23)).astype(float)
    legit_vpn = RNG.choice([0.0, 1.0], n_legit, p=[0.96, 0.04])
    legit_tor = np.zeros(n_legit)
    legit_dc = RNG.choice([0.0, 1.0], n_legit, p=[0.97, 0.03])
    legit_bot = np.zeros(n_legit)
    legit_headless = np.zeros(n_legit)
    legit_dist_usual = RNG.gamma(1.0, 25, n_legit)

    # Risky-looking legit sessions: travelers, new devices, office VPNs.
    # These legitimately trip weak signals — the model must NOT learn
    # "new country = fraud".
    if n_risky_legit > 0:
        sl = slice(0, n_risky_legit)  # first slice of the legit population
        legit_new_ip[sl] = 1.0
        legit_new_device[sl] = 1.0
        legit_new_country[sl] = RNG.choice([0.0, 1.0], n_risky_legit, p=[0.55, 0.45])
        legit_dist_usual[sl] = RNG.gamma(2.5, 500, n_risky_legit)
        legit_vpn[sl] = RNG.choice([0.0, 1.0], n_risky_legit, p=[0.5, 0.5])
        legit_dc[sl] = RNG.choice([0.0, 1.0], n_risky_legit, p=[0.7, 0.3])
        legit_failures_5m[sl] = RNG.poisson(4.0, n_risky_legit)
        legit_hour[sl] = RNG.uniform(0, 24, n_risky_legit)

    # ---------------- Fraud population ----------------
    # Account takeover / credential stuffing / bots.
    fraud_attempts_1m = RNG.gamma(4.0, 3.0, n_fraud)
    fraud_attempts_5m = fraud_attempts_1m * RNG.uniform(1.5, 4.0, n_fraud)
    fraud_attempts_15m = fraud_attempts_5m * RNG.uniform(1.2, 3.0, n_fraud)
    fraud_attempts_1h = fraud_attempts_15m * RNG.uniform(1.2, 3.0, n_fraud)
    fraud_failures_1m = RNG.poisson(2.5, n_fraud)
    fraud_failures_5m = RNG.poisson(9.0, n_fraud)
    fraud_failures_15m = RNG.poisson(18.0, n_fraud)
    fraud_failures_1h = RNG.poisson(45.0, n_fraud)

    fraud_new_ip = RNG.choice([0.0, 1.0], n_fraud, p=[0.15, 0.85])
    fraud_new_device = RNG.choice([0.0, 1.0], n_fraud, p=[0.08, 0.92])
    fraud_new_country = RNG.choice([0.0, 1.0], n_fraud, p=[0.25, 0.75])
    fraud_age_days = RNG.uniform(0, 200, n_fraud)  # often recently created accounts
    fraud_mfa = RNG.choice([0.0, 1.0], n_fraud, p=[0.85, 0.15])
    fraud_email_verified = RNG.choice([0.0, 1.0], n_fraud, p=[0.45, 0.55])
    fraud_hour = RNG.uniform(0, 24, n_fraud)  # uniform across the day
    fraud_off_hours = ((fraud_hour < 6) | (fraud_hour > 23)).astype(float)
    fraud_vpn = RNG.choice([0.0, 1.0], n_fraud, p=[0.55, 0.45])
    fraud_tor = RNG.choice([0.0, 1.0], n_fraud, p=[0.92, 0.08])
    fraud_dc = RNG.choice([0.0, 1.0], n_fraud, p=[0.40, 0.60])
    fraud_bot = RNG.choice([0.0, 1.0], n_fraud, p=[0.75, 0.25])
    fraud_headless = RNG.choice([0.0, 1.0], n_fraud, p=[0.85, 0.15])
    fraud_dist_usual = RNG.gamma(3.0, 400, n_fraud)  # impossible travel

    # Patient attackers: fraud that deliberately mimics legitimate behavior.
    # Low velocity, known device, residential IP, business hours — only the
    # label says fraud. This is the class overlap that makes fraud detection
    # genuinely hard and keeps AUC honest.
    if n_patient > 0:
        sp = slice(n_fraud - n_patient, n_fraud)  # last slice of fraud population
        fraud_new_ip[sp] = RNG.choice([0.0, 1.0], n_patient, p=[0.85, 0.15])
        fraud_new_device[sp] = RNG.choice([0.0, 1.0], n_patient, p=[0.9, 0.1])
        fraud_new_country[sp] = 0.0
        fraud_vpn[sp] = 0.0
        fraud_tor[sp] = 0.0
        fraud_dc[sp] = 0.0
        fraud_bot[sp] = 0.0
        fraud_headless[sp] = 0.0
        fraud_dist_usual[sp] = RNG.gamma(1.0, 25, n_patient)
        fraud_hour[sp] = np.clip(RNG.normal(13, 3.5, n_patient), 0, 23)
        fraud_failures_1m[sp] = RNG.poisson(0.15, n_patient)
        fraud_failures_5m[sp] = RNG.poisson(0.6, n_patient)
        fraud_failures_15m[sp] = RNG.poisson(1.2, n_patient)
        fraud_failures_1h[sp] = RNG.poisson(3.5, n_patient)
        fraud_attempts_1m[sp] = RNG.gamma(1.2, 0.8, n_patient)
        fraud_attempts_5m[sp] = fraud_attempts_1m[sp] * RNG.uniform(1.2, 3.0, n_patient)
        fraud_attempts_15m[sp] = fraud_attempts_5m[sp] * RNG.uniform(1.1, 2.5, n_patient)
        fraud_attempts_1h[sp] = fraud_attempts_15m[sp] * RNG.uniform(1.1, 2.2, n_patient)
        fraud_mfa[sp] = RNG.choice([0.0, 1.0], n_patient, p=[0.5, 0.5])
        fraud_age_days[sp] = RNG.uniform(30, 2500, n_patient)

    def fill(col, legit, fraud):
        col[:n_legit] = legit
        col[n_legit:] = fraud

    # Velocity block
    fill(X[:, idx["v_login_attempts_1m"]], legit_attempts_1m, fraud_attempts_1m)
    fill(X[:, idx["v_login_attempts_5m"]], legit_attempts_5m, fraud_attempts_5m)
    fill(X[:, idx["v_login_attempts_15m"]], legit_attempts_15m, fraud_attempts_15m)
    fill(X[:, idx["v_login_attempts_1h"]], legit_attempts_1h, fraud_attempts_1h)
    fill(X[:, idx["v_login_failures_1m"]], legit_failures_1m, fraud_failures_1m)
    fill(X[:, idx["v_login_failures_5m"]], legit_failures_5m, fraud_failures_5m)
    fill(X[:, idx["v_login_failures_15m"]], legit_failures_15m, fraud_failures_15m)
    fill(X[:, idx["v_login_failures_1h"]], legit_failures_1h, fraud_failures_1h)
    # Unique IPs / devices / countries follow attempts with spread
    uniq_ips_1h = _clip(RNG.normal(0.3, 0.4, n_legit), 0, None).astype(int)
    uniq_ips_24h = uniq_ips_1h + RNG.poisson(1.2, n_legit)
    uniq_dev_24h = RNG.poisson(1.1, n_legit)
    new_countries_7d = RNG.poisson(0.1, n_legit)
    fraud_uniq_ips_1h = RNG.poisson(3.5, n_fraud)
    fraud_uniq_ips_24h = RNG.poisson(9.0, n_fraud)
    fraud_uniq_dev = RNG.poisson(4.5, n_fraud)
    fraud_new_countries = RNG.poisson(1.8, n_fraud)
    # Patient attackers get legit-shaped velocity, not fraud-shaped.
    if n_patient > 0:
        sp = slice(n_fraud - n_patient, n_fraud)
        fraud_uniq_ips_1h[sp] = RNG.poisson(0.3, n_patient)
        fraud_uniq_ips_24h[sp] = RNG.poisson(1.2, n_patient)
        fraud_uniq_dev[sp] = RNG.poisson(1.1, n_patient)
        fraud_new_countries[sp] = RNG.poisson(0.1, n_patient)
    # Risky-looking legit users share office/residential IPs and devices.
    if n_risky_legit > 0:
        sl = slice(0, n_risky_legit)
        uniq_ips_1h[sl] = RNG.poisson(3.0, n_risky_legit)
        uniq_ips_24h[sl] = RNG.poisson(7.0, n_risky_legit)
        uniq_dev_24h[sl] = RNG.poisson(3.5, n_risky_legit)
    fill(X[:, idx["v_unique_ips_1h"]], uniq_ips_1h, fraud_uniq_ips_1h)
    fill(X[:, idx["v_unique_ips_24h"]], uniq_ips_24h, fraud_uniq_ips_24h)
    fill(X[:, idx["v_unique_devices_24h"]], uniq_dev_24h, fraud_uniq_dev)
    fill(X[:, idx["v_new_countries_7d"]], new_countries_7d, fraud_new_countries)

    # History block
    fill(X[:, idx["is_new_ip"]], legit_new_ip, fraud_new_ip)
    fill(X[:, idx["is_new_device"]], legit_new_device, fraud_new_device)
    fill(X[:, idx["is_new_country"]], legit_new_country, fraud_new_country)
    fill(X[:, idx["account_age_days"]], legit_age_days, fraud_age_days)
    fill(X[:, idx["has_mfa_enabled"]], legit_mfa, fraud_mfa)
    fill(X[:, idx["email_verified"]], legit_email_verified, fraud_email_verified)
    hours_legit = RNG.gamma(2.0, 12, n_legit)
    hours_fraud = RNG.uniform(0, 2, n_fraud)
    # Both populations contain "it's been a while" and "just logged in" users:
    # hours_since_last_login alone must not be a perfect label.
    if n_patient > 0:
        sp = slice(n_fraud - n_patient, n_fraud)
        hours_fraud[sp] = RNG.gamma(2.0, 12, n_patient)
    if n_risky_legit > 0:
        hours_legit[:n_risky_legit] = RNG.uniform(0, 2, n_risky_legit)
    fill(X[:, idx["hours_since_last_login"]], hours_legit, hours_fraud)
    X[:, idx["typical_login_hour_mean"]] = np.concatenate([legit_hour, fraud_hour]).astype(float)

    # Geo/network block — contaminated on both sides:
    #   - risky legit users inherit bad IP reputation (VPN offices, CGNAT)
    #   - patient attackers inherit good IP reputation (residential proxies)
    ip_rep_legit = np.clip(RNG.normal(18, 10, n_legit), 0, 100)
    ip_rep_fraud = np.clip(RNG.normal(62, 18, n_fraud), 0, 100)
    asn_legit = np.clip(RNG.normal(25, 12, n_legit), 0, 100)
    asn_fraud = np.clip(RNG.normal(70, 20, n_fraud), 0, 100)
    if n_risky_legit > 0:
        ip_rep_legit[:n_risky_legit] = np.clip(RNG.normal(50, 15, n_risky_legit), 0, 100)
        asn_legit[:n_risky_legit] = np.clip(RNG.normal(55, 18, n_risky_legit), 0, 100)
    if n_patient > 0:
        sp = slice(n_fraud - n_patient, n_fraud)
        ip_rep_fraud[sp] = np.clip(RNG.normal(22, 10, n_patient), 0, 100)
        asn_fraud[sp] = np.clip(RNG.normal(28, 12, n_patient), 0, 100)
    fill(X[:, idx["ip_is_vpn"]], legit_vpn, fraud_vpn)
    fill(X[:, idx["ip_is_tor"]], legit_tor, fraud_tor)
    fill(X[:, idx["ip_is_datacenter"]], legit_dc, fraud_dc)
    # Proxy flag correlates with VPN (datacenter proxies) but isn't identical.
    legit_proxy = ((legit_vpn + RNG.uniform(-0.2, 0.2, n_legit)) > 0.8).astype(float)
    fraud_proxy = ((fraud_vpn + RNG.uniform(-0.2, 0.2, n_fraud)) > 0.4).astype(float)
    fill(X[:, idx["ip_is_proxy"]], legit_proxy, fraud_proxy)
    fill(X[:, idx["geo_distance_from_usual_km"]], legit_dist_usual, fraud_dist_usual)
    fill(X[:, idx["ip_reputation_score"]], ip_rep_legit, ip_rep_fraud)
    fill(X[:, idx["asn_risk_score"]], asn_legit, asn_fraud)

    # Device block
    fill(X[:, idx["is_bot_user_agent"]], legit_bot, fraud_bot)
    fill(X[:, idx["is_headless_browser"]], legit_headless, fraud_headless)

    # Temporal block
    fill(X[:, idx["hour_of_day"]], legit_hour, fraud_hour)
    X[:, idx["day_of_week"]] = RNG.integers(0, 7, n_samples)
    fill(X[:, idx["is_off_hours"]], legit_off_hours, fraud_off_hours)
    X[:, idx["is_weekend"]] = (X[:, idx["day_of_week"]] >= 5).astype(float)

    return X.astype(np.float32), y


def train_model():
    logger.info("Generating realistic synthetic training data (100k samples, ~8%% fraud)...")
    X, y = generate_realistic_data()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)

    logger.info("Training LightGBM Booster...")
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=Features.FEATURE_NAMES)
    test_data = lgb.Dataset(X_test, label=y_test, feature_name=Features.FEATURE_NAMES, reference=train_data)

    # Handle class imbalance explicitly; scale_pos_weight ≈ n_negative / n_positive.
    spw = float((y_train == 0).sum()) / float((y_train == 1).sum())
    params = {
        'objective': 'binary',
        'metric': 'auc',
        'boosting_type': 'gbdt',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.9,
        'bagging_fraction': 0.8,
        'bagging_freq': 5,
        'scale_pos_weight': spw,
        'verbose': -1,
        'seed': 42,
    }

    callbacks = [lgb.early_stopping(stopping_rounds=30), lgb.log_evaluation(period=50)]

    booster = lgb.train(
        params,
        train_data,
        num_boost_round=500,
        valid_sets=[test_data],
        callbacks=callbacks,
    )

    # Honest evaluation on the held-out set.
    probs = booster.predict(X_test)
    auc = roc_auc_score(y_test, probs)
    logger.info("Held-out AUC: %.4f (realistic dataset; NOT trivially separable)", auc)

    # Persist versioned artifacts + a 'current' pointer for hot reload.
    version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    models_root = os.environ.get("MODELS_ROOT", "/models")
    version_dir = os.path.join(models_root, version)
    os.makedirs(version_dir, exist_ok=True)

    model_path = os.path.join(version_dir, "model.lgb")
    booster.save_model(model_path)
    logger.info("Model saved to %s", model_path)

    # Save feature names + honest metrics alongside the model.
    with open(os.path.join(version_dir, "feature_names.json"), "w") as fh:
        json.dump(Features.FEATURE_NAMES, fh)
    with open(os.path.join(version_dir, "metrics.json"), "w") as fh:
        json.dump({"heldout_auc": float(auc), "n_train": int(len(y_train)),
                   "n_test": int(len(y_test)), "fraud_rate": float(y.mean())}, fh)

    # Symlink current
    current_link = os.path.join(models_root, "current")
    if os.path.exists(current_link) or os.path.islink(current_link):
        os.remove(current_link)
    os.symlink(version_dir, current_link)
    logger.info("Symlinked %s -> %s", current_link, version_dir)

    return booster, auc


if __name__ == "__main__":
    # Outside the container (e.g., a laptop), fall back to a local dir.
    if not os.path.exists("/models"):
        os.environ.setdefault("MODELS_ROOT", os.path.abspath("./local_models"))
    train_model()
