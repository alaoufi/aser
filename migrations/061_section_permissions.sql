-- صلاحيات بالأقسام (قرار المالك 2026-11-22): كل قسم في قائمة الإدارة صلاحية مستقلة. المشرفون الحاليون
-- يُحوَّلون إلى الأقسام المكافئة لمجموعاتهم القديمة تمامًا، فلا يزيد أحد ولا ينقص:
--   producers ← approvals, producers        orders ← orders, contracts
--   categories ← categories, product-fields locations ← locations, coverage
--   reports ← reports, deleted-chats        content ← template, texts, app, views
--   products ← products                     ads ← ads
BEGIN;
ALTER TABLE jdatna.users DROP CONSTRAINT IF EXISTS users_permissions_known;
UPDATE jdatna.users u SET permissions = ARRAY(
  SELECT DISTINCT x FROM unnest(u.permissions) p, LATERAL unnest(CASE p
    WHEN 'producers' THEN ARRAY['approvals','producers']
    WHEN 'orders' THEN ARRAY['orders','contracts']
    WHEN 'categories' THEN ARRAY['categories','product-fields']
    WHEN 'locations' THEN ARRAY['locations','coverage']
    WHEN 'reports' THEN ARRAY['reports','deleted-chats']
    WHEN 'content' THEN ARRAY['template','texts','app','views']
    ELSE ARRAY[p] END) x
  ORDER BY x)
WHERE cardinality(u.permissions) > 0;
ALTER TABLE jdatna.users ADD CONSTRAINT users_permissions_known CHECK (
  permissions <@ ARRAY['views','ads','security','backups','activity','approvals','producers','orders',
    'contracts','reports','deleted-chats','suggestions','products','categories','product-fields',
    'locations','coverage','template','texts','app','menu-layout','integrations','verification','review']::text[]
);
COMMIT;
