CREATE TABLE risk_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,
  user_id UUID NOT NULL REFERENCES users(id),
  risk_score INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('APPROVED', 'FLAGGED', 'BLOCKED')),
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
