ALTER TABLE jdatna.categories ADD COLUMN parent_id text REFERENCES jdatna.categories(id);
ALTER TABLE jdatna.categories ADD CONSTRAINT category_not_own_parent CHECK(parent_id IS NULL OR parent_id<>id);
CREATE INDEX categories_parent ON jdatna.categories(parent_id);
UPDATE jdatna.categories SET name='منتجات الألبان' WHERE id='13' AND name='مشتقات الألبان' AND slug='category-13';
