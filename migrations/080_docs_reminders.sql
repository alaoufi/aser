-- تذكير أسبوعي بالمستندات (قرار المالك 2026-11-28): متى أُرسل آخر تذكير لكل أسرة.
-- جدول مستقل بلا أعمدة جديدة على الجداول القائمة.
CREATE TABLE IF NOT EXISTS jdatna.producer_docs_reminders (
  producer_id uuid PRIMARY KEY REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
