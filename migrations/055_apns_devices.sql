-- إشعارات تطبيق الآيفون (Apple Push Notification service): رمز كل جهاز آيفون مربوط بحساب.
-- جدول جديد فقط. مفتاح الإرسال (.p8) على الخادم في /etc/jdatna/runtime.env، لا في القاعدة ولا في الكود.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.apns_devices (
  token text PRIMARY KEY CHECK (token ~ '^[0-9a-f]{64,200}$'),
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS apns_devices_user ON jdatna.apns_devices(user_id);
COMMIT;
