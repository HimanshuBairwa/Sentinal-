<div align="center">

# 🛡️ SENTINEL

**Real-time fraud decisioning platform** — deterministic rules, velocity features, IP intelligence, and gradient-boosted ML, combined into one sub-100ms verdict per event.

[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go&logoColor=white)](gateway/go.mod)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white&labelColor=2b2b2b)](risk-engine/requirements.txt)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](risk-engine/requirements.txt)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](dashboard/package.json)
[![Kafka](https://img.shields.io/badge/Kafka-3.7-231F20?logo=apachekafka&logoColor=white)](docker-compose.yml)
[![Postgres](https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white)](docker-compose.yml)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-24.3-FFCC00?logo=clickhouse&logoColor=black)](docker-compose.yml)

*Gateway-first microservices · event-driven · zero-trust auth · fully observable*

</div>

---

## What it does

Every authentication or transaction event flows through the platform and receives one of four verdicts in under 100ms:

```
                    ┌────────────┐
   client ──────►  │  GATEWAY   │  RS256 JWT verified locally, Redis sliding-window rate limit
   (dashboard/API) └─────┬──────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌──────────┐  ┌────────────┐  ┌──────────────┐
   │   AUTH   │  │ RISK ENGINE │  │  ANALYTICS   │
   │ service  │  │ (FastAPI + │  │ (ClickHouse, │
   │ (Go)     │  │  LightGBM) │  │  batch+WS)   │
   └────┬─────┘  └─────┬──────┘  └──────┬───────┘
        │              │                │
        └────► auth.events   ──────────►│
                       ├────► risk.decisions ──► ALERT service ──► webhook/DLQ
                       │                     │
                       ▼                     ▼
                  feature store          ClickHouse ◄── dashboard (live WebSocket)
                  (Redis ZSETs)
```

1. **Gateway** verifies RS256 JWTs locally (public-key hot-reload every 30s), rate-limits per IP, and forwards only *verified* identity headers. The rules management API is reachable at `/api/v1/rules` (admin-gated mutations).
2. **Risk engine** extracts **56 features** in parallel (velocity windows from Redis ZSETs, IP intelligence, behavioral history, device signals), evaluates **deterministic rules**, scores with **LightGBM**, and aggregates into a weighted verdict — `ALLOW / REVIEW / CHALLENGE / BLOCK`. Rules are **hot-reloadable**: create/update/delete from the dashboard takes effect on the next request, no restart.
3. Every decision is persisted to Postgres (with UUID/INET coercion so synthetic IDs never fail), published to `risk.decisions`, streamed to the dashboard in real time, and durably batched into **ClickHouse** (offsets commit only after durable writes). Analytics rollups (`/fraud-rate`, `/geo`, `/top-threats`) serve real 24-hour aggregations that the dashboard charts and threat map consume.
4. **Alert service** deduplicates through Redis Lua, validates webhook destinations (SSRF-guard: no private IPs, no redirects, HTTPS-only in production), retries with exponential backoff, and dead-letters failures to `alerts.dlq`.

## Architecture at a glance

| Service | Tech | Responsibilities |
| --- | --- | --- |
| **gateway** | Go, chi, go-redis | JWT verification (local), rate limiting, reverse proxy, dependency-free Prometheus metrics |
| **auth-service** | Go, pgx, kafka-go | Registration/login, bcrypt(12), account lockout, RS256 + refresh rotation with **reuse detection**, session families in Redis |
| **risk-engine** | Python, FastAPI, LightGBM, SHAP | Feature extraction, rules engine (safe AST eval — never `eval`), ML scoring, explainability |
| **analytics-service** | Go, Fiber, clickhouse-go | Kafka → durable batches → ClickHouse, WebSocket fan-out (per-client queues, no head-of-line blocking) |
| **alert-service** | Go, kafka-go, go-redis | Dedup + rate limit (Lua, atomic), SSRF-safe webhook dispatch, DLQ |
| **dashboard** | Next.js 16, React 19, Tailwind 4, Recharts, Framer Motion | Live command center, threat map, rules management (full CRUD), transaction ledger, analytics rollups, system health |

**Infrastructure:** Postgres 16 · Redis 7.2 · Kafka 3.7 (KRaft) · ClickHouse 24.3 · MinIO · MLflow · Prometheus · Grafana (provisioned) · Jaeger

## Quickstart

```bash
cp .env.example .env        # dev secrets are placeholders
docker compose up -d --build
docker compose ps           # all services should be healthy

# Optional: seed demo data
make seed-analytics         # 10k events into ClickHouse
```

| Surface | URL |
| --- | --- |
| Dashboard | http://localhost:3000 |
| API Gateway | http://localhost:8080 |
| Grafana | http://localhost:3001 (admin / `GRAFANA_PASSWORD`) |
| Jaeger traces | http://localhost:16686 |
| MLflow | http://localhost:5000 |

### Demo credentials

Register through the dashboard's **Register** tab or `POST /api/v1/auth/register` — password requires 12+ chars with upper/lower/digit/special. **The first account created becomes the platform admin**, unlocking rules management.

