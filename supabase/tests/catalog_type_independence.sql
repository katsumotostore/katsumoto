BEGIN;
DO $$
DECLARE p products; f uuid; g uuid; c uuid; before_stock numeric;
BEGIN
 SELECT * INTO p FROM products WHERE product_family='productos' AND category_id IS NOT NULL LIMIT 1;
 SELECT coalesce(sum(stock),0) INTO before_stock FROM branch_stock WHERE product_id=p.id;
 INSERT INTO managed_category_families(organization_id,key,label) VALUES(p.organization_id,'qa_independent','Familia QA independiente') RETURNING id INTO f;
 INSERT INTO managed_category_groups(organization_id,family_id,key,label) VALUES(p.organization_id,f,'qa_group','Grupo QA') RETURNING id INTO g;
 INSERT INTO managed_categories(organization_id,group_id,name) VALUES(p.organization_id,g,'Categoría QA') RETURNING id INTO c;
 UPDATE products SET category_id=c WHERE id=p.id;
 IF (SELECT product_family FROM products WHERE id=p.id)<>p.product_family THEN RAISE EXCEPTION 'La familia cambió el tipo'; END IF;
 IF (SELECT category_group FROM products WHERE id=p.id)<>'qa_group' THEN RAISE EXCEPTION 'El grupo no se sincronizó'; END IF;
 IF (SELECT coalesce(sum(stock),0) FROM branch_stock WHERE product_id=p.id)<>before_stock THEN RAISE EXCEPTION 'La clasificación alteró stock'; END IF;
 UPDATE managed_category_families SET label='Familia QA renombrada' WHERE id=f;
 IF (SELECT category_id FROM products WHERE id=p.id)<>c THEN RAISE EXCEPTION 'Renombrar perdió el vínculo'; END IF;
 RAISE NOTICE 'PASS: familia libre, categoría vinculada, tipo y stock independientes, renombrado seguro';
END $$;
ROLLBACK;
