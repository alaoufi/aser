-- Existing city/region identities and legacy delivery_areas remain intact.
CREATE TABLE jdatna.coverage_nodes (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('region','governorate','city','center','neighborhood')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 parent_id text REFERENCES jdatna.coverage_nodes(id),
 region_id text NOT NULL REFERENCES jdatna.regions(id),
 city_id text UNIQUE REFERENCES jdatna.cities(id),
 CHECK((kind='city')=(city_id IS NOT NULL)),
 CHECK((kind='region')=(parent_id IS NULL))
);
CREATE UNIQUE INDEX coverage_sibling_name ON jdatna.coverage_nodes(parent_id,kind,name);
INSERT INTO jdatna.coverage_nodes(id,kind,name,region_id) SELECT 'region:'||id,'region',name,id FROM jdatna.regions;
-- Region-city relationship is existing data, never a guessed governorate.
INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id,city_id)
 SELECT 'city:'||id,'city',name,'region:'||region_id,region_id,id FROM jdatna.cities;
CREATE FUNCTION jdatna.check_coverage_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p jdatna.coverage_nodes;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.region_id IS DISTINCT FROM OLD.region_id OR NEW.city_id IS DISTINCT FROM OLD.city_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
  RAISE EXCEPTION 'Coverage identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='region' THEN RETURN NEW; END IF;
 SELECT * INTO p FROM jdatna.coverage_nodes WHERE id=NEW.parent_id;
 IF p.id IS NULL OR p.region_id<>NEW.region_id OR NOT (
  (NEW.kind='governorate' AND p.kind='region') OR
  (NEW.kind='city' AND (p.kind='governorate' OR (TG_OP='INSERT' AND p.kind='region'))) OR
  (NEW.kind='center' AND p.kind='city') OR
  (NEW.kind='neighborhood' AND p.kind IN ('city','center'))
 ) THEN RAISE EXCEPTION 'Invalid coverage parent' USING ERRCODE='23514'; END IF;
 IF NEW.kind='city' AND NOT EXISTS(SELECT 1 FROM jdatna.cities c WHERE c.id=NEW.city_id AND c.region_id=NEW.region_id) THEN
  RAISE EXCEPTION 'City region mismatch' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NOT (
  OLD.kind='city' AND OLD.parent_id='region:'||OLD.region_id AND p.kind='governorate'
 ) THEN RAISE EXCEPTION 'Coverage parent is immutable after curation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coverage_parent BEFORE INSERT OR UPDATE ON jdatna.coverage_nodes FOR EACH ROW EXECUTE FUNCTION jdatna.check_coverage_parent();
CREATE TABLE jdatna.producer_coverage (
 producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id),
 node_id text NOT NULL REFERENCES jdatna.coverage_nodes(id),
 fee numeric(10,2) CHECK(fee BETWEEN 0 AND 99999999.99),
 PRIMARY KEY(producer_id,node_id)
);
CREATE INDEX producer_coverage_node ON jdatna.producer_coverage(node_id);
