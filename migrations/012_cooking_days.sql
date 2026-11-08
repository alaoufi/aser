CREATE TABLE jdatna.producer_cooking_days (
 producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id),
 day date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(producer_id,day)
);
