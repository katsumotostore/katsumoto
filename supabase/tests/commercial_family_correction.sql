BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM managed_category_families WHERE is_active AND catalog_name(label) IN ('producto','productos','servicio','servicios')) THEN RAISE EXCEPTION 'Quedaron tipos como familias'; END IF;
 IF NOT EXISTS(SELECT 1 FROM managed_category_families f JOIN managed_category_groups g ON g.family_id=f.id JOIN managed_categories c ON c.group_id=g.id WHERE f.label='Carburador' AND g.label='Original' AND c.name='STIHL' AND f.is_active AND g.is_active AND c.is_active) THEN RAISE EXCEPTION 'Falta rama Original'; END IF;
 IF NOT EXISTS(SELECT 1 FROM managed_category_families f JOIN managed_category_groups g ON g.family_id=f.id JOIN managed_categories c ON c.group_id=g.id WHERE f.label='Carburador' AND g.label='Alternativo' AND c.name='STIHL2' AND f.is_active AND g.is_active AND c.is_active) THEN RAISE EXCEPTION 'Falta rama Alternativo'; END IF;
 IF EXISTS(SELECT 1 FROM products WHERE category_id IS NULL) THEN RAISE EXCEPTION 'Se perdieron vínculos'; END IF;
 RAISE NOTICE 'PASS: familias comerciales, ramas solicitadas y vínculos conservados';
END $$;
ROLLBACK;
