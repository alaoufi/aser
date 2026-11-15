-- المندوب: التسعير (داخل المدينة سعر واحد أو بالاتفاق، ولكل مركز تابع سعره)، وحالة «نشط الآن»،
-- وإسناد توصيل الطلب: الأسرة تسند الطلب لمندوب فيصله موقع الاستلام من الأسرة وموقع التوصيل للعميل.
-- جداول وأعمدة جديدة فقط؛ صفوف الطلبات القائمة لا تتغير (الإسناد في جدول مستقل).
BEGIN;
ALTER TABLE jdatna.courier_profiles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS city_price numeric(10,2) CHECK (city_price IS NULL OR city_price BETWEEN 0 AND 99999);
CREATE TABLE IF NOT EXISTS jdatna.courier_centers (
  courier_id uuid NOT NULL REFERENCES jdatna.courier_profiles(id) ON DELETE CASCADE,
  center_node_id text NOT NULL REFERENCES jdatna.coverage_nodes(id),
  price numeric(10,2) CHECK (price IS NULL OR price BETWEEN 0 AND 99999),
  PRIMARY KEY (courier_id, center_node_id)
);
CREATE TABLE IF NOT EXISTS jdatna.order_couriers (
  order_id uuid PRIMARY KEY REFERENCES jdatna.order_requests(id) ON DELETE CASCADE,
  courier_user_id uuid NOT NULL REFERENCES jdatna.users(id),
  pickup_location text NOT NULL CHECK (length(btrim(pickup_location)) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','delivered')),
  assigned_by uuid NOT NULL REFERENCES jdatna.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS order_couriers_courier ON jdatna.order_couriers(courier_user_id, assigned_at DESC);
-- تقييم المندوب: تقيّمه الأسرة بعد أن يوصل طلبها.
ALTER TABLE jdatna.ratings DROP CONSTRAINT IF EXISTS ratings_kind_check;
ALTER TABLE jdatna.ratings ADD CONSTRAINT ratings_kind_check CHECK (kind IN ('family','product','member','courier'));
COMMIT;
