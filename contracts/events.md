# Sentinel Event Contract v1

All events published to Kafka use this envelope. Producers must set `schema_version` to `1` and consumers must ignore unknown fields for forward compatibility.

```json
{
  "event_id": "uuid",
  "event_type": "auth.user.login_failed | risk.decision.created | alert.fired",
  "schema_version": 1,
  "occurred_at": "RFC3339 timestamp",
  "producer": "service name",
  "request_id": "uuid",
  "subject": { "user_id": "uuid", "email": "optional" },
  "source": { "ip_address": "optional", "user_agent": "optional", "device_id": "optional" },
  "data": {}
}
```

## Topics

| Topic | Producer | Consumer | Retention |
| --- | --- | --- | --- |
| `auth.events` | auth-service | risk-engine, analytics-service | 30 days |
| `risk.decisions` | risk-engine | analytics-service, alert-service | 7 days |
| `api.metrics` | gateway | analytics-service | 24 hours |
| `alerts.fired` | alert-service | analytics-service | 30 days |
| `alerts.dlq` | alert-service | operations | 30 days |

Authentication event types are `auth.user.registered`, `auth.user.logged_in`, and `auth.user.login_failed`. A failed login must always use `auth.user.login_failed`; legacy aliases are not part of the contract.

Risk and alert consumers should commit offsets only after durable processing. Invalid messages go to the relevant dead-letter topic with the original payload and an error reason.
