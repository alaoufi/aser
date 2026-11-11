-- شهادة «أسرة مميزة»: تصدر مرة واحدة للأسرة عند بلوغ 10 تقييمات كلها 5 نجوم، وتبقى بتاريخ إصدارها.
-- جدول جديد فقط، دون تغيير بيانات قائمة.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.certificates (
  id uuid PRIMARY KEY,
  producer_id uuid NOT NULL UNIQUE REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  family_name text NOT NULL,
  ratings_count integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
