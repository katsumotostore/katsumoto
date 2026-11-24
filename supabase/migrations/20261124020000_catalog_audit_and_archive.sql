BEGIN;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.catalog_guard()'::regprocedure);
 definition:=replace(definition,'IF EXISTS(SELECT 1 FROM managed_categories c WHERE c.group_id=NEW.group_id', 'IF (TG_OP=''INSERT'' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.group_id IS DISTINCT FROM OLD.group_id) AND EXISTS(SELECT 1 FROM managed_categories c WHERE c.group_id=NEW.group_id');
 definition:=replace(definition,'IF EXISTS(SELECT 1 FROM managed_category_groups g WHERE g.organization_id=NEW.organization_id','IF (TG_OP=''INSERT'' OR NEW.label IS DISTINCT FROM OLD.label) AND EXISTS(SELECT 1 FROM managed_category_groups g WHERE g.organization_id=NEW.organization_id');
 EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.catalog_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
 INSERT INTO audit_log(organization_id,user_id,action,entity,entity_id,old_value,new_value)
 VALUES(NEW.organization_id,auth.uid(),'catalog_'||lower(TG_OP),TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_audit AFTER INSERT OR UPDATE ON public.managed_categories FOR EACH ROW EXECUTE FUNCTION public.catalog_audit();
CREATE TRIGGER catalog_audit AFTER INSERT OR UPDATE ON public.managed_category_groups FOR EACH ROW EXECUTE FUNCTION public.catalog_audit();
CREATE OR REPLACE FUNCTION public.catalog_product_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
 INSERT INTO audit_log(organization_id,user_id,action,entity,entity_id,old_value,new_value)
 VALUES(NEW.organization_id,auth.uid(),'product_category_changed','products',NEW.id,jsonb_build_object('category_id',OLD.category_id,'category',OLD.category),jsonb_build_object('category_id',NEW.category_id,'category',NEW.category));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_product_audit AFTER UPDATE OF category_id ON public.products FOR EACH ROW EXECUTE FUNCTION public.catalog_product_audit();
NOTIFY pgrst,'reload schema';
COMMIT;
