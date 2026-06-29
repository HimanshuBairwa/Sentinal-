CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    user_id UUID,
    ip_address INET,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
