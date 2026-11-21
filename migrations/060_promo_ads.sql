-- الإعلانات الترويجية (طلب المالك 2026-11-22: «اعملها نفس أي خدمة»)، من المكتبة المشتركة
-- (code/promo-ads، «أي خدمة» 1.1.137) مكيّفة لجدتنا. إعلانات الإدارة الآن؛ «أعلن» المدفوعة لاحقًا بعد
-- اختيار طريقة الدفع (user_id ومفتاح ads:paid جاهزان ولا يُستعملان بعد). جداول جديدة فقط.
BEGIN;
-- الحملات: تجمع إعلانات معلن واحد تحت مدة وحد مشاهدات كلي ويومي (AYK-409).
CREATE TABLE IF NOT EXISTS jdatna.ad_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  advertiser text CHECK (length(advertiser) <= 150),
  notes text CHECK (length(notes) <= 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  starts_at timestamptz,
  ends_at timestamptz,
  max_views integer CHECK (max_views > 0),
  daily_max_views integer CHECK (daily_max_views > 0),
  created_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- صورة الإعلان أو مقطعه: عامة (تُعرض لكل زائر)، محفوظة في القاعدة فتدخل النسخ الاحتياطية.
CREATE TABLE IF NOT EXISTS jdatna.ad_media (
  id uuid PRIMARY KEY,
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 15728640),
  width integer,
  height integer,
  data bytea NOT NULL,
  created_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jdatna.ads (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text CHECK (length(description) <= 1000),
  link text CHECK (link IS NULL OR link ~ '^(https://|/)' AND length(link) <= 500),
  media_id uuid REFERENCES jdatna.ad_media(id) ON DELETE SET NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  placements text[] NOT NULL CHECK (cardinality(placements) BETWEEN 1 AND 20),
  -- active: يعمل، paused: موقوف، cancelled: ملغى. وrequested/approved لـ«أعلن» لاحقًا.
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('requested','approved','active','paused','cancelled')),
  -- NULL = إعلان الإدارة (ترويجي، بلا كلمة «إعلان»).
  user_id uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES jdatna.ad_campaigns(id) ON DELETE SET NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  max_views integer CHECK (max_views > 0),
  daily_max_views integer CHECK (daily_max_views > 0),
  freq_cap_per_day integer CHECK (freq_cap_per_day > 0),
  views_count integer NOT NULL DEFAULT 0,
  clicks_count integer NOT NULL DEFAULT 0,
  priority smallint NOT NULL DEFAULT 2 CHECK (priority IN (1,2,3)),
  weight smallint NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  pacing text NOT NULL DEFAULT 'asap' CHECK (pacing IN ('asap','even')),
  -- {"days":[0-6],"from":"HH:MM","to":"HH:MM"} بتوقيت السعودية.
  schedule jsonb,
  target_regions text[] NOT NULL DEFAULT '{}',
  target_cities text[] NOT NULL DEFAULT '{}',
  target_devices text[] NOT NULL DEFAULT '{}' CHECK (target_devices <@ ARRAY['mobile','desktop']),
  target_audience text[] NOT NULL DEFAULT '{}' CHECK (target_audience <@ ARRAY['guest','customer','producer']),
  exclusive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS ads_live ON jdatna.ads(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ads_campaign ON jdatna.ads(campaign_id);
-- صلاحية «الإعلانات الترويجية» للمشرفين (مثل ads.manage في «أي خدمة»).
ALTER TABLE jdatna.users DROP CONSTRAINT IF EXISTS users_permissions_known;
ALTER TABLE jdatna.users ADD CONSTRAINT users_permissions_known CHECK (
  permissions <@ ARRAY['producers','orders','products','categories','locations','reports','content','ads']::text[]
);
-- المشاهدات والنقرات يوميًا (تقارير الإدارة، والحد اليومي، والتوزيع المتساوي).
CREATE TABLE IF NOT EXISTS jdatna.ad_stats_daily (
  ad_id uuid NOT NULL REFERENCES jdatna.ads(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day)
);
COMMIT;
