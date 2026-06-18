/* 02_create_assessment_audit.sql */
CREATE TABLE assessment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_payload jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessment_audit_session ON assessment_audit(session_id);
