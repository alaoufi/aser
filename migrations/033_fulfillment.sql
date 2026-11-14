-- طرق التسليم: الأسرة تختار التسليم المباشر أو التوصيل أو كليهما، وتحدد موقع التسليم المباشر.
-- العميل يختار الطريقة في الطلب، ويرسل موقعه عند التوصيل. أعمدة جديدة فقط، دون تغيير بيانات قائمة.
BEGIN;
ALTER TABLE jdatna.producer_profiles
  ADD COLUMN IF NOT EXISTS pickup_location text CHECK (pickup_location IS NULL OR length(pickup_location) <= 1000);
ALTER TABLE jdatna.order_requests
  ADD COLUMN IF NOT EXISTS fulfillment text CHECK (fulfillment IS NULL OR fulfillment IN ('pickup', 'delivery')),
  ADD COLUMN IF NOT EXISTS delivery_location text CHECK (delivery_location IS NULL OR length(delivery_location) <= 1000);
COMMIT;
