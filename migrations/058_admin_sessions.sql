-- فصل جلسة الإدارة عن الجلسة الشخصية (قرار المالك 2026-11-21، مثل «أي خدمة»):
-- الدخول واحد، و«لوحة الإدارة» تفتح جلسة مستقلة (scope='admin') لها ملف دخول خاص وتنتهي بعد 12 ساعة.
-- الجلسة الشخصية (scope='site') لا تفتح أي شيء في الإدارة. عمود جديد بقيمة افتراضية، فالجلسات القائمة شخصية.
BEGIN;
ALTER TABLE jdatna.sessions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'site';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_scope_check') THEN
    ALTER TABLE jdatna.sessions ADD CONSTRAINT sessions_scope_check CHECK (scope IN ('site', 'admin'));
  END IF;
END $$;
COMMIT;
