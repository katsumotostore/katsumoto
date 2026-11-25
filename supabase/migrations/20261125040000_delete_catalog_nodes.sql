BEGIN;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.catalog_product_link()'::regprocedure);
 definition:=replace(definition,'BEGIN', 'BEGIN
 IF TG_OP=''UPDATE'' AND NEW.category_id IS NULL AND NEW.category_group='''' AND NEW.category='''' AND NEW.product_family IS NOT DISTINCT FROM OLD.product_family AND catalog_can_manage(NEW.organization_id) THEN RETURN NEW; END IF;');
 EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.delete_catalog_node(p_kind text,p_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; group_ids uuid[]; category_ids uuid[]; snapshot jsonb; affected integer;
BEGIN
 IF p_kind NOT IN ('family','group','category') OR p_kind IS NULL THEN RAISE EXCEPTION 'Tipo de clasificación inválido'; END IF;
 LOCK TABLE managed_category_families,managed_category_groups,managed_categories IN SHARE ROW EXCLUSIVE MODE;
 IF p_kind='family' THEN SELECT organization_id,to_jsonb(f) INTO org,snapshot FROM managed_category_families f WHERE id=p_id;
 ELSIF p_kind='group' THEN SELECT organization_id,to_jsonb(g) INTO org,snapshot FROM managed_category_groups g WHERE id=p_id;
 ELSE SELECT organization_id,to_jsonb(c) INTO org,snapshot FROM managed_categories c WHERE id=p_id; END IF;
 IF org IS NULL OR NOT catalog_can_manage(org) THEN RAISE EXCEPTION 'No tienes permiso para eliminar esta clasificación'; END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO group_ids FROM managed_category_groups WHERE organization_id=org AND ((p_kind='family' AND family_id=p_id) OR (p_kind='group' AND id=p_id));
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO category_ids FROM managed_categories WHERE organization_id=org AND (group_id=ANY(group_ids) OR (p_kind='category' AND id=p_id));
 snapshot:=jsonb_build_object('node',snapshot,'groups',(SELECT jsonb_agg(g) FROM managed_category_groups g WHERE id=ANY(group_ids)),'categories',(SELECT jsonb_agg(c) FROM managed_categories c WHERE id=ANY(category_ids)));
 UPDATE products SET category_id=NULL,category_group='',category='',updated_at=clock_timestamp() WHERE organization_id=org AND category_id=ANY(category_ids);
 GET DIAGNOSTICS affected=ROW_COUNT;
 DELETE FROM managed_categories WHERE organization_id=org AND id=ANY(category_ids);
 DELETE FROM managed_category_groups WHERE organization_id=org AND id=ANY(group_ids);
 IF p_kind='family' THEN DELETE FROM managed_category_families WHERE organization_id=org AND id=p_id; END IF;
 INSERT INTO audit_log(organization_id,user_id,action,entity,entity_id,old_value,new_value) VALUES(org,auth.uid(),'catalog_delete',p_kind,p_id,snapshot,jsonb_build_object('unlinked_products',affected));
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.delete_catalog_node(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_catalog_node(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
