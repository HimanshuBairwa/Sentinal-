CREATE TABLE fraud_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    expression TEXT NOT NULL,
    score_contribution INTEGER NOT NULL CHECK (score_contribution BETWEEN 0 AND 100),
    action VARCHAR(20) NOT NULL CHECK (action IN ('BLOCK','CHALLENGE','REVIEW','FLAG')),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 50,
    hit_count BIGINT NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
