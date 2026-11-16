-- التقييم مرة واحدة لكل تعامل: لكل طلب مكتمل (أو توصيل تم) تقييم واحد لا يُعدَّل،
-- والتعامل الجديد مع نفس المنتج أو الأسرة يتيح تقييمًا جديدًا (قد تتغير الجودة).
-- عمود جديد في جدول التقييمات فقط؛ جدول الطلبات لا يتغير.
BEGIN;
ALTER TABLE jdatna.ratings ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE jdatna.ratings DROP CONSTRAINT IF EXISTS ratings_kind_target_id_rater_id_key;
-- التقييمات السابقة تُنسب لآخر تعامل مكتمل بين الطرفين، فلا يُقيَّم الطلب نفسه مرتين.
UPDATE jdatna.ratings r SET order_id=(
  SELECT o.id FROM jdatna.order_requests o
  WHERE o.product_id=r.target_id AND o.user_id=r.rater_id AND o.status='completed'
  ORDER BY o.updated_at DESC, o.created_at DESC LIMIT 1)
WHERE r.kind='product' AND r.order_id IS NULL;
UPDATE jdatna.ratings r SET order_id=(
  SELECT o.id FROM jdatna.order_requests o
  WHERE o.producer_id=r.target_id AND o.user_id=r.rater_id AND o.status='completed'
  ORDER BY o.updated_at DESC, o.created_at DESC LIMIT 1)
WHERE r.kind='family' AND r.rater_role='member' AND r.order_id IS NULL;
UPDATE jdatna.ratings r SET order_id=(
  SELECT o.id FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
  WHERE o.user_id=r.target_id AND p.user_id=r.rater_id AND o.status='completed'
  ORDER BY o.updated_at DESC, o.created_at DESC LIMIT 1)
WHERE r.kind='member' AND r.order_id IS NULL;
UPDATE jdatna.ratings r SET order_id=(
  SELECT oc.order_id FROM jdatna.order_couriers oc
  JOIN jdatna.order_requests o ON o.id=oc.order_id JOIN jdatna.producer_profiles p ON p.id=o.producer_id
  WHERE oc.courier_user_id=r.target_id AND p.user_id=r.rater_id AND oc.status='delivered'
  ORDER BY oc.delivered_at DESC NULLS LAST LIMIT 1)
WHERE r.kind='courier' AND r.rater_role='family' AND r.order_id IS NULL;
-- تقييم واحد لكل (هدف، مقيِّم، تعامل). تقييم الإدارة بلا طلب: مرة واحدة.
CREATE UNIQUE INDEX IF NOT EXISTS ratings_once_per_order ON jdatna.ratings
  (kind, target_id, rater_id, COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid));
COMMIT;
