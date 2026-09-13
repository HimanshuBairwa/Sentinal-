# Sentinel Production Architecture

Sentinel is a gateway-first fraud decisioning platform. Only the gateway (`:8080`) and dashboard (`:3000`) are intended to be reachable from a developer workstation. Postgres, Redis, Kafka, ClickHouse, MinIO, and application services remain on the Compose network.

## Request path

1. The dashboard or an API client authenticates through `auth-service` via the gateway.
2. The gateway validates RS256 access tokens locally, enforces rate limits, and forwards trusted identity headers. The gateway **re-fetches the public key every 30 seconds** so an auth-service restart or key rotation never causes an outage.
3. The auth service records the **true client IP** (`X-Forwarded-For` → `X-Real-IP` → `RemoteAddr`) on every auth event — the fraud features depend on it.
4. Risk scoring runs deterministic rules, velocity features (actor-scoped, from Redis ZSETs), IP intelligence (VPN/TOR/datacenter flags cached in Redis), and a LightGBM model with SHAP explainability — extracting 56 features in parallel.
5. Decisions are persisted to Postgres and published to `risk.decisions` with `acks=all`.
6. Analytics consumes all telemetry topics and durably batches events into ClickHouse **before acknowledging Kafka offsets**. Live events fan out to dashboard WebSockets through per-client queues (a slow client can never stall the group).
7. Alerts consume risk decisions, deduplicate atomically through Redis Lua, validate webhook destinations (HTTPS-only in production, no private addresses, no redirects — SSRF-safe), and send failures to `alerts.dlq`.

## Reliability principles

- Kafka consumers commit only after durable processing. The risk-engine consumer uses `auto_offset_reset=earliest` so a cold start replays the retained backlog instead of leaving velocity gaps.
- Every event uses the versioned envelope in `contracts/events.md`.
- Service health endpoints report dependency state (DB / Redis / ClickHouse / auth-key) and return `503` until dependencies are usable — no hardcoded 200s.
- Signing keys are persisted in the `jwt_keys` volume. Rotate by replacing the key through a controlled deployment and changing `JWT_KEY_ID`; the gateway picks up the new key within 30 seconds.
- Secrets in `.env.example` are placeholders only. Production deployments must use an external secret manager.

## Observability

- Prometheus scrapes the gateway (`/metrics`, dependency-free text exposition) and the risk engine (`:9102`).
- Grafana ships provisioned with a Prometheus datasource and a fraud-decisioning overview dashboard (decisions by action, score distribution, ML inference p50/p99, Kafka throughput, model-loaded gauge).
- The risk engine is OpenTelemetry-instrumented and exports traces to Jaeger.

## Local verification

```powershell
docker compose config
docker compose up -d --build
docker compose ps
cd dashboard; npm ci; npm run lint; npm run build
```

Go tests require the Go toolchain and Python tests require the dependencies in `risk-engine/requirements.txt`. Run `go mod tidy` once per service to generate `go.sum` before `go test`.

## ML training

`ml/train.py` generates a realistic, deliberately-overlapping dataset (patient attackers ≈18% of fraud, risky-looking legitimate users ≈8% of traffic) so held-out AUC (~0.99 synthetic) is an honest signal, not a trivially-separable shortcut. Models are versioned under `/models/<timestamp>/` with a `current` symlink for atomic hot-reload.
