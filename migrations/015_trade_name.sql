ALTER TABLE jdatna.producer_profiles ADD COLUMN trade_name text CHECK(trade_name IS NULL OR char_length(trade_name) BETWEEN 1 AND 120);
