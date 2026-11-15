-- الاقتراحات: يرسلها أي زائر أو عضو، ويقرؤها مسؤول الإدارة فقط. جدول جديد فقط.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.suggestions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  name text CHECK (name IS NULL OR length(name) <= 120),
  contact text CHECK (contact IS NULL OR length(contact) <= 120),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 5 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suggestions_recent ON jdatna.suggestions(created_at DESC);
COMMIT;
