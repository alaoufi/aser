-- حذف المحادثة: تختفي من الطرفين، وتبقى كاملة للإدارة. لا يُحذف شيء من القاعدة.
-- deleted_at/deleted_by: من حذف ومتى. visible_from: إن بدأ أحدهما المحادثة من جديد بعد الحذف
-- عادت فارغة للطرفين (الرسائل قبل هذا الوقت للإدارة فقط). أعمدة جديدة في المحادثات فقط.
BEGIN;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS visible_from timestamptz;
CREATE INDEX IF NOT EXISTS conversations_deleted ON jdatna.conversations(deleted_at DESC) WHERE deleted_at IS NOT NULL;
-- سجل كل حذف (قد تُحذف المحادثة نفسها أكثر من مرة بعد استئنافها).
CREATE TABLE IF NOT EXISTS jdatna.conversation_deletions (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES jdatna.conversations(id),
  deleted_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  visible_from timestamptz,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_deletions_time ON jdatna.conversation_deletions(deleted_at DESC);
COMMIT;
