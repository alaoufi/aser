-- شروط المتاجر: حذف الحساب من داخل التطبيق، وحظر المحادثة والإبلاغ عنها.
-- أعمدة جديدة قابلة للفراغ فقط، دون تغيير بيانات قائمة.
BEGIN;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES jdatna.users(id);
COMMIT;
