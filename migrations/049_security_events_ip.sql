-- التقرير الأمني: عنوان IP للحدث الأمني (للتقرير وتحديد الدولة محليًا دون إرسال العنوان لأي جهة).
-- يُحذف مع الحدث بعد 90 يومًا. العمود source المموّه يبقى للأحداث السابقة.
BEGIN;
ALTER TABLE jdatna.security_events ADD COLUMN IF NOT EXISTS ip inet;
CREATE INDEX IF NOT EXISTS security_events_ip_time ON jdatna.security_events(ip, created_at DESC) WHERE ip IS NOT NULL;
COMMIT;
