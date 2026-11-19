-- سجل النسخ الاحتياطية (الإدارة ← التقارير ← النسخ الاحتياطية): يكتبه سكربت النسخ على الخادم بعد كل نسخة ناجحة.
-- النسخة ملف واحد مشفّر يضم قاعدة البيانات والوسائط (الصور والمستندات) والإعدادات؛ الكود في GitHub لا في النسخة.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.backup_runs (
  file text PRIMARY KEY CHECK (file ~ '^jdatna-[0-9]{8}T[0-9]{6}Z\.tar\.gpg$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  database_bytes bigint NOT NULL DEFAULT 0 CHECK (database_bytes >= 0),
  media_bytes bigint NOT NULL DEFAULT 0 CHECK (media_bytes >= 0),
  sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
