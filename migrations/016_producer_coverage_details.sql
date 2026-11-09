-- Producer-entered service areas are separate from the curated geography tree.
-- Existing canonical coverage and legacy delivery areas are unchanged.
CREATE TABLE jdatna.producer_coverage_details (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
 city_node_id text NOT NULL REFERENCES jdatna.coverage_nodes(id),
 center text CHECK(center IS NULL OR (center=btrim(center) AND length(center) BETWEEN 1 AND 120)),
 neighborhood text CHECK(neighborhood IS NULL OR (neighborhood=btrim(neighborhood) AND length(neighborhood) BETWEEN 1 AND 120)),
 fee numeric(10,2) CHECK(fee BETWEEN 0 AND 99999999.99),
 CHECK(center IS NOT NULL OR neighborhood IS NOT NULL)
);
CREATE UNIQUE INDEX producer_coverage_details_identity ON jdatna.producer_coverage_details
 (producer_id,city_node_id,lower(coalesce(center,'')),lower(coalesce(neighborhood,'')));
CREATE FUNCTION jdatna.check_coverage_detail_city() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM jdatna.coverage_nodes WHERE id=NEW.city_node_id AND kind='city') THEN
  RAISE EXCEPTION 'Coverage detail requires a city' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coverage_detail_city BEFORE INSERT OR UPDATE ON jdatna.producer_coverage_details
 FOR EACH ROW EXECUTE FUNCTION jdatna.check_coverage_detail_city();
