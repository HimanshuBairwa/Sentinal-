# Sentinel Production Architecture

Sentinel is a gateway-first fraud decisioning platform. Only the gateway (`:8080`) and dashboard (`:3000`) are intended to be reachable from a developer workstation. Postgres, Redis, Kafka, ClickHouse, MinIO, and application services remain on the Compose network.

## Request path

1. The dashboard or an API client authenticates through `auth-service` via the gateway.
2. The gateway validates RS256 access tokens locally, enforces rate limits, and forwards trusted identity headers.
3. Risk scoring combines deterministic rules, velocity features, network intelligence, and an optional ML model.
4. Decisions are persisted to Postgres and published to `risk.decisions`.
5. Analytics consumes all telemetry topics and durably batches events into ClickHouse before acknowledging Kafka offsets.
6. Alerts consume risk decisions, deduplicate through Redis, validate webhook destinations, and send failures to `alerts.dlq`.

## Reliability principles

- Kafka consumers commit only after durable processing.
- Every event uses the versioned envelope in `contracts/events.md`.
- Service health endpoints report dependency state; readiness returns `503` until dependencies are usable.
- Signing keys are persisted in the `jwt_keys` volume. Rotate by replacing the key through a controlled deployment and changing `JWT_KEY_ID`.
- Secrets in `.env.example` are placeholders only. Production deployments must use an external secret manager.

## Local verification

```powershell
docker compose config
docker compose up -d --build
docker compose ps
cd dashboard; npm ci; npm run lint; npm run build
```

Go tests require the Go toolchain and Python tests require the dependencies in `risk-engine/requirements.txt`.
