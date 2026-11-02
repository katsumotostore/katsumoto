CREATE TABLE public.product_import_rows (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  batch_id uuid NOT NULL,
  row_number integer NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, batch_id, row_number)
);
ALTER TABLE public.product_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_import_rows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_products(
  p_organization_id uuid, p_branch_id uuid, p_batch_id uuid,
  p_rows jsonb, p_mode text DEFAULT 'create', p_replace_tiers boolean DEFAULT false,
  p_apply boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  r jsonb; f jsonb; tier jsonb; v public.products%ROWTYPE; old public.products%ROWTYPE;
  saved public.product_import_rows%ROWTYPE;
  results jsonb := '[]'; result jsonb; request jsonb;
  sku text; state text; token text; previous_price bigint; initial_stock integer;
  q integer; amount bigint; row_no integer; seen integer[]; movement uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=p_organization_id
    AND is_active AND role IN ('owner','admin','inventory')
  ) THEN RAISE EXCEPTION 'No tienes permisos para importar productos en esta organización'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('create','update') OR p_batch_id IS NULL OR p_replace_tiers IS NULL OR p_apply IS NULL THEN
    RAISE EXCEPTION 'Configuración de importación inválida';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Envía entre 1 y 50 filas por lote';
  END IF;
  IF octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Lote demasiado grande'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch_id AND organization_id=p_organization_id
      AND is_active AND type<>'online' AND stock_source_branch_id IS NULL) THEN
    RAISE EXCEPTION 'Selecciona una sede física activa de esta organización';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rows)) <> (SELECT count(DISTINCT x->>'row') FROM jsonb_array_elements(p_rows) x) THEN
    RAISE EXCEPTION 'Números de fila repetidos';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      sku := btrim(r->>'sku'); row_no := (r->>'row')::integer;
      IF row_no IS NULL OR row_no<2 OR sku IS NULL OR length(sku) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'SKU o número de fila inválido'; END IF;
      IF (SELECT count(*) FROM jsonb_array_elements(p_rows) x WHERE btrim(x->>'sku')=sku)>1 THEN RAISE EXCEPTION 'SKU duplicado en el lote'; END IF;
      request := jsonb_build_object('row',r,'branch',p_branch_id,'mode',p_mode,'replace_tiers',p_replace_tiers,'version',1);
      IF p_apply THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || p_batch_id::text || row_no::text,0));
        SELECT * INTO saved FROM public.product_import_rows WHERE organization_id=p_organization_id AND batch_id=p_batch_id AND row_number=row_no;
        IF FOUND THEN
          IF saved.created_by<>auth.uid() OR saved.request<>request THEN RAISE EXCEPTION 'El lote ya contiene esta fila con otros datos'; END IF;
          results := results || jsonb_build_array(saved.result); CONTINUE;
        END IF;
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || sku,0));
      SELECT * INTO old FROM public.products WHERE organization_id=p_organization_id AND products.sku=sku FOR UPDATE;
      IF old.id IS NOT NULL AND NOT old.is_active THEN RAISE EXCEPTION 'El SKU pertenece a un producto inactivo; revísalo antes de importar'; END IF;
      state := CASE WHEN old.id IS NULL THEN 'created' WHEN p_mode='create' THEN 'skipped' ELSE 'updated' END;
      token := CASE WHEN old.id IS NULL THEN 'new' ELSE md5(to_jsonb(old)::text || coalesce((SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.min_quantity,pt.id)::text FROM public.price_tiers pt WHERE pt.product_id=old.id),'[]')) END;
      IF p_apply AND r->>'expected' IS DISTINCT FROM token THEN RAISE EXCEPTION 'El producto cambió desde la revisión. Vuelve a validar el archivo'; END IF;
      f := r->'fields';
      IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('name','product_family','category_group','category','unit','price_cents','cost_cents','min_stock','max_stock','tax_affectation','supplier','tags','description','image_url')) THEN RAISE EXCEPTION 'Campos de producto no permitidos'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each(f) x WHERE x.value='null'::jsonb OR x.value='""'::jsonb) THEN RAISE EXCEPTION 'Omite los campos vacíos para conservar sus valores'; END IF;
      IF jsonb_typeof(r->'tiers') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'tiers')>100 THEN RAISE EXCEPTION 'Escalas inválidas (máximo 100 por producto)'; END IF;
      IF jsonb_typeof(r->'stock') IS DISTINCT FROM 'number' OR (r->>'stock')::numeric<>trunc((r->>'stock')::numeric) THEN RAISE EXCEPTION 'Stock debe ser entero'; END IF;
      initial_stock := (r->>'stock')::integer;
      IF initial_stock NOT BETWEEN 0 AND 100000000 THEN RAISE EXCEPTION 'Stock fuera de rango'; END IF;
      IF state='updated' AND initial_stock<>0 THEN RAISE EXCEPTION 'Actualizar catálogo no permite stock inicial; déjalo vacío o en cero'; END IF;
      IF state<>'skipped' THEN
        IF EXISTS (SELECT 1 FROM public.products p WHERE p.organization_id=p_organization_id AND lower(btrim(p.sku))=lower(sku) AND p.sku<>sku) THEN RAISE EXCEPTION 'Hay un SKU similar con otras mayúsculas o espacios; revisa la coincidencia'; END IF;
        IF old.id IS NULL THEN
          v := jsonb_populate_record(NULL::public.products,jsonb_build_object('cost_cents',0,'min_stock',0,'max_stock',100,'tags','[]'::jsonb) || f);
        ELSE v := jsonb_populate_record(old,f); END IF;
        IF v.name IS NULL OR length(btrim(v.name)) NOT BETWEEN 1 AND 200 OR length(coalesce(v.description,''))>500 OR length(coalesce(v.supplier,''))>100 THEN RAISE EXCEPTION 'Nombre requerido (máximo 200), descripción máximo 500 y proveedor máximo 100'; END IF;
        IF v.product_family IS NULL OR v.product_family NOT IN ('productos','servicios') OR v.category_group IS NULL OR v.category_group NOT IN ('herramientas','repuestos','maquinas','transporte','maintenance') THEN RAISE EXCEPTION 'Familia o grupo inválido'; END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.managed_categories c JOIN public.managed_category_groups g ON g.id=c.group_id
          JOIN public.managed_category_families fam ON fam.id=g.family_id
          WHERE c.organization_id=p_organization_id AND g.organization_id=p_organization_id AND fam.organization_id=p_organization_id
          AND c.name=v.category AND g.key=v.category_group AND fam.key=v.product_family
        ) THEN RAISE EXCEPTION 'La combinación familia, grupo y categoría no existe en este entorno'; END IF;
        IF v.unit IS NULL OR v.unit NOT IN ('Unidad','Metro','Litro','Galón','Kilogramo','Tonelada','Kit','Juego','Par','Rollo','Caja','Saco','Hora','Servicio','Viaje','Kilómetro') THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
        IF v.tax_affectation IS NULL OR v.tax_affectation NOT IN ('gravado','exonerado','inafecto','exportacion') THEN RAISE EXCEPTION 'Selecciona la afectación IGV explícitamente'; END IF;
        IF v.price_cents IS NULL OR v.cost_cents IS NULL OR v.price_cents NOT BETWEEN 1 AND 10000000000 OR v.cost_cents<0 OR v.cost_cents>v.price_cents THEN RAISE EXCEPTION 'Precio debe ser positivo y no menor al costo'; END IF;
        IF v.min_stock IS NULL OR v.max_stock IS NULL OR v.min_stock<0 OR v.max_stock<0 OR (v.max_stock<>0 AND v.min_stock>v.max_stock) THEN RAISE EXCEPTION 'Límites de stock inválidos'; END IF;
        IF v.product_family='servicios' AND initial_stock<>0 THEN RAISE EXCEPTION 'Los servicios no admiten stock inicial'; END IF;
        IF old.id IS NOT NULL AND old.product_family IS DISTINCT FROM v.product_family AND EXISTS (SELECT 1 FROM public.branch_stock WHERE product_id=old.id AND stock<>0) THEN RAISE EXCEPTION 'No se puede cambiar la familia de un producto con existencias'; END IF;
        IF v.image_url IS NOT NULL AND (length(v.image_url)>2048 OR v.image_url !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'La imagen debe ser una URL HTTPS (máximo 2048 caracteres), no una ruta local'; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_each(f) x WHERE x.key IN ('price_cents','cost_cents','min_stock','max_stock') AND (jsonb_typeof(x.value)<>'number' OR x.value::text::numeric<>trunc(x.value::text::numeric))) THEN RAISE EXCEPTION 'Importes en céntimos y cantidades deben ser enteros'; END IF;
        IF f ? 'tags' AND (jsonb_typeof(f->'tags')<>'array' OR jsonb_array_length(f->'tags')>50) THEN RAISE EXCEPTION 'Etiquetas inválidas'; END IF;
        IF EXISTS (SELECT 1 FROM unnest(v.tags) tag WHERE length(tag) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Cada etiqueta debe tener entre 1 y 100 caracteres'; END IF;
        IF state='updated' AND jsonb_array_length(r->'tiers')>0 AND NOT p_replace_tiers THEN RAISE EXCEPTION 'El archivo tiene escalas: confirma su reemplazo para este modo'; END IF;
        previous_price := v.price_cents; seen := '{}';
        FOR tier IN SELECT value FROM jsonb_array_elements(CASE WHEN state='updated' AND NOT p_replace_tiers THEN coalesce((SELECT jsonb_agg(jsonb_build_object('label',label,'min_quantity',min_quantity,'price_cents',price_cents)) FROM public.price_tiers WHERE product_id=old.id),'[]'::jsonb) ELSE r->'tiers' END) ORDER BY (value->>'min_quantity')::numeric LOOP
          IF jsonb_typeof(tier->'min_quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(tier->'price_cents') IS DISTINCT FROM 'number' OR (tier->>'min_quantity')::numeric<>trunc((tier->>'min_quantity')::numeric) OR (tier->>'price_cents')::numeric<>trunc((tier->>'price_cents')::numeric) THEN RAISE EXCEPTION 'Cantidad de escala y céntimos deben ser enteros'; END IF;
          q := (tier->>'min_quantity')::integer; amount := (tier->>'price_cents')::bigint;
          IF q<2 OR q=ANY(seen) OR amount<=0 OR amount>previous_price OR amount<v.cost_cents OR length(btrim(coalesce(tier->>'label',''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Escalas: cantidades únicas >=2 y precios positivos no crecientes ni menores al costo'; END IF;
          seen := array_append(seen,q); previous_price := amount;
        END LOOP;
      END IF;
      result := jsonb_build_object('row',row_no,'sku',sku,'status',state,'expected',token,'product_id',old.id,
        'before',CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,
        'after',CASE WHEN state='skipped' THEN to_jsonb(old) ELSE to_jsonb(v) END,
        'stock',CASE WHEN state='created' THEN initial_stock ELSE 0 END,'tiers',r->'tiers');
      IF p_apply THEN
        IF state='created' THEN
          INSERT INTO public.products(organization_id,sku,name,product_family,category_group,category,unit,price_cents,cost_cents,min_stock,max_stock,tax_affectation,supplier,tags,description,image_url)
          VALUES(p_organization_id,sku,v.name,v.product_family,v.category_group,v.category,v.unit,v.price_cents,v.cost_cents,v.min_stock,v.max_stock,v.tax_affectation,v.supplier,v.tags,v.description,v.image_url) RETURNING id INTO v.id;
          IF initial_stock>0 THEN
            movement := public.adjust_stock(p_organization_id,v.id,p_branch_id,'in',initial_stock,'Stock inicial (importación ' || p_batch_id || ', fila ' || row_no || ')',auth.uid());
          END IF;
        ELSIF state='updated' THEN
          UPDATE public.products SET name=v.name,product_family=v.product_family,category_group=v.category_group,category=v.category,unit=v.unit,price_cents=v.price_cents,cost_cents=v.cost_cents,min_stock=v.min_stock,max_stock=v.max_stock,tax_affectation=v.tax_affectation,supplier=v.supplier,tags=v.tags,description=v.description,image_url=v.image_url,updated_at=clock_timestamp() WHERE id=old.id;
        END IF;
        IF state='created' OR (state='updated' AND p_replace_tiers) THEN
          DELETE FROM public.price_tiers WHERE product_id=v.id;
          INSERT INTO public.price_tiers(product_id,label,min_quantity,price_cents)
          SELECT v.id,x->>'label',(x->>'min_quantity')::integer,(x->>'price_cents')::bigint FROM jsonb_array_elements(r->'tiers') x;
        END IF;
        result := result || jsonb_build_object('product_id',CASE WHEN state='skipped' THEN old.id ELSE v.id END);
        INSERT INTO public.product_import_rows VALUES(p_organization_id,p_batch_id,row_no,auth.uid(),request,result,now());
      END IF;
      results := results || jsonb_build_array(result);
    EXCEPTION WHEN OTHERS THEN
      results := results || jsonb_build_array(jsonb_build_object('row',r->'row','sku',r->>'sku','status','error','message',SQLERRM));
    END;
  END LOOP;
  RETURN results;
END;
$$;
REVOKE ALL ON FUNCTION public.import_products(uuid,uuid,uuid,jsonb,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_products(uuid,uuid,uuid,jsonb,text,boolean,boolean) TO authenticated;
