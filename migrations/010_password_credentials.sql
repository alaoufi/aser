ALTER TABLE jdatna.users ADD COLUMN username text UNIQUE;
ALTER TABLE jdatna.users ADD COLUMN password_hash text;
ALTER TABLE jdatna.users ADD CONSTRAINT username_length CHECK(username IS NULL OR char_length(username) BETWEEN 3 AND 40);
ALTER TABLE jdatna.sessions ADD COLUMN setup_until timestamptz;
-- Existing accounts deliberately receive neither a password nor setup permission.
