CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash CHAR(64) NOT NULL UNIQUE,
    token_family UUID NOT NULL,
    device_info JSONB NOT NULL DEFAULT '{}',
    ip_address INET NOT NULL,
    user_agent TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_token_family ON sessions(token_family);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
