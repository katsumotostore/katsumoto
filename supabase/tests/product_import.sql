BEGIN;
CREATE FUNCTION public.test_import_reject_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products WHERE id=NEW.product_id AND sku='TEST-IMPORT-ROLLBACK') THEN
    RAISE EXCEPTION 'Simulated stock failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_import_reject_stock BEFORE INSERT ON public.branch_stock FOR EACH ROW EXECUTE FUNCTION public.test_import_reject_stock();
DO $$
DECLARE
  org uuid; actor uuid; branch uuid; batch uuid:=gen_random_uuid(); test_product_id uuid;
  body jsonb; preview jsonb; actual jsonb; retry jsonb; patched jsonb; bad jsonb; error_seen boolean;
BEGIN
  SELECT organization_id,id INTO org,actor FROM public.profiles WHERE role='owner' AND is_active LIMIT 1;
  SELECT id INTO branch FROM public.branches WHERE organization_id=org AND is_active AND type='warehouse' AND stock_source_branch_id IS NULL LIMIT 1;
  IF actor IS NULL OR branch IS NULL THEN RAISE EXCEPTION 'Test requires local owner and physical warehouse'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  body:=jsonb_build_array(jsonb_build_object('row',2,'sku','TEST-IMPORT-'||batch,'stock',17,'fields',jsonb_build_object(
    'name','Producto de prueba','product_family','productos','category_group','repuestos','category','Filtro de Aire',
    'unit','Unidad','price_cents',2500,'cost_cents',1500,'tax_affectation','gravado','description','Conservar'),
    'tiers',jsonb_build_array(jsonb_build_object('label','Mayorista','min_quantity',3,'price_cents',2300))));
  preview:=public.import_products(org,branch,batch,body);
  IF preview->0->>'status'<>'created' THEN RAISE EXCEPTION 'Preview failed: %',preview; END IF;
  IF EXISTS(SELECT 1 FROM public.products WHERE sku=body->0->>'sku') THEN RAISE EXCEPTION 'Preview wrote data'; END IF;
  body:=jsonb_set(body,'{0,expected}',preview->0->'expected');
  actual:=public.import_products(org,branch,batch,body,'create',false,true);
  IF actual->0->>'status'<>'created' THEN RAISE EXCEPTION 'Create failed: %',actual; END IF;
  test_product_id:=(actual->0->>'product_id')::uuid;
  IF (SELECT stock FROM public.branch_stock WHERE product_id=test_product_id AND branch_id=branch)<>17 THEN RAISE EXCEPTION 'Wrong initial stock'; END IF;
  IF (SELECT count(*) FROM public.price_tiers WHERE product_id=test_product_id)<>1 THEN RAISE EXCEPTION 'Missing tiers'; END IF;
  retry:=public.import_products(org,branch,batch,body,'create',false,true);
  IF retry<>actual OR (SELECT count(*) FROM public.stock_movements WHERE product_id=test_product_id)<>1 THEN RAISE EXCEPTION 'Retry duplicated movement'; END IF;
  bad:=public.import_products(org,branch,batch,jsonb_set(body,'{0,stock}','18'),'create',false,true);
  IF bad->0->>'status'<>'error' THEN RAISE EXCEPTION 'Changed retry accepted'; END IF;
  patched:=jsonb_build_array(jsonb_build_object('row',2,'sku',body->0->>'sku','stock',0,'fields',jsonb_build_object('name','Actualizado'),'tiers','[]'::jsonb));
  preview:=public.import_products(org,branch,gen_random_uuid(),patched,'update');
  IF preview->0->>'status'<>'updated' THEN RAISE EXCEPTION 'Update preview failed: %',preview; END IF;
  patched:=jsonb_set(patched,'{0,expected}',preview->0->'expected');
  actual:=public.import_products(org,branch,gen_random_uuid(),patched,'update',false,true);
  IF actual->0->>'status'<>'updated' OR (SELECT description FROM public.products WHERE products.id=test_product_id)<>'Conservar' OR (SELECT count(*) FROM public.price_tiers WHERE product_id=test_product_id)<>1 THEN RAISE EXCEPTION 'Update did not preserve fields: %',actual; END IF;
  bad:=public.import_products(org,branch,gen_random_uuid(),patched,'update',false,true);
  IF bad->0->>'status'<>'error' THEN RAISE EXCEPTION 'Stale update accepted'; END IF;
  bad:=public.import_products(org,branch,gen_random_uuid(),jsonb_set(patched,'{0,stock}','1'),'update');
  IF bad->0->>'status'<>'error' THEN RAISE EXCEPTION 'Update stock accepted'; END IF;
  bad:=public.import_products(org,branch,gen_random_uuid(),jsonb_set(body,'{0,sku}','"TEST-IMPORT-INVALID"') || jsonb_build_array(jsonb_set(jsonb_set(body->0,'{row}','3'),'{sku}','"TEST-IMPORT-INVALID"')));
  IF bad->0->>'status'<>'error' OR bad->1->>'status'<>'error' THEN RAISE EXCEPTION 'Duplicate SKUs accepted'; END IF;
  bad:=public.import_products(org,branch,gen_random_uuid(),jsonb_set(jsonb_set(body,'{0,sku}','"TEST-IMPORT-BAD-TIER"'),'{0,tiers,0,price_cents}','3000'),'create',false,true);
  IF bad->0->>'status'<>'error' OR EXISTS(SELECT 1 FROM public.products WHERE sku='TEST-IMPORT-BAD-TIER') THEN RAISE EXCEPTION 'Invalid row was committed'; END IF;
  bad:=public.import_products(org,branch,gen_random_uuid(),jsonb_set(body,'{0,sku}','"TEST-IMPORT-ROLLBACK"'),'create',false,true);
  IF bad->0->>'status'<>'error' OR bad->0->>'message'<>'Simulated stock failure' OR EXISTS(SELECT 1 FROM public.products WHERE sku='TEST-IMPORT-ROLLBACK') THEN RAISE EXCEPTION 'Stock failure did not roll back product: %',bad; END IF;
  error_seen:=false;
  BEGIN PERFORM public.import_products(org,gen_random_uuid(),batch,body); EXCEPTION WHEN OTHERS THEN error_seen:=true; END;
  IF NOT error_seen THEN RAISE EXCEPTION 'Invalid branch accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',(SELECT profiles.id::text FROM public.profiles WHERE role='vendedor' LIMIT 1),true);
  error_seen:=false;
  BEGIN PERFORM public.import_products(org,branch,batch,body); EXCEPTION WHEN OTHERS THEN error_seen:=true; END;
  IF NOT error_seen THEN RAISE EXCEPTION 'Unauthorized role accepted'; END IF;
  RAISE NOTICE 'PASS: preview, create, tiers, stock, retry, payload integrity, update, blanks, stale token, duplicates, invalid branch, role';
END;
$$;
ROLLBACK;
