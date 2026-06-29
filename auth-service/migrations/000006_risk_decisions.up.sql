CREATE TABLE risk_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(255) NOT NULL,
    user_id UUID,
    session_id UUID,
    ip_address INET NOT NULL,
    final_score DECIMAL(5,2) NOT NULL,
    action VARCHAR(20) NOT NULL,
    scores JSONB NOT NULL DEFAULT '{}',
    triggered_rules TEXT[] NOT NULL DEFAULT '{}',
    shap_values JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_risk_decisions_user_id ON risk_decisions(user_id);
CREATE INDEX idx_risk_decisions_action ON risk_decisions(action);
CREATE INDEX idx_risk_decisions_created_at ON risk_decisions(created_at DESC);
