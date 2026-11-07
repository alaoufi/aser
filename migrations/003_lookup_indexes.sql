CREATE INDEX IF NOT EXISTS producer_public_city_idx ON jdatna.producer_profiles(status,city_id);
CREATE INDEX IF NOT EXISTS product_category_lookup_idx ON jdatna.product_categories(category_id,product_id);
CREATE INDEX IF NOT EXISTS producer_category_lookup_idx ON jdatna.producer_categories(category_id,producer_id);
CREATE INDEX IF NOT EXISTS verification_latest_idx ON jdatna.producer_verifications(producer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS document_owner_idx ON jdatna.producer_documents(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON jdatna.sessions(user_id);
CREATE INDEX IF NOT EXISTS rate_limit_expiry_idx ON jdatna.rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS otp_expiry_idx ON jdatna.otp_challenges(expires_at);
