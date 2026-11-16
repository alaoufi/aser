-- المشاهدات والزوار: عدّاد لكل منتج وأسرة وللموقع كله (kind='site'، target_id صفري)، ومشاهدة واحدة لكل زائر لكل صفحة في اليوم (جدول view_seen
-- يُحذف ما مضى عليه يومان). ظهور العدد للجميع أو للإدارة فقط بإعداد views.public (افتراضي: off).
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.view_counts (
  kind text NOT NULL CHECK (kind IN ('product','producer','site')),
  target_id uuid NOT NULL,
  views bigint NOT NULL DEFAULT 0 CHECK (views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, target_id)
);
CREATE TABLE IF NOT EXISTS jdatna.view_seen (
  kind text NOT NULL,
  target_id uuid NOT NULL,
  visitor text NOT NULL CHECK (visitor ~ '^[a-f0-9]{16}$'),
  day date NOT NULL,
  PRIMARY KEY (kind, target_id, visitor, day)
);
CREATE INDEX IF NOT EXISTS view_seen_day ON jdatna.view_seen(day);
ALTER TABLE jdatna.site_settings DROP CONSTRAINT IF EXISTS site_views_value;
ALTER TABLE jdatna.site_settings ADD CONSTRAINT site_views_value
  CHECK (key <> 'views.public' OR value IN ('on','off'));
INSERT INTO jdatna.site_settings(key,value) VALUES('views.public','off') ON CONFLICT (key) DO NOTHING;
COMMIT;
