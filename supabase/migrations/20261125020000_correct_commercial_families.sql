BEGIN;
DO $$
 #variable_conflict use_variable
DECLARE old record; family_id uuid; group_id uuid; category_id uuid; org uuid; label text; branch_label text;
BEGIN
 FOR old IN SELECT c.id,c.organization_id,c.name,c.image_url FROM managed_categories c JOIN managed_category_groups g ON g.id=c.group_id JOIN managed_category_families f ON f.id=g.family_id WHERE f.key IN ('productos','servicios') AND f.is_active LOOP
  label:=CASE WHEN catalog_name(old.name)='servicio' THEN 'Mantenimiento' ELSE old.name END;
  SELECT id INTO family_id FROM managed_category_families WHERE organization_id=old.organization_id AND catalog_name(managed_category_families.label)=catalog_name(label) AND key NOT IN ('productos','servicios') LIMIT 1;
  IF family_id IS NULL THEN
   INSERT INTO managed_category_families(organization_id,key,label,icon) VALUES(old.organization_id,'f_'||replace(gen_random_uuid()::text,'-',''),label,'Package') RETURNING id INTO family_id;
  END IF;
  SELECT g.id INTO group_id FROM managed_category_groups g WHERE g.family_id=family_id AND g.label='Por clasificar' LIMIT 1;
  IF group_id IS NULL THEN
  INSERT INTO managed_category_groups(organization_id,family_id,key,label,icon) VALUES(old.organization_id,family_id,'g_'||replace(gen_random_uuid()::text,'-',''),'Por clasificar','Folder') RETURNING id INTO group_id;
  END IF;
  SELECT c.id INTO category_id FROM managed_categories c WHERE c.group_id=group_id AND c.name='Por clasificar' LIMIT 1;
  IF category_id IS NULL THEN
  INSERT INTO managed_categories(organization_id,group_id,name,image_url) VALUES(old.organization_id,group_id,'Por clasificar',old.image_url) RETURNING id INTO category_id;
  END IF;
  UPDATE products p SET category_id=category_id,category_group=(SELECT key FROM managed_category_groups WHERE id=group_id),category='Por clasificar' WHERE p.category_id=old.id;
  UPDATE managed_categories SET is_active=false WHERE id=old.id;
 END LOOP;
 UPDATE managed_category_families SET is_active=false WHERE key IN ('productos','servicios');
 FOR org IN SELECT DISTINCT organization_id FROM managed_category_families LOOP
  SELECT id INTO family_id FROM managed_category_families WHERE organization_id=org AND catalog_name(managed_category_families.label)='carburador' AND is_active LIMIT 1;
  IF family_id IS NULL THEN
   INSERT INTO managed_category_families(organization_id,key,label,icon) VALUES(org,'f_'||replace(gen_random_uuid()::text,'-',''),'Carburador','Package') RETURNING id INTO family_id;
  END IF;
  FOREACH branch_label IN ARRAY ARRAY['Original','Alternativo'] LOOP
   INSERT INTO managed_category_groups(organization_id,family_id,key,label,icon) VALUES(org,family_id,'g_'||replace(gen_random_uuid()::text,'-',''),branch_label,'Folder') RETURNING id INTO group_id;
   INSERT INTO managed_categories(organization_id,group_id,name) VALUES(org,group_id,CASE WHEN branch_label='Original' THEN 'STIHL' ELSE 'STIHL2' END);
  END LOOP;
 END LOOP;
END $$;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.catalog_guard()'::regprocedure);
 definition:=replace(definition,'NEW.label:=btrim(NEW.label);', 'NEW.label:=btrim(NEW.label); IF TG_TABLE_NAME=''managed_category_families'' AND NEW.is_active AND catalog_name(NEW.label) IN (''producto'',''productos'',''servicio'',''servicios'') THEN RAISE EXCEPTION ''Producto y Servicio son tipos, no familias. Usa una familia como Carburador''; END IF;');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
