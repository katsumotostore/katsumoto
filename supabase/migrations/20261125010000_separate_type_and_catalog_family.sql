BEGIN;
CREATE OR REPLACE FUNCTION public.catalog_product_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target record; matches integer;
BEGIN
 IF NEW.product_family NOT IN ('productos','servicios') THEN RAISE EXCEPTION 'Selecciona Producto o Servicio'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.product_family IS DISTINCT FROM NEW.product_family AND EXISTS(SELECT 1 FROM branch_stock WHERE product_id=OLD.id AND stock<>0) THEN RAISE EXCEPTION 'No se puede cambiar el tipo de un artículo con existencias'; END IF;
  IF NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND NEW.category_group IS NOT DISTINCT FROM OLD.category_group AND NEW.category IS NOT DISTINCT FROM OLD.category THEN RETURN NEW; END IF;
 END IF;
 IF NEW.category_id IS NULL OR (TG_OP='UPDATE' AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND (NEW.category_group IS DISTINCT FROM OLD.category_group OR NEW.category IS DISTINCT FROM OLD.category)) THEN
  SELECT count(*),(array_agg(c.id))[1] INTO matches,NEW.category_id FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id
  WHERE c.organization_id=NEW.organization_id AND g.organization_id=NEW.organization_id AND f.organization_id=NEW.organization_id AND g.key=NEW.category_group AND catalog_name(c.name)=catalog_name(NEW.category) AND c.is_active AND g.is_active AND f.is_active;
  IF matches<>1 THEN RAISE EXCEPTION 'Selecciona una categoría activa y no ambigua del administrador'; END IF;
 END IF;
 SELECT c.name,c.is_active ca,g.key group_key,g.is_active ga,f.is_active fa INTO target FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id
 WHERE c.id=NEW.category_id AND c.organization_id=NEW.organization_id AND g.organization_id=NEW.organization_id AND f.organization_id=NEW.organization_id FOR SHARE OF c,g,f;
 IF NOT FOUND OR NOT target.ca OR NOT target.ga OR NOT target.fa THEN RAISE EXCEPTION 'Categoría no disponible para esta organización'; END IF;
 NEW.category:=target.name; NEW.category_group:=target.group_key;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.catalog_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent_org uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'No se puede cambiar la organización'; END IF;
 IF TG_TABLE_NAME='managed_category_families' THEN
  IF TG_OP='UPDATE' AND NEW.key<>OLD.key THEN RAISE EXCEPTION 'La clave de familia es permanente'; END IF;
  NEW.label:=btrim(NEW.label);
  IF NEW.label='' THEN RAISE EXCEPTION 'Nombre de familia requerido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text||catalog_name(NEW.label),0));
  IF (TG_OP='INSERT' OR NEW.label IS DISTINCT FROM OLD.label) AND EXISTS(SELECT 1 FROM managed_category_families f WHERE f.organization_id=NEW.organization_id AND f.id<>NEW.id AND catalog_name(f.label)=catalog_name(NEW.label)) THEN RAISE EXCEPTION 'Ya existe una familia con ese nombre'; END IF;
 ELSIF TG_TABLE_NAME='managed_category_groups' THEN
  SELECT organization_id INTO parent_org FROM managed_category_families WHERE id=NEW.family_id;
  IF parent_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Familia de otra organización'; END IF;
  IF TG_OP='UPDATE' AND (NEW.key<>OLD.key OR NEW.family_id<>OLD.family_id) THEN RAISE EXCEPTION 'La clave y familia del grupo son permanentes; usa reasignación'; END IF;
  NEW.label:=btrim(NEW.label);
  IF NEW.label='' THEN RAISE EXCEPTION 'Nombre de grupo requerido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.family_id::text||catalog_name(NEW.label),0));
  IF (TG_OP='INSERT' OR NEW.label IS DISTINCT FROM OLD.label) AND EXISTS(SELECT 1 FROM managed_category_groups g WHERE g.family_id=NEW.family_id AND g.id<>NEW.id AND catalog_name(g.label)=catalog_name(NEW.label)) THEN RAISE EXCEPTION 'Ya existe un grupo con ese nombre'; END IF;
 ELSE
  SELECT organization_id INTO parent_org FROM managed_category_groups WHERE id=NEW.group_id;
  IF parent_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Grupo de otra organización'; END IF;
  IF TG_OP='UPDATE' AND NEW.group_id<>OLD.group_id THEN RAISE EXCEPTION 'Usa reasignación para trasladar artículos'; END IF;
  NEW.name:=btrim(NEW.name);
  IF NEW.name='' THEN RAISE EXCEPTION 'Nombre de categoría requerido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.group_id::text||catalog_name(NEW.name),0));
  IF (TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name) AND EXISTS(SELECT 1 FROM managed_categories c WHERE c.group_id=NEW.group_id AND c.id<>NEW.id AND catalog_name(c.name)=catalog_name(NEW.name)) THEN RAISE EXCEPTION 'Ya existe una categoría con ese nombre'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_audit AFTER INSERT OR UPDATE ON public.managed_category_families FOR EACH ROW EXECUTE FUNCTION public.catalog_audit();
DO $$ DECLARE definition text; fn regprocedure; BEGIN
 definition:=pg_get_functiondef('public.reassign_category(uuid,uuid)'::regprocedure);
 definition:=replace(definition,' OR s.family<>t.family','');
 definition:=replace(definition,'del mismo tipo y organización','de la misma organización');
 EXECUTE definition;
 SELECT oid::regprocedure INTO fn FROM pg_proc WHERE proname='import_products' AND pronamespace='public'::regnamespace;
 IF fn IS NOT NULL THEN
  definition:=pg_get_functiondef(fn);
  definition:=replace(definition,' AND fam.key=v.product_family','');
  EXECUTE definition;
 END IF;
END $$;
COMMENT ON COLUMN public.products.product_family IS 'Tipo operativo legado: productos o servicios. La familia comercial se obtiene por category_id -> grupo -> familia.';
NOTIFY pgrst,'reload schema';
COMMIT;
