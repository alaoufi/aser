ALTER TABLE jdatna.otp_challenges ADD COLUMN purpose text;
-- Legacy codes have no reliable purpose: consume them, retaining users and existing normal sessions.
UPDATE jdatna.otp_challenges SET purpose='signup',consumed_at=COALESCE(consumed_at,now()),expires_at=LEAST(expires_at,now()) WHERE purpose IS NULL;
ALTER TABLE jdatna.otp_challenges ALTER COLUMN purpose SET NOT NULL;
ALTER TABLE jdatna.otp_challenges ADD CONSTRAINT otp_purpose CHECK(purpose IN ('signup','reset'));
ALTER TABLE jdatna.sessions ADD COLUMN setup_only boolean NOT NULL DEFAULT false;
UPDATE jdatna.sessions SET setup_until=NULL WHERE NOT setup_only;
