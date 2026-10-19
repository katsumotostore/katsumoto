begin;

create index if not exists products_org_barcode_lookup
on public.products(organization_id, barcode) where barcode <> '';

create function public.product_barcode_conflicts()
returns table(product_id uuid, other_id uuid, other_name text, other_sku text, other_active boolean)
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  select organization_id into org from public.profiles where id = auth.uid() and is_active;
  if org is null then raise exception 'Sesion no autorizada'; end if;
  return query
    select p.id, other.id, other.name, other.sku, other.is_active
    from public.products p join public.products other
      on other.organization_id = p.organization_id and other.barcode = p.barcode and other.id <> p.id
    where p.organization_id = org and p.is_active and p.barcode <> '';
end;
$$;

create function public.repair_product_barcode(
  p_product_id uuid, p_expected_barcode text, p_new_barcode text default null
) returns public.products
language plpgsql security definer set search_path = '' as $$
declare org uuid; user_role text; product public.products; old_code text;
begin
  select organization_id, role into org, user_role from public.profiles
    where id = auth.uid() and is_active;
  if org is null or user_role not in ('owner', 'admin', 'inventory') then
    raise exception 'Solo administradores e inventario pueden reparar codigos';
  end if;
  select * into product from public.products
    where id = p_product_id and organization_id = org and is_active for update;
  if not found then raise exception 'Producto no disponible'; end if;
  if product.barcode is distinct from p_expected_barcode then
    raise exception 'El codigo cambio desde que abriste el formulario. Actualiza y revisa el producto' using errcode = '40001';
  end if;
  if p_new_barcode is not null then
    if not public.product_ean13_valid(p_new_barcode) then
      raise exception 'Ingresa exactamente 13 digitos con un verificador EAN-13 valido';
    end if;
    if p_new_barcode = product.barcode then raise exception 'El nuevo codigo debe ser diferente al actual'; end if;
  end if;
  old_code := product.barcode;
  update public.products set barcode = coalesce(p_new_barcode, '')
    where id = product.id returning * into product;
  perform public.insert_audit_entry('barcode_repaired', 'products', product.id,
    jsonb_build_object('barcode', old_code),
    jsonb_build_object('barcode', product.barcode, 'source', case when p_new_barcode is null then 'internal' else 'manufacturer' end), org);
  return product;
end;
$$;

revoke all on function public.product_barcode_conflicts() from public, anon;
revoke all on function public.repair_product_barcode(uuid, text, text) from public, anon;
grant execute on function public.product_barcode_conflicts() to authenticated;
grant execute on function public.repair_product_barcode(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
