-- طلب المالك 2026-11-26: «كل دخول يحسب زيارة؛ لو حدّث أو دخل عدة مرات تُحسب كل مرة».
-- زيارات الموقع لكل يوم (بتوقيت الرياض)، تزيد مع كل فتح أو تحديث للصفحة. الإجمالي في view_counts (kind='site').
-- view_seen يبقى لعدّ الزوار المختلفين في الإحصاءات، ولا يحدد العدّ بعد الآن.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.site_visits_daily (
  day date PRIMARY KEY,
  visits bigint NOT NULL DEFAULT 0 CHECK (visits >= 0)
);
-- أيام view_seen المحفوظة (آخر يومين) تبدأ بعدد زوارها السابق، فلا ينزل رقم اليوم عند النشر.
INSERT INTO jdatna.site_visits_daily(day,visits)
SELECT day,count(*) FROM jdatna.view_seen WHERE kind='site' GROUP BY day
ON CONFLICT (day) DO NOTHING;
COMMIT;
