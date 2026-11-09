-- محادثات العضو مع الأسرة المنتجة: جداول جديدة فقط، دون تغيير بيانات قائمة.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.conversations (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES jdatna.users(id),
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  customer_read_at timestamptz NOT NULL DEFAULT now(),
  producer_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, producer_id)
);
CREATE INDEX IF NOT EXISTS conversations_producer_recent ON jdatna.conversations(producer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_customer_recent ON jdatna.conversations(customer_id, last_message_at DESC);
CREATE TABLE IF NOT EXISTS jdatna.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES jdatna.conversations(id),
  sender_id uuid NOT NULL REFERENCES jdatna.users(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS messages_conversation_time ON jdatna.messages(conversation_id, created_at);
COMMIT;
