CREATE TABLE jdatna.offers (
 id uuid PRIMARY KEY,
 producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id),
 product_id uuid REFERENCES jdatna.products(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 description text NOT NULL CHECK(length(description)<=2000),
 terms text NOT NULL CHECK(length(terms) BETWEEN 1 AND 2000),
 price numeric(10,2) CHECK(price>=0),
 audience text NOT NULL CHECK(audience IN ('general','students','employees','families')),
 meal text NOT NULL CHECK(meal IN ('breakfast','lunch','dinner','occasion')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_producer ON jdatna.offers(producer_id,created_at DESC);
CREATE INDEX offers_active ON jdatna.offers(ends_at,audience) WHERE enabled;
CREATE TABLE jdatna.offer_preferences (
 user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
 audience text NOT NULL CHECK(audience IN ('students','employees','families')),
 PRIMARY KEY(user_id,audience)
);
