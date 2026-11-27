-- قرارا مراجعة جديدان (قرار المالك 2026-11-27):
--   complete: «تم استكمال المطلوب» — مكتمل الشروط (موثوق) ولو لم يُرفع مستند، وتُلغى مهلة المستندات.
--   exempt:   «يُستثنى من الشروط» — يبقى ظاهرًا مع نواقصه، ولا يُوقف ولا يُنبَّه بمهلة.
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS docs_status text
  CHECK (docs_status IN ('complete','exempt'));
