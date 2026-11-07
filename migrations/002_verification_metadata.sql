ALTER TABLE jdatna.producer_verifications ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE jdatna.producer_verifications ADD COLUMN IF NOT EXISTS document_expires_at date;
