begin;

create sequence public.product_internal_barcode_seq minvalue 1 maxvalue 9999999999 no cycle;
revoke all on sequence public.product_internal_barcode_seq from public, anon, authenticated;

create table public.product_barcode_reservations (
  organization_id uuid not null references public.organizations(id),
  barcode text not null,
  primary key (organization_id, barcode)
);
alter table public.product_barcode_reservations enable row level security;
revoke all on public.product_barcode_reservations from public, anon, authenticated;
insert into public.product_barcode_reservations
select distinct organization_id, barcode from public.products where coalesce(barcode, '') <> '';

create function public.product_ean13_valid(code text) returns boolean
language sql immutable strict set search_path = '' as $$
  select case when code ~ '^[0-9]{13}$' then
    (select (10 - sum(substr(code, i, 1)::integer * case when i % 2 = 0 then 3 else 1 end) % 10) % 10
     from generate_series(1, 12) i) = substr(code, 13, 1)::integer
  else false end;
$$;

create function public.reserve_product_barcode() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text; digit integer; reserved text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'No se puede cambiar la organizacion de un producto';
    end if;
    if coalesce(old.barcode, '') <> '' and new.barcode is not distinct from old.barcode then
      return new;
    end if;
  end if;
  if btrim(coalesce(new.barcode, '')) = '' then
    loop
      base := '20' || lpad(nextval('public.product_internal_barcode_seq')::text, 10, '0');
      select (10 - sum(substr(base, i, 1)::integer * case when i % 2 = 0 then 3 else 1 end) % 10) % 10
        into digit from generate_series(1, 12) i;
      new.barcode := base || digit::text;
      insert into public.product_barcode_reservations values (new.organization_id, new.barcode)
        on conflict do nothing returning barcode into reserved;
      exit when reserved is not null;
    end loop;
  else
    if not public.product_ean13_valid(new.barcode) then
      raise exception 'El codigo de barras debe ser un EAN-13 valido';
    end if;
    insert into public.product_barcode_reservations values (new.organization_id, new.barcode)
      on conflict do nothing returning barcode into reserved;
    if reserved is null then raise exception 'El codigo de barras ya esta asignado o reservado'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.reserve_product_barcode() from public, anon, authenticated;
create trigger products_reserve_barcode before insert or update of barcode, organization_id
on public.products for each row execute function public.reserve_product_barcode();

create function public.prepare_product_labels(p_product_ids uuid[]) returns setof public.products
language plpgsql security definer set search_path = '' as $$
declare org uuid; user_role text; product public.products; expected integer; processed integer := 0;
begin
  select organization_id, role into org, user_role from public.profiles
    where id = auth.uid() and is_active;
  if org is null then raise exception 'Sesion no autorizada'; end if;
  select count(distinct id) into expected from unnest(p_product_ids) id;
  if expected = 0 or expected > 500 then raise exception 'Selecciona entre 1 y 500 productos'; end if;
  if (select count(*) from public.products where id = any(p_product_ids) and organization_id = org and is_active) <> expected then
    raise exception 'La seleccion contiene productos no disponibles';
  end if;
  for product in select * from public.products where id = any(p_product_ids) and organization_id = org and is_active order by id for update loop
    if btrim(coalesce(product.barcode, '')) = '' then
      if user_role not in ('owner', 'admin', 'inventory') then
        raise exception 'Solo administradores e inventario pueden asignar codigos';
      end if;
      update public.products set barcode = '' where id = product.id returning * into product;
    end if;
    if not public.product_ean13_valid(product.barcode) then
      raise exception 'Revisar codigo invalido del producto %', product.sku;
    end if;
    if exists (select 1 from public.products p where p.organization_id = org and p.barcode = product.barcode and p.id <> product.id) then
      raise exception 'Revisar codigo duplicado del producto %', product.sku;
    end if;
    return next product;
    processed := processed + 1;
  end loop;
  if processed <> expected then raise exception 'Los productos cambiaron. Actualiza la seleccion'; end if;
end;
$$;
revoke all on function public.prepare_product_labels(uuid[]) from public, anon;
grant execute on function public.prepare_product_labels(uuid[]) to authenticated;
commit;
