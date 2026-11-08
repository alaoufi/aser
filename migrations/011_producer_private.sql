CREATE TABLE jdatna.producer_private (
  producer_id uuid PRIMARY KEY REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  encrypted_payload bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- National ID and exact work location are encrypted together. Existing profiles are not fabricated/backfilled.
