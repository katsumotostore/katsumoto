begin;
do $$
declare
  actor public.profiles;
  target public.products;
  repaired public.products;
  invalid_id uuid := gen_random_uuid();
  archived_id uuid := gen_random_uuid();
  other_org uuid := gen_random_uuid();
  foreign_product_id uuid := gen_random_uuid();
  original text;
  manufacturer text := '980000000001';
  digit integer;
  failed boolean;
begin
  select * into strict actor from public.profiles where role = 'owner' and is_active limit 1;
  perform set_config('request.jwt.claim.sub', actor.id::text, true);
  insert into public.products(organization_id, name, sku)
    values(actor.organization_id, 'QA duplicate source', 'QA-' || gen_random_uuid()) returning * into target;
  original := target.barcode;
  alter table public.products disable trigger products_reserve_barcode;
  insert into public.products(id, organization_id, name, sku, barcode, is_active) values
    (invalid_id, actor.organization_id, 'QA invalid', 'QA-' || invalid_id, '123', true),
    (archived_id, actor.organization_id, 'QA archived duplicate', 'QA-' || archived_id, original, false);
  alter table public.products enable trigger products_reserve_barcode;
  if not exists (select 1 from public.product_barcode_conflicts() where product_id = target.id and other_id = archived_id and not other_active) then
    raise exception 'Archived duplicate missing';
  end if;
  select * into repaired from public.repair_product_barcode(target.id, original, null);
  if repaired.barcode = original or not public.product_ean13_valid(repaired.barcode) then raise exception 'Internal repair failed'; end if;
  if (select barcode from public.products where id = archived_id) <> original then raise exception 'Peer changed'; end if;
  if exists (select 1 from public.product_barcode_conflicts() where product_id = target.id) then raise exception 'Conflict not resolved'; end if;
  if not exists (select 1 from public.audit_log where entity_id = target.id and action = 'barcode_repaired'
    and old_value->>'barcode' = original and new_value->>'barcode' = repaired.barcode) then raise exception 'Audit missing'; end if;
  failed := false;
  begin perform public.repair_product_barcode(target.id, original, null);
  exception when sqlstate '40001' then failed := true; end;
  if not failed or (select barcode from public.products where id = target.id) <> repaired.barcode then raise exception 'Stale retry changed code'; end if;

  select (10 - sum(substr(manufacturer, i, 1)::integer * case when i % 2 = 0 then 3 else 1 end) % 10) % 10
    into digit from generate_series(1, 12) i;
  manufacturer := manufacturer || digit::text;
  perform public.repair_product_barcode(invalid_id, '123', manufacturer);
  if (select barcode from public.products where id = invalid_id) <> manufacturer then raise exception 'Manufacturer code not saved'; end if;
  failed := false;
  begin perform public.repair_product_barcode(target.id, repaired.barcode, manufacturer);
  exception when others then failed := true; end;
  if not failed then raise exception 'Duplicate manufacturer code accepted'; end if;
  failed := false;
  begin perform public.repair_product_barcode(target.id, repaired.barcode, '123');
  exception when others then failed := true; end;
  if not failed then raise exception 'Invalid manufacturer code accepted'; end if;

  update public.profiles set role = 'reader' where id = actor.id;
  failed := false;
  begin perform public.repair_product_barcode(target.id, repaired.barcode, null);
  exception when others then failed := true; end;
  if not failed then raise exception 'Reader repaired a code'; end if;
  update public.profiles set role = actor.role where id = actor.id;

  insert into public.organizations(id, name, slug, ruc) values(other_org, 'QA tenant', other_org::text, '20000000001');
  insert into public.products(id, organization_id, name, sku) values(foreign_product_id, other_org, 'QA foreign', 'QA-' || foreign_product_id);
  failed := false;
  begin perform public.repair_product_barcode(foreign_product_id, '', null);
  exception when others then failed := true; end;
  if not failed then raise exception 'Cross-tenant repair allowed'; end if;
  if has_function_privilege('anon', 'public.repair_product_barcode(uuid,text,text)', 'execute') then raise exception 'Anonymous execute granted'; end if;
  raise notice 'PASS: archived duplicates, internal repair, manufacturer code, audit, stale retry, duplicate rejection, invalid input, roles, tenant isolation';
end;
$$;
rollback;
