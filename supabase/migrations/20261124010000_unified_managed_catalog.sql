BEGIN;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.managed_categories(id) ON DELETE RESTRICT;
ALTER TABLE public.managed_categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.managed_category_groups ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.managed_category_families ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products(category_id);
CREATE OR REPLACE FUNCTION public.catalog_name(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$ SELECT lower(translate(btrim($1),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) $$;

INSERT INTO public.audit_log(organization_id,action,entity,entity_id,old_value)
SELECT organization_id,'catalog_migration_snapshot','products',id,to_jsonb(p) FROM public.products p;
UPDATE public.managed_category_families SET is_active=false WHERE key NOT IN ('productos','servicios');
INSERT INTO public.managed_category_families(organization_id,key,label,icon,color,active_color,sort_order)
SELECT DISTINCT p.organization_id,p.product_family,CASE WHEN p.product_family='productos' THEN 'Productos' ELSE 'Servicios' END,'Package','','',0
FROM public.products p WHERE p.product_family IN ('productos','servicios') ON CONFLICT(organization_id,key) DO NOTHING;
INSERT INTO public.managed_category_groups(organization_id,family_id,key,label,icon,color,sort_order)
SELECT DISTINCT p.organization_id,f.id,p.category_group,p.category_group,'Folder','',0 FROM public.products p
JOIN public.managed_category_families f ON f.organization_id=p.organization_id AND f.key=p.product_family
WHERE btrim(coalesce(p.category_group,''))<>'' AND f.is_active ON CONFLICT(organization_id,key) DO NOTHING;
INSERT INTO public.managed_categories(organization_id,group_id,name,sort_order)
SELECT DISTINCT p.organization_id,g.id,btrim(p.category),0 FROM public.products p
JOIN public.managed_category_families f ON f.organization_id=p.organization_id AND f.key=p.product_family AND f.is_active
JOIN public.managed_category_groups g ON g.organization_id=p.organization_id AND g.family_id=f.id AND g.key=p.category_group
WHERE btrim(coalesce(p.category,''))<>'' AND NOT EXISTS (SELECT 1 FROM public.managed_categories c WHERE c.group_id=g.id AND public.catalog_name(c.name)=public.catalog_name(p.category));
UPDATE public.products p SET category_id=m.id FROM (
 SELECT p2.id product_id,(array_agg(c.id))[1] id FROM public.products p2
 JOIN public.managed_category_families f ON f.organization_id=p2.organization_id AND f.key=p2.product_family AND f.is_active
 JOIN public.managed_category_groups g ON g.family_id=f.id AND g.organization_id=p2.organization_id AND g.key=p2.category_group
 JOIN public.managed_categories c ON c.group_id=g.id AND c.organization_id=p2.organization_id AND public.catalog_name(c.name)=public.catalog_name(p2.category)
 GROUP BY p2.id HAVING count(*)=1
) m WHERE p.id=m.product_id;

INSERT INTO public.managed_categories(organization_id,group_id,name,sort_order)
SELECT DISTINCT p.organization_id,g.id,'Lubricantes',0 FROM public.products p
JOIN public.managed_category_families f ON f.organization_id=p.organization_id AND f.key='productos'
JOIN public.managed_category_groups g ON g.organization_id=p.organization_id AND g.family_id=f.id AND g.key='repuestos'
WHERE p.sku='ACEI-001' AND p.name ILIKE 'Aceite 2T Castrol 500ml%' AND NOT EXISTS(SELECT 1 FROM public.managed_categories c WHERE c.group_id=g.id AND public.catalog_name(c.name)='lubricantes');
UPDATE public.products p SET category_id=c.id FROM public.managed_categories c JOIN public.managed_category_groups g ON g.id=c.group_id
JOIN public.managed_category_families f ON f.id=g.family_id
WHERE p.organization_id=c.organization_id AND p.sku='ACEI-001' AND p.name ILIKE 'Aceite 2T Castrol 500ml%' AND f.key='productos' AND g.key='repuestos' AND public.catalog_name(c.name)='lubricantes'
AND (SELECT count(*) FROM public.managed_categories x WHERE x.group_id=g.id AND public.catalog_name(x.name)='lubricantes')=1;
UPDATE public.products p SET product_family=f.key,category_group=g.key,category=c.name FROM public.managed_categories c JOIN public.managed_category_groups g ON g.id=c.group_id JOIN public.managed_category_families f ON f.id=g.family_id WHERE p.category_id=c.id;

CREATE OR REPLACE FUNCTION public.catalog_product_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target record; matches integer; changed boolean;
BEGIN
 changed := TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN changed := NEW.category_id IS DISTINCT FROM OLD.category_id OR NEW.product_family IS DISTINCT FROM OLD.product_family OR NEW.category_group IS DISTINCT FROM OLD.category_group OR NEW.category IS DISTINCT FROM OLD.category; END IF;
 IF NOT changed THEN RETURN NEW; END IF;
 IF NEW.category_id IS NULL OR (TG_OP='UPDATE' AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND (NEW.product_family IS DISTINCT FROM OLD.product_family OR NEW.category_group IS DISTINCT FROM OLD.category_group OR NEW.category IS DISTINCT FROM OLD.category)) THEN
  SELECT count(*),(array_agg(c.id))[1] INTO matches,NEW.category_id FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id
  WHERE c.organization_id=NEW.organization_id AND g.organization_id=NEW.organization_id AND f.organization_id=NEW.organization_id AND f.key=NEW.product_family AND g.key=NEW.category_group AND catalog_name(c.name)=catalog_name(NEW.category) AND c.is_active AND g.is_active AND f.is_active;
  IF matches<>1 THEN RAISE EXCEPTION 'Selecciona una categoría activa del administrador; la clasificación es inexistente o ambigua'; END IF;
 END IF;
 SELECT c.name,c.is_active ca,g.key group_key,g.is_active ga,f.key family_key,f.is_active fa INTO target FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id
 WHERE c.id=NEW.category_id AND c.organization_id=NEW.organization_id AND g.organization_id=NEW.organization_id AND f.organization_id=NEW.organization_id FOR SHARE OF c,g,f;
 IF NOT FOUND OR NOT target.ca OR NOT target.ga OR NOT target.fa OR target.family_key NOT IN ('productos','servicios') THEN RAISE EXCEPTION 'Categoría no disponible para esta organización'; END IF;
 IF TG_OP='UPDATE' AND OLD.product_family IS DISTINCT FROM target.family_key AND EXISTS(SELECT 1 FROM branch_stock WHERE product_id=OLD.id AND stock<>0) THEN RAISE EXCEPTION 'No se puede cambiar el tipo de un artículo con existencias. Concilia su stock primero'; END IF;
 NEW.category:=target.name; NEW.category_group:=target.group_key; NEW.product_family:=target.family_key;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_product_link BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.catalog_product_link();

CREATE OR REPLACE FUNCTION public.catalog_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent_org uuid; parent_key text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'No se puede cambiar la organización'; END IF;
 IF TG_TABLE_NAME='managed_category_families' THEN
  IF TG_OP='INSERT' AND NEW.key NOT IN ('productos','servicios') THEN RAISE EXCEPTION 'Solo existen los tipos Productos y Servicios'; END IF;
  IF TG_OP='UPDATE' AND NEW.key<>OLD.key THEN RAISE EXCEPTION 'La clave del tipo es permanente'; END IF;
  IF NEW.key NOT IN ('productos','servicios') AND NEW.is_active THEN RAISE EXCEPTION 'Tipo heredado no compatible; conserva archivado'; END IF;
 ELSIF TG_TABLE_NAME='managed_category_groups' THEN
  SELECT organization_id,key INTO parent_org,parent_key FROM managed_category_families WHERE id=NEW.family_id;
  IF parent_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'El grupo debe pertenecer a la misma organización'; END IF;
  IF TG_OP='UPDATE' AND (NEW.key<>OLD.key OR NEW.family_id<>OLD.family_id) THEN RAISE EXCEPTION 'La clave y el tipo del grupo son permanentes'; END IF;
  IF NEW.is_active AND parent_key NOT IN ('productos','servicios') THEN RAISE EXCEPTION 'Selecciona Productos o Servicios'; END IF;
  IF EXISTS(SELECT 1 FROM managed_category_groups g WHERE g.organization_id=NEW.organization_id AND g.family_id=NEW.family_id AND g.id<>NEW.id AND catalog_name(g.label)=catalog_name(NEW.label)) THEN RAISE EXCEPTION 'Ya existe un grupo con ese nombre'; END IF;
 ELSE
  SELECT organization_id INTO parent_org FROM managed_category_groups WHERE id=NEW.group_id;
  IF parent_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'La categoría debe pertenecer a la misma organización'; END IF;
  IF btrim(NEW.name)='' THEN RAISE EXCEPTION 'Nombre de categoría requerido'; END IF;
  NEW.name:=btrim(NEW.name);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.group_id::text||catalog_name(NEW.name),0));
  IF EXISTS(SELECT 1 FROM managed_categories c WHERE c.group_id=NEW.group_id AND c.id<>NEW.id AND catalog_name(c.name)=catalog_name(NEW.name)) THEN RAISE EXCEPTION 'Ya existe una categoría con ese nombre (incluye variantes de tildes y mayúsculas)'; END IF;
  IF TG_OP='UPDATE' AND NEW.group_id<>OLD.group_id THEN RAISE EXCEPTION 'Usa reasignación para mover los productos a otro grupo'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_guard BEFORE INSERT OR UPDATE ON public.managed_category_families FOR EACH ROW EXECUTE FUNCTION public.catalog_guard();
