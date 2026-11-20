-- النسخ الاحتياطية في الإدارة ← التقارير: سجل النسخ (يكتبه الخادم بعد كل نسخة ناجحة) وطلبات «خذ نسخة الآن».
-- الأنواع: full كاملة (يومية وقبل النشر)، media الصور والمستندات، codedb الكود مع قاعدة البيانات.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.backup_runs (
  file text PRIMARY KEY CHECK (file ~ '^jdatna-((media|codedb)-)?[0-9]{8}T[0-9]{6}Z\.tar\.gpg$'),
  kind text NOT NULL DEFAULT 'full' CHECK (kind IN ('full','media','codedb')),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  database_bytes bigint NOT NULL DEFAULT 0 CHECK (database_bytes >= 0),
  media_bytes bigint NOT NULL DEFAULT 0 CHECK (media_bytes >= 0),
  code_bytes bigint NOT NULL DEFAULT 0 CHECK (code_bytes >= 0),
  sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  -- رُفعت إلى التخزين الخارجي (R2)، وما زالت على قرص الخادم.
  remote boolean NOT NULL DEFAULT false,
  on_server boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backup_runs_recent ON jdatna.backup_runs(created_at DESC);
-- طلب نسخة من الإدارة: ينفّذه الخادم خلال دقيقة (خدمة jdatna-backup-requests) ويكتب نتيجته هنا.
CREATE TABLE IF NOT EXISTS jdatna.backup_requests (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('full','media','codedb')),
  requested_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  file text,
  error text CHECK (length(error) <= 500)
);
CREATE INDEX IF NOT EXISTS backup_requests_recent ON jdatna.backup_requests(requested_at DESC);
-- طلب واحد قائم في الوقت نفسه.
CREATE UNIQUE INDEX IF NOT EXISTS backup_requests_one_open ON jdatna.backup_requests((true)) WHERE status IN ('pending','running');
COMMIT;
