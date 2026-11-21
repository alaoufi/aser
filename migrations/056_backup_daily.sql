-- النسخ اليومية (05:00 بتوقيت الرياض، يُحفظ آخر 10) نوع مستقل عن نسخ النشر في سجل النسخ.
BEGIN;
ALTER TABLE jdatna.backup_runs DROP CONSTRAINT IF EXISTS backup_runs_kind_check;
ALTER TABLE jdatna.backup_runs
  ADD CONSTRAINT backup_runs_kind_check CHECK (kind IN ('full','daily','media','codedb'));
COMMIT;
