-- أرقام الأعضاء و«ادعُ صديقًا» (قرار المالك 2026-11-22).
--
-- 1) رقم داخلي من 6 أرقام (internal_no) للعلاقات البرمجية: ثابت لا يتغير، يظهر للإدارة فقط.
-- 2) رقم العضو المعروض (member_no) فوق الاسم، وهو المميِّز له لأن الأسماء تتكرر:
--    - يُعطى تلقائيًا بالتسلسل من 100 (الأعضاء الحاليون بترتيب تسجيلهم).
--    - المحجوز لا يُعطى تلقائيًا أبدًا: الأرقام المتشابهة من رقمين إلى أربعة (11…99، 111…999،
--      1111…9999) و2030. والأرقام الصغيرة (1–99) لا تُعطى تلقائيًا كذلك؛ تمنحها الإدارة.
--    - الإدارة تغيّر رقم العضو لرقم متاح (ولو محجوزًا). الرقم القديم يبقى لصاحبه في السجل
--      (روابط الدعوة القديمة تصل إليه) ولا يُعطى لغيره.
-- 3) «ادعُ صديقًا»: من يسجل برابط الدعوة (jdtna.sa/r/رقم العضو) أو يكتب «رقم الدعوة» عند التسجيل
--    يُحسب لصاحب الدعوة بعد تأكيد جواله: مرة واحدة لكل حساب، ولا يدعو أحد نفسه. والرصيد عددٌ فقط.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS jdatna.user_internal_no START 100001 MAXVALUE 999999;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS internal_no integer UNIQUE;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS member_no integer UNIQUE CHECK (member_no > 0);

CREATE TABLE IF NOT EXISTS jdatna.member_no_history (
  member_no integer PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- المحجوز عن التسجيل: كل أرقامه متشابهة (من رقمين إلى أربعة)، أو 2030.
CREATE OR REPLACE FUNCTION jdatna.member_no_reserved(n integer) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT n = 2030 OR (n BETWEEN 11 AND 9999 AND n::text ~ '^(\d)\1+$')
$$;

-- الرقم التالي المتاح من 100: لا محجوز، ولا مستعمل، ولا في سجل الأرقام القديمة.
CREATE OR REPLACE FUNCTION jdatna.next_member_no() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('jdatna.member_no'));
  SELECT greatest(99, coalesce(max(member_no), 99)) INTO n FROM jdatna.users WHERE member_no >= 100;
  SELECT greatest(n, coalesce(max(member_no), 99)) INTO n FROM jdatna.member_no_history WHERE member_no >= 100;
  LOOP
    n := n + 1;
    EXIT WHEN NOT jdatna.member_no_reserved(n)
      AND NOT EXISTS (SELECT 1 FROM jdatna.users WHERE member_no = n)
      AND NOT EXISTS (SELECT 1 FROM jdatna.member_no_history WHERE member_no = n);
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION jdatna.assign_user_numbers() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.internal_no IS NULL THEN NEW.internal_no := nextval('jdatna.user_internal_no'); END IF;
  IF NEW.member_no IS NULL THEN NEW.member_no := jdatna.next_member_no(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_assign_numbers ON jdatna.users;
CREATE TRIGGER users_assign_numbers BEFORE INSERT ON jdatna.users
  FOR EACH ROW EXECUTE FUNCTION jdatna.assign_user_numbers();

-- الأعضاء الحاليون: بترتيب تسجيلهم.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM jdatna.users WHERE internal_no IS NULL OR member_no IS NULL ORDER BY created_at, id LOOP
    UPDATE jdatna.users SET
      internal_no = coalesce(internal_no, nextval('jdatna.user_internal_no')),
      member_no = coalesce(member_no, jdatna.next_member_no())
    WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE jdatna.users ALTER COLUMN internal_no SET NOT NULL;
ALTER TABLE jdatna.users ALTER COLUMN member_no SET NOT NULL;

CREATE TABLE IF NOT EXISTS jdatna.referrals (
  referred_id uuid PRIMARY KEY REFERENCES jdatna.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  via text NOT NULL CHECK (via IN ('link','number','phone')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referred_id <> referrer_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer ON jdatna.referrals(referrer_id, created_at DESC);

ALTER TABLE jdatna.users DROP CONSTRAINT IF EXISTS users_permissions_known;
ALTER TABLE jdatna.users ADD CONSTRAINT users_permissions_known CHECK (
  permissions <@ ARRAY['views','ads','security','backups','activity','approvals','producers','orders',
    'contracts','reports','deleted-chats','suggestions','products','categories','product-fields',
    'locations','coverage','template','texts','app','menu-layout','integrations','verification','review',
    'invites']::text[]
);
COMMIT;
