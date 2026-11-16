-- مركبة المندوب: سيارة (بنوعها ولونها) أو دباب. عمودا النوع واللون جديدان في ملف المندوب؛
-- car_type يبقى الوصف المعروض (مثل «سيارة كامري 2020 · أبيض» أو «دباب») فلا تتغير الشاشات القائمة.
BEGIN;
ALTER TABLE jdatna.courier_profiles ADD COLUMN IF NOT EXISTS vehicle text CHECK (vehicle IN ('car','motorcycle'));
ALTER TABLE jdatna.courier_profiles ADD COLUMN IF NOT EXISTS car_model text CHECK (length(btrim(car_model)) BETWEEN 2 AND 60);
ALTER TABLE jdatna.courier_profiles ADD COLUMN IF NOT EXISTS car_color text CHECK (length(btrim(car_color)) BETWEEN 2 AND 30);
COMMIT;
