-- مكتبة موائد الأسر (طلب المالك 2026-11-26): كل أسرة تختار مائدة تميزها في صفحتها، وعليها
-- منتجاتها و«حياكم الله» (أو عبارة تكتبها الأسرة). جدول مستقل (لا أعمدة على order_requests ولا producer_profiles).
-- المعرّفات تتحقق منها مكتبة src/lib/family-table.ts؛ القيد هنا يمنع النصوص الغريبة فقط.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.producer_table (
  producer_id uuid PRIMARY KEY REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  shape text NOT NULL CHECK (shape ~ '^[a-z]{2,20}$'),
  height text NOT NULL CHECK (height ~ '^[a-z]{2,20}$'),
  finish text NOT NULL CHECK (finish ~ '^[a-z]{2,20}$'),
  ornament text NOT NULL CHECK (ornament ~ '^[a-z]{2,20}$'),
  frame text NOT NULL CHECK (frame ~ '^[a-z]{2,20}$'),
  display text NOT NULL CHECK (display ~ '^[a-z]{2,20}$'),
  -- عبارة الأسرة على مائدتها؛ الفارغة تعني الافتراضية «حياكم الله» من «نصوص الموقع».
  welcome text CHECK (welcome IS NULL OR char_length(welcome) BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
