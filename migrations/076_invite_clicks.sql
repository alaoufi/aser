-- «ادعُ صديقًا» على الآيفون (قرار المالك 2026-11-27): تطبيق الآيفون لا يرى ما حفظه Safari من رابط الدعوة،
-- فيُسجَّل فتح الرابط ببصمة مشفّرة لشبكة الجهاز (لا العنوان نفسه)، ويُحذف بعد يوم.
-- من يسجّل بلا رقم دعوة من الشبكة نفسها خلال ٢٤ ساعة يُحسب لصاحب الدعوة إن كانت دعوة واحدة فقط منها.
CREATE TABLE IF NOT EXISTS jdatna.invite_clicks (
  referrer_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  net text NOT NULL CHECK (char_length(net) BETWEEN 8 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (net, referrer_id)
);
CREATE INDEX IF NOT EXISTS invite_clicks_recent ON jdatna.invite_clicks(created_at);
ALTER TABLE jdatna.referrals DROP CONSTRAINT IF EXISTS referrals_via_check;
ALTER TABLE jdatna.referrals ADD CONSTRAINT referrals_via_check
  CHECK (via IN ('link','number','phone','network'));
