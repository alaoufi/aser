-- الرسائل الصوتية في المحادثات: جدول جديد مرتبط بالرسالة، والرسالة نفسها تبقى نصًا
-- («🎤 رسالة صوتية») فتعمل المعاينة والإشعار ونسخة العقد كما هي. الصوت لطرفي المحادثة فقط.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.message_voice (
  message_id uuid PRIMARY KEY REFERENCES jdatna.messages(id) ON DELETE CASCADE,
  mime text NOT NULL CHECK (mime IN ('audio/webm', 'audio/ogg', 'audio/mp4')),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 500 AND 120500),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 100 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
