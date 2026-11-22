-- «ادعُ صديقًا» (قرار المالك 2026-11-22): لكل عضو رابط دعوة، ومن يسجل به أو يكتب رقم من دعاه
-- يُحسب لصاحب الدعوة بعد تأكيد جواله، مرة واحدة لكل حساب، ولا يدعو أحد نفسه. «الرصيد» عددٌ فقط
-- (لأي حسابات مستقبلية يُتفاهم عليها). جدولان جديدان، وقسم صلاحية جديد «invites» للإدارة.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES jdatna.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[2-9a-km-zA-HJ-NP-Z]{7}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jdatna.referrals (
  referred_id uuid PRIMARY KEY REFERENCES jdatna.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  via text NOT NULL CHECK (via IN ('link','phone')),
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
