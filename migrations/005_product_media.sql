ALTER TABLE jdatna.product_media ADD COLUMN IF NOT EXISTS object_key text UNIQUE;
ALTER TABLE jdatna.product_media ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE jdatna.product_media ADD COLUMN IF NOT EXISTS size integer CHECK(size>0);
CREATE INDEX IF NOT EXISTS product_media_product_idx ON jdatna.product_media(product_id);