CREATE TRIGGER catalog_guard BEFORE INSERT OR UPDATE ON public.managed_category_groups FOR EACH ROW EXECUTE FUNCTION public.catalog_guard();
CREATE TRIGGER catalog_guard BEFORE INSERT OR UPDATE ON public.managed_categories FOR EACH ROW EXECUTE FUNCTION public.catalog_guard();

CREATE OR REPLACE FUNCTION public.catalog_rename_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.name IS DISTINCT FROM OLD.name THEN
  UPDATE products SET category=NEW.name,updated_at=clock_timestamp() WHERE category_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_rename_sync AFTER UPDATE OF name ON public.managed_categories FOR EACH ROW EXECUTE FUNCTION public.catalog_rename_sync();

CREATE OR REPLACE FUNCTION public.catalog_can_manage(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=(select auth.uid()) AND organization_id=org AND is_active AND role IN ('owner','admin','inventory'))
$$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['managed_category_families','managed_category_groups','managed_categories'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY catalog_read ON public.%I FOR SELECT TO anon,authenticated USING (is_active OR catalog_can_manage(organization_id))',t);
 EXECUTE format('CREATE POLICY catalog_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (catalog_can_manage(organization_id))',t);
 EXECUTE format('CREATE POLICY catalog_update ON public.%I FOR UPDATE TO authenticated USING (catalog_can_manage(organization_id)) WITH CHECK (catalog_can_manage(organization_id))',t);
 EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',t);
 EXECUTE format('GRANT INSERT,UPDATE ON public.%I TO authenticated',t);
 EXECUTE format('REVOKE DELETE ON public.%I FROM anon,authenticated',t);
 END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.reassign_category(p_source uuid,p_target uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; t record; n integer;
BEGIN
 PERFORM id FROM managed_categories WHERE id IN (p_source,p_target) ORDER BY id FOR UPDATE;
 SELECT c.*,f.key family INTO s FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id WHERE c.id=p_source;
 SELECT c.*,f.key family,g.is_active ga,f.is_active fa INTO t FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id WHERE c.id=p_target;
 IF s.id IS NULL OR t.id IS NULL OR NOT catalog_can_manage(s.organization_id) OR s.organization_id<>t.organization_id OR p_source=p_target OR s.family<>t.family OR NOT t.is_active OR NOT t.ga OR NOT t.fa THEN RAISE EXCEPTION 'Selecciona una categoría destino activa del mismo tipo y organización'; END IF;
 UPDATE products SET category_id=p_target,updated_at=clock_timestamp() WHERE category_id=p_source AND organization_id=s.organization_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE managed_categories SET is_active=false WHERE id=p_source;
 INSERT INTO audit_log(organization_id,user_id,action,entity,entity_id,old_value,new_value) VALUES(s.organization_id,auth.uid(),'reassign_category','managed_categories',p_source,to_jsonb(s),jsonb_build_object('target',p_target,'products',n));
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reassign_category(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reassign_category(uuid,uuid) TO authenticated;

DO $$ DECLARE fn regprocedure; definition text; BEGIN
 SELECT oid::regprocedure INTO fn FROM pg_proc WHERE proname='import_products' AND pronamespace='public'::regnamespace;
 IF fn IS NOT NULL THEN
  definition:=pg_get_functiondef(fn);
  definition:=replace(definition, 'v.category_group NOT IN (''herramientas'',''repuestos'',''maquinas'',''transporte'',''maintenance'')', 'btrim(v.category_group)=''''');
  definition:=replace(definition, 'AND c.name=v.category AND g.key=v.category_group AND fam.key=v.product_family', 'AND c.name=v.category AND g.key=v.category_group AND fam.key=v.product_family AND c.is_active AND g.is_active AND fam.is_active');
  EXECUTE definition;
 END IF;
END $$;
INSERT INTO public.audit_log(organization_id,action,entity,entity_id,new_value)
SELECT organization_id,'catalog_migration_linked','products',id,jsonb_build_object('category_id',category_id,'family',product_family,'group',category_group,'category',category) FROM public.products;
NOTIFY pgrst,'reload schema';
COMMIT;
