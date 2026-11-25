BEGIN;
DO $$
DECLARE p products; uid uuid; fid uuid; gid uuid; cid uuid; amount numeric; n integer;
BEGIN
 SELECT * INTO p FROM products WHERE category_id IS NOT NULL LIMIT 1;
 SELECT id INTO uid FROM profiles WHERE organization_id=p.organization_id AND is_active AND role IN ('owner','admin','inventory') LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 SELECT coalesce(sum(stock),0) INTO amount FROM branch_stock WHERE product_id=p.id;
 INSERT INTO managed_category_families(organization_id,key,label) VALUES(p.organization_id,'delete_qa','Familia eliminación QA') RETURNING id INTO fid;
 INSERT INTO managed_category_groups(organization_id,family_id,key,label) VALUES(p.organization_id,fid,'delete_qa_group','Grupo QA') RETURNING id INTO gid;
 INSERT INTO managed_categories(organization_id,group_id,name) VALUES(p.organization_id,gid,'Categoría QA') RETURNING id INTO cid;
 UPDATE products SET category_id=cid WHERE id=p.id;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM delete_catalog_node('family',fid);
  RAISE EXCEPTION 'Permitió eliminar sin autorización' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 n:=delete_catalog_node('category',cid);
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM products WHERE id=p.id AND category_id IS NULL AND category_group='' AND category='' AND product_family=p.product_family AND price_cents=p.price_cents) THEN RAISE EXCEPTION 'La desvinculación no preservó el producto'; END IF;
 IF (SELECT coalesce(sum(stock),0) FROM branch_stock WHERE product_id=p.id)<>amount THEN RAISE EXCEPTION 'Cambió el stock'; END IF;
 INSERT INTO managed_categories(organization_id,group_id,name) VALUES(p.organization_id,gid,'Categoría QA 2') RETURNING id INTO cid;
 UPDATE products SET category_id=cid WHERE id=p.id;
 n:=delete_catalog_node('family',fid);
 IF n<>1 OR EXISTS(SELECT 1 FROM managed_category_groups WHERE id=gid) OR EXISTS(SELECT 1 FROM managed_categories WHERE id=cid) OR EXISTS(SELECT 1 FROM managed_category_families WHERE id=fid) THEN RAISE EXCEPTION 'Falló eliminación jerárquica'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_log WHERE entity_id=fid AND action='catalog_delete') THEN RAISE EXCEPTION 'Falta auditoría'; END IF;
 RAISE NOTICE 'PASS: permisos, desvinculación, eliminación jerárquica, precios, stock y auditoría';
END $$;
ROLLBACK;
