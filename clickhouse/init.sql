CREATE TABLE IF NOT EXISTS api_events (
    event_id String,
    event_type LowCardinality(String),
    service_name LowCardinality(String),
    user_id Nullable(String),
    ip_address String,
    country_code FixedString(2),
    risk_score Float32,
    risk_action LowCardinality(String),
    latency_ms UInt32,
    status_code UInt16,
    endpoint String,
    method LowCardinality(String),
    timestamp DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
    date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (date, service_name, timestamp)
TTL date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS api_metrics_per_minute
ENGINE = AggregatingMergeTree()
ORDER BY (service_name, endpoint, minute)
AS SELECT
    service_name, endpoint,
    toStartOfMinute(timestamp) AS minute,
    count() AS total_requests,
    countIf(status_code >= 500) AS error_count,
    avgState(latency_ms) AS avg_latency_state,
    quantileState(0.99)(latency_ms) AS p99_latency_state,
    avgState(risk_score) AS avg_risk_score_state
FROM api_events
GROUP BY service_name, endpoint, minute;