## Score a request

```bash
curl -X POST http://localhost:8080/api/v1/risk/score \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt-001",
    "event_type": "user.login",
    "request_id": "req-001",
    "ip_address": "203.0.113.5",
    "user_agent": "Mozilla/5.0",
    "geo": {"country_code": "RU", "lat": 55.75, "lon": 37.61},
    "device": {"fingerprint": "fp-abc", "is_headless": false}
  }'
```

Response includes the verdict, per-signal breakdown, triggered rules, and **SHAP top-5 explainability**.

## The fraud model (honest ML)

The training pipeline generates a realistic, *overlapping* dataset: patient attackers that mimic legitimate behavior (18%) and risky-looking legitimate users (8%) — so the reported AUC (~0.99 on synthetic data) is a genuine reflection of separability, not a trivially-separable shortcut. Retraining is versioned (`/models/<ts>/model.lgb`) with atomic `current` symlink swaps for zero-downtime reload.

```bash
make train   # inside the risk-engine container
```

## Reliability principles (enforced)

- Kafka consumers commit offsets **only after durable processing** (analytics batches; feature-store updates).
- All events use the versioned envelope in [`contracts/events.md`](contracts/events.md).
- Health endpoints report **dependency state** (DB/Redis/ClickHouse) and return `503` when degraded — orchestrators see truth.
- The gateway hot-reloads the auth public key every 30s — an auth-service restart or key rotation never causes an outage.
- Refresh-token reuse revokes the entire token family (stolen-token containment).

## Testing & CI

```bash
make test    # Go: -race -cover | Python: pytest --cov | Dashboard: lint + build
```

CI (`.github/workflows/ci.yml`) runs the dashboard build, Python compile+tests, and `go test -race` across all four Go services on every push and PR.

## The dashboard experience

The Next.js command center is a product-grade console, not a demo:

- **Real-geometry world map** (Natural Earth projection, 177 countries via d3-geo + topojson) with animated attack arcs, expanding signal halos, radar sweep, and nation-level hover highlighting — fed by live ClickHouse geo rollups.
- **Toast notification system** — rule created/updated/deleted, auth results, and critical BLOCK events (score ≥ 85) fire spring-animated, drag-to-dismiss notifications with auto-dismiss progress bars.
- **Arc gauges with spring-physics needles** — threat posture (block rate, challenge rate, peak risk) computed live from the event stream.
- **3D tilt metric cards**, cursor-following spotlight glass panels, animated SVG progress rings, and shimmering skeleton loaders on every fetch surface — all `prefers-reduced-motion` aware.
- **Live telemetry once, consumed everywhere** — a single shared WebSocket + REST polling loop drives the feed, charts, map, notifications, and command palette (⌘K fuzzy search over pages, IPs, users).
- Every metric is **computed from real data** — no hardcoded trends, skeletons while loading, degraded-state banners when ClickHouse is down.

## Deploying the dashboard (Vercel)

The dashboard ships with a **self-engaging demo mode**: when no backend is reachable (like a public Vercel deployment), it automatically switches to a deterministic, seeded live-telemetry simulation — the world map, gauges, feed, charts, and toasts all run on realistic data, with an honest `DEMO MODE` badge. Point `NEXT_PUBLIC_API_URL` at a reachable gateway and it uses real data instead. No code changes required either way.

**Deploy in 2 minutes:**

1. Push the repo to GitHub (done — this repo).
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Set **Root Directory** to `dashboard` (everything else auto-detects: Next.js 16, `npm install`, `next build`).
4. Deploy — the atlas is served statically with immutable caching; zero other env vars needed for demo mode.

**Live backend later:** set `NEXT_PUBLIC_API_URL=https://your-gateway.example.com` in Vercel project settings.

## Repository layout

```
gateway/            Go · chi router, JWT middleware, rate limiter, metrics
auth-service/       Go · users, sessions, JWT rotation, Kafka events, migrations
risk-engine/        Python · features, rules (CRUD + hot reload), ML, IP intel
analytics-service/  Go · batch engine, ClickHouse repo, WebSocket hub, seed tool
alert-service/      Go · dedup Lua, webhook dispatcher, DLQ
dashboard/          Next.js 16 · app router, live context, rules UI, charts
contracts/          Event envelope + JSON schema
observability/      Prometheus config, Grafana provisioning + dashboard
clickhouse/         Schema init (MergeTree, TTL, materialized rollups)
```

## Production hardening checklist

Before exposing this beyond localhost: replace all `.env.example` secrets with an external secret manager, enable TLS termination in front of the gateway, set `TRUST_PROXY=true` only behind a trusted proxy, set `RISK_ENGINE_FAIL_OPEN=false` to fail-closed on model absence, restrict CORS origins, and put Kafka/Postgres/Redis/ClickHouse on private networks (the compose file already keeps them off the host).

---

<div align="center">

**Sentinel** — stop fraud before it happens.

</div>
