begin;
do $$
declare
  actor public.profiles;
  missing_id uuid := gen_random_uuid();
  invalid_id uuid := gen_random_uuid();
  first_code text;
  again text;
  generated text;
  failed boolean;
begin
  select * into strict actor from public.profiles where role = 'owner' and is_active limit 1;
  perform set_config('request.jwt.claim.sub', actor.id::text, true);
  alter table public.products disable trigger products_reserve_barcode;
  insert into public.products(id, organization_id, name, sku, barcode) values
    (missing_id, actor.organization_id, 'QA missing barcode', 'QA-' || missing_id, ''),
    (invalid_id, actor.organization_id, 'QA invalid barcode', 'QA-' || invalid_id, '123');
  alter table public.products enable trigger products_reserve_barcode;

  failed := false;
  begin
    perform public.prepare_product_labels(array[missing_id, invalid_id]);
  exception when others then failed := true; end;
  if not failed then raise exception 'Invalid code was accepted'; end if;
  if (select barcode from public.products where id = missing_id) <> '' then
    raise exception 'Failed batch was not atomic';
  end if;

  update public.profiles set role = 'reader' where id = actor.id;
  failed := false;
  begin perform public.prepare_product_labels(array[missing_id]);
  exception when others then failed := true; end;
  if not failed then raise exception 'Reader assigned a code'; end if;
  update public.profiles set role = actor.role where id = actor.id;

  select barcode into first_code from public.prepare_product_labels(array[missing_id]);
  if not public.product_ean13_valid(first_code) or left(first_code, 2) <> '20' then
    raise exception 'Generated code is invalid';
  end if;
  select barcode into again from public.prepare_product_labels(array[missing_id, missing_id]);
  if first_code <> again then raise exception 'Retry changed code'; end if;
  update public.profiles set role = 'reader' where id = actor.id;
  perform public.prepare_product_labels(array[missing_id]);
  update public.profiles set role = actor.role where id = actor.id;

  alter table public.products disable trigger products_reserve_barcode;
  update public.products set barcode = first_code where id = invalid_id;
  alter table public.products enable trigger products_reserve_barcode;
  failed := false;
  begin perform public.prepare_product_labels(array[missing_id]);
  exception when others then failed := true; end;
  if not failed then raise exception 'Historical duplicate was not detected'; end if;
  alter table public.products disable trigger products_reserve_barcode;
  update public.products set barcode = '123' where id = invalid_id;
  alter table public.products enable trigger products_reserve_barcode;

  insert into public.products(organization_id, name, sku)
    values(actor.organization_id, 'QA automatic creation', 'QA-' || gen_random_uuid()) returning barcode into generated;
  if generated = first_code or not public.product_ean13_valid(generated) then
    raise exception 'Automatic creation failed';
  end if;
  failed := false;
  begin
    insert into public.products(organization_id, name, sku, barcode)
      values(actor.organization_id, 'QA duplicate', 'QA-' || gen_random_uuid(), first_code);
  exception when others then failed := true; end;
  if not failed then raise exception 'Duplicate accepted'; end if;

  failed := false;
  begin perform public.prepare_product_labels(array[gen_random_uuid()]);
  exception when others then failed := true; end;
  if not failed then raise exception 'Unavailable product accepted'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  failed := false;
  begin perform public.prepare_product_labels(array[missing_id]);
  exception when others then failed := true; end;
  if not failed then raise exception 'Anonymous access accepted'; end if;
  if has_function_privilege('anon', 'public.prepare_product_labels(uuid[])', 'execute') then
    raise exception 'Anonymous role can execute RPC';
  end if;
  raise notice 'PASS: automatic creation, EAN checksum, uniqueness, retry, atomic batch, unavailable IDs, anonymous access';
end;
$$;
rollback;
