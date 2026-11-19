-- محادثة العميل مع المندوب: طرفها الآخر مندوب (courier_id) بدل أسرة (producer_id).
-- محادثات الأسرة كما هي تمامًا؛ كل محادثة لها طرف آخر واحد فقط: أسرة أو مندوب.
BEGIN;
ALTER TABLE jdatna.conversations ALTER COLUMN producer_id DROP NOT NULL;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES jdatna.users(id);
ALTER TABLE jdatna.conversations DROP CONSTRAINT IF EXISTS conversations_one_counterpart;
ALTER TABLE jdatna.conversations ADD CONSTRAINT conversations_one_counterpart
  CHECK ((producer_id IS NULL) <> (courier_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS conversations_customer_courier
  ON jdatna.conversations(customer_id, courier_id) WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_courier_recent
  ON jdatna.conversations(courier_id, last_message_at DESC) WHERE courier_id IS NOT NULL;
COMMIT;
