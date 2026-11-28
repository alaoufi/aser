-- ترتيب القائمة الجانبية لكل مدير بالسحب والإفلات (طلب المالك 2026-11-28):
-- ترتيب المجموعات وترتيب الصفحات داخل كل مجموعة فقط، فوق «ترتيب القوائم» العام. لا يغيّر الصلاحيات.
CREATE TABLE IF NOT EXISTS jdatna.admin_menu_orders (
  user_id uuid PRIMARY KEY REFERENCES jdatna.users(id) ON DELETE CASCADE,
  menu_order jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
