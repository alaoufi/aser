-- إشعارات الجوال (Web Push): اشتراكات أجهزة المستخدمين، ومفاتيح VAPID للخادم.
-- جداول جديدة فقط. المفاتيح تُولَّد على الخادم عند أول استخدام ولا تُكتب في الكود.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.push_subscriptions (
  endpoint text PRIMARY KEY CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 20 AND 200),
  auth text NOT NULL CHECK (length(auth) BETWEEN 10 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON jdatna.push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS jdatna.push_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
