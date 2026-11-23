-- مدة صلاحية العرض بالساعات أو «دائم»، وإحصائياته تبقى بعد انتهائه (طلب المالك 2026-11-23).
--   - ends_at فارغ = عرض دائم يبقى حتى تعطّله الأسرة. وقيد ends_at > starts_at يبقى لما له نهاية.
--   - views: مرات ظهور العرض في قائمة العروض. والطلبات تُعدّ من order_requests.offer_id (بلا عمود جديد هناك).
--   - العرض المنتهي يختفي من العامة ويبقى في «عروض أسرتي» بإحصائياته؛ لا يُحذف.
BEGIN;
ALTER TABLE jdatna.offers ALTER COLUMN ends_at DROP NOT NULL;
ALTER TABLE jdatna.offers ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0 CHECK (views >= 0);
COMMIT;
