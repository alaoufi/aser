-- طرق التسليم: الأسرة تختار التسليم المباشر أو التوصيل أو كليهما، وتحدد موقع التسليم المباشر.
-- العميل يختار الطريقة في الطلب ويرسل موقعه عند التوصيل. طريقة الطلب في جدول مستقل مرتبط به،
-- فلا يتغير أي عمود في صفوف الطلبات القائمة (فحص النشر يقارن بصمة الطلبات قبل الترحيل وبعده).
BEGIN;
ALTER TABLE jdatna.producer_profiles
  ADD COLUMN IF NOT EXISTS pickup_location text CHECK (pickup_location IS NULL OR length(pickup_location) <= 1000);
CREATE TABLE IF NOT EXISTS jdatna.order_fulfillment (
  order_id uuid PRIMARY KEY REFERENCES jdatna.order_requests(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('pickup', 'delivery')),
  location text CHECK (location IS NULL OR length(location) <= 1000)
);
COMMIT;
