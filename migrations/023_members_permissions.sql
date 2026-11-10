-- الأعضاء والصلاحيات: دور «مشرف» بصلاحيات محددة، وإيقاف الحساب. أعمدة جديدة بقيم افتراضية آمنة.
BEGIN;
ALTER TABLE jdatna.roles DROP CONSTRAINT IF EXISTS roles_name_check;
ALTER TABLE jdatna.roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('customer','producer','admin','staff'));
INSERT INTO jdatna.roles VALUES ('staff') ON CONFLICT DO NOTHING;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';
ALTER TABLE jdatna.users DROP CONSTRAINT IF EXISTS users_permissions_known;
ALTER TABLE jdatna.users ADD CONSTRAINT users_permissions_known CHECK (
  permissions <@ ARRAY['producers','orders','products','categories','locations','reports','content']::text[]
);
COMMIT;
