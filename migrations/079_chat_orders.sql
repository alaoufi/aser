-- الطلب داخل المحادثة (قرار المالك 2026-11-27): العميل يطلب من المحادثة، والأسرة توافق فيُتمّ،
-- وخلال ١٠ دقائق من الإتمام يُلغيه أي طرف، وبعدها بالاتفاق (طرف يطلب والآخر يوافق).
-- جدول جانبي: لا أعمدة جديدة على order_requests (قاعدة المشروع).
CREATE TABLE IF NOT EXISTS jdatna.chat_orders (
  order_id uuid PRIMARY KEY REFERENCES jdatna.order_requests(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES jdatna.conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancel_requested_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  cancel_requested_at timestamptz,
  closed_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS chat_orders_conversation ON jdatna.chat_orders(conversation_id, created_at DESC);
