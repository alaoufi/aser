-- Preserve category identities and custom names, slugs and hierarchy.
UPDATE jdatna.categories SET name='ألبان' WHERE id='dairy-laban' AND name='لبن' AND slug='dairy-laban';
CREATE FUNCTION jdatna.check_category_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ancestor_depth integer; subtree_height integer; cyclic boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('jdatna.category.ids'));
 -- Existing IDs in idempotent seed inserts are left for ON CONFLICT; their custom hierarchy stays intact.
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM jdatna.categories WHERE id=NEW.id) THEN RETURN NEW; END IF;
 IF NEW.parent_id=NEW.id THEN
  RAISE EXCEPTION 'Category cannot parent itself' USING ERRCODE='23514';
 END IF;
 WITH RECURSIVE ancestors AS (
  SELECT id,parent_id,1 AS depth,ARRAY[id] AS path FROM jdatna.categories WHERE id=NEW.parent_id
  UNION ALL
  SELECT c.id,c.parent_id,a.depth+1,a.path||c.id FROM jdatna.categories c JOIN ancestors a ON c.id=a.parent_id WHERE NOT c.id=ANY(a.path) AND a.depth<=8
 ) SELECT COALESCE(max(depth),0),COALESCE(bool_or(id=NEW.id OR parent_id=ANY(path)),false) INTO ancestor_depth,cyclic FROM ancestors;
 IF cyclic THEN RAISE EXCEPTION 'Category cycle is forbidden' USING ERRCODE='23514'; END IF;
 WITH RECURSIVE descendants AS (
  SELECT NEW.id AS id,1 AS height,ARRAY[NEW.id] AS path
  UNION ALL
  SELECT c.id,d.height+1,d.path||c.id FROM jdatna.categories c JOIN descendants d ON c.parent_id=d.id WHERE NOT c.id=ANY(d.path) AND d.height<=8
 ) SELECT max(height) INTO subtree_height FROM descendants;
 IF ancestor_depth+subtree_height>8 THEN
  RAISE EXCEPTION 'Category tree is limited to eight levels including moved descendants' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER category_tree_guard BEFORE INSERT OR UPDATE ON jdatna.categories FOR EACH ROW EXECUTE FUNCTION jdatna.check_category_tree();
