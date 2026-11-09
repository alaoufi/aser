-- مراحل تنفيذ الطلب للأسرة وتنبيه «طلب جديد».
-- حالتان جديدتان: preparing (قيد التجهيز) وready (جاهز للتسليم). الحالات السابقة وبياناتها دون تغيير.
-- producer_seen_at: متى اطّلعت الأسرة على الطلب في التنبيه؛ NULL يعني طلبًا جديدًا لم يُعرض.
BEGIN;
ALTER TABLE jdatna.order_requests DROP CONSTRAINT IF EXISTS order_requests_status_check;
ALTER TABLE jdatna.order_requests ADD CONSTRAINT order_requests_status_check
  CHECK (status IN ('pending','accepted','preparing','ready','declined','completed','cancelled'));
ALTER TABLE jdatna.order_requests ADD COLUMN IF NOT EXISTS producer_seen_at timestamptz;
-- الطلبات الموجودة قبل هذا الترحيل لا تُعرض كتنبيهات جديدة.
UPDATE jdatna.order_requests SET producer_seen_at = created_at WHERE producer_seen_at IS NULL;
CREATE INDEX IF NOT EXISTS order_requests_producer_unseen_idx
  ON jdatna.order_requests(producer_id, created_at DESC) WHERE producer_seen_at IS NULL;
COMMIT;
