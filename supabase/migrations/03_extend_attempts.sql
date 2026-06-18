/* 03_extend_attempts.sql */
ALTER TABLE assessment_attempts
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES assessment_sessions(id) ON DELETE SET NULL;

-- Index to quickly find active attempts by session
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_session ON assessment_attempts(session_id);
