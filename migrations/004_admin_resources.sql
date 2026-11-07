ALTER TABLE jdatna.products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE jdatna.reports ADD COLUMN IF NOT EXISTS resolution_reason text;
ALTER TABLE jdatna.reports ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES jdatna.users(id);
ALTER TABLE jdatna.reports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS reports_status_idx ON jdatna.reports(status,created_at DESC);
