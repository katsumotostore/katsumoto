BEGIN;
DO $$
DECLARE p public.products; c public.managed_categories; target_id uuid; n integer; uid uuid; before_stock numeric;
BEGIN
 SELECT * INTO p FROM products WHERE sku='ACEI-001' LIMIT 1;
 IF p.category_id IS NULL OR p.category<>'Lubricantes' THEN RAISE EXCEPTION 'El aceite no se vinculó a Lubricantes'; END IF;
 IF EXISTS(SELECT 1 FROM products WHERE category_id IS NULL) THEN RAISE EXCEPTION 'Quedaron productos locales sin vincular'; END IF;
 SELECT * INTO c FROM managed_categories WHERE id=p.category_id;
 SELECT sum(stock) INTO before_stock FROM branch_stock WHERE product_id=p.id;
 UPDATE managed_categories SET name='Lubricantes QA' WHERE id=c.id;
 IF (SELECT category FROM products WHERE id=p.id)<>'Lubricantes QA' THEN RAISE EXCEPTION 'El renombrado perdió el vínculo'; END IF;
 BEGIN
  INSERT INTO managed_categories(organization_id,group_id,name) VALUES(c.organization_id,c.group_id,'LUBRICANTES QA');
  RAISE EXCEPTION 'Aceptó duplicado normalizado' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 BEGIN
  UPDATE products SET category_id=gen_random_uuid() WHERE id=p.id;
  RAISE EXCEPTION 'Aceptó categoría inexistente' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 INSERT INTO managed_categories(organization_id,group_id,name) VALUES(c.organization_id,c.group_id,'Destino QA') RETURNING id INTO target_id;
 UPDATE managed_categories SET is_active=false WHERE id=target_id;
 BEGIN
  UPDATE products SET category_id=target_id WHERE id=p.id;
  RAISE EXCEPTION 'Aceptó destino archivado' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 UPDATE managed_categories SET is_active=true WHERE id=target_id;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM reassign_category(c.id,target_id);
  RAISE EXCEPTION 'Reasignó sin usuario autorizado' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 SELECT id INTO uid FROM profiles WHERE organization_id=p.organization_id AND is_active AND role IN ('owner','admin','inventory') LIMIT 1;
 IF uid IS NULL THEN RAISE EXCEPTION 'Falta usuario de prueba'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 n:=reassign_category(c.id,target_id);
 IF n<1 OR (SELECT category_id FROM products WHERE id=p.id)<>target_id OR (SELECT is_active FROM managed_categories WHERE id=c.id) THEN RAISE EXCEPTION 'La reasignación no fue atómica'; END IF;
 IF (SELECT sum(stock) FROM branch_stock WHERE product_id=p.id)<>before_stock THEN RAISE EXCEPTION 'Se alteró el stock'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_log WHERE entity_id=c.id AND action='reassign_category') THEN RAISE EXCEPTION 'Falta auditoría'; END IF;
 RAISE NOTICE 'PASS: vínculo, renombrado, duplicados, destino válido, permisos, reasignación, stock intacto y auditoría';
END $$;
ROLLBACK;
