-- حذف نسخة احتياطية من التقرير (طلب المالك 2026-11-22): طلب «delete» ينفّذه الخادم خلال دقيقة
-- (backup-requests.sh)، فيحذف الملف من الخادم ومن التخزين الخارجي (R2). التطبيق يكتب الطلب فقط.
-- target: اسم النسخة المطلوب حذفها، بنمط أسماء النسخ نفسه.
BEGIN;
ALTER TABLE jdatna.backup_requests DROP CONSTRAINT IF EXISTS backup_requests_kind_check;
ALTER TABLE jdatna.backup_requests ADD CONSTRAINT backup_requests_kind_check
  CHECK (kind IN ('full','media','codedb','delete'));
ALTER TABLE jdatna.backup_requests ADD COLUMN IF NOT EXISTS target text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backup_requests_target_check') THEN
    ALTER TABLE jdatna.backup_requests ADD CONSTRAINT backup_requests_target_check CHECK (
      (kind = 'delete') = (target IS NOT NULL)
      AND (target IS NULL OR target ~ '^jdatna-((media|codedb)-)?[0-9]{8}T[0-9]{6}Z\.tar\.gpg$')
    );
  END IF;
END $$;
COMMIT;
