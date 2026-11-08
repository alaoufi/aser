BEGIN;
CREATE TABLE jdatna.order_requests (
  id uuid PRIMARY KEY,
  request_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  user_id uuid REFERENCES jdatna.users(id),
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id),
  product_id uuid NOT NULL REFERENCES jdatna.products(id),
  offer_id uuid REFERENCES jdatna.offers(id),
  snapshot jsonb NOT NULL,
  customer_name text NOT NULL CHECK (char_length(customer_name) BETWEEN 2 AND 120),
  phone text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  meal text NOT NULL CHECK (meal IN ('breakfast','lunch','dinner','occasion')),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date AND end_date - start_date < 366),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_requests_user_idx ON jdatna.order_requests(user_id,created_at DESC);
CREATE INDEX order_requests_producer_idx ON jdatna.order_requests(producer_id,created_at DESC);
COMMIT;
