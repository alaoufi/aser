-- اهتمامات العضو (قرار المالك 2026-11-22): العميل الذي لم يطلب بعد يختار ما يحب من الأكلات (أقسام)
-- ليعمل «مشابه لطلباتي». جدول جديد فقط؛ لا تغيير في الطلبات ولا غيرها.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.member_interests (
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES jdatna.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);
COMMIT;
