-- التقييمات: الأسرة المنتجة (من الأعضاء والإدارة)، والمنتج (من الأعضاء)، والعضو (من الأسر المتعاملة معه).
-- تقييم واحد لكل مقيِّم على كل هدف، ويمكن تعديله. جدول جديد فقط.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.ratings (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('family','product','member')),
  target_id uuid NOT NULL,
  rater_id uuid NOT NULL REFERENCES jdatna.users(id),
  rater_role text NOT NULL CHECK (rater_role IN ('member','admin','family')),
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, target_id, rater_id)
);
CREATE INDEX IF NOT EXISTS ratings_target ON jdatna.ratings(kind, target_id);
COMMIT;
