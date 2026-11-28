-- جرس «الإشعارات» (قرار المالك 2026-11-27): كل إشعار يُرسل للعضو يُحفظ هنا ليجده في الموقع والتطبيق
-- بعد أن يختفي من شريط الجوال. يُحفظ آخر ٢٠٠ إشعار لكل عضو.
CREATE TABLE IF NOT EXISTS jdatna.notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) <= 200),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  url text NOT NULL DEFAULT '/' CHECK (char_length(url) <= 500),
  tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user_recent ON jdatna.notifications(user_id, created_at DESC);
