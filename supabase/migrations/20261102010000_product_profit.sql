CREATE TABLE public.product_profit_costs (
 product_id uuid PRIMARY KEY REFERENCES public.products(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 unit_cost_cents bigint NOT NULL CHECK(unit_cost_cents>=0),
 currency text NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES auth.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.invoice_profit_costs (
 item_id uuid PRIMARY KEY REFERENCES public.invoice_items(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 unit_cost_cents bigint CHECK(unit_cost_cents>=0),
 currency text,
 captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profit_note_links (
 item_id uuid PRIMARY KEY REFERENCES public.invoice_items(id),
 original_item_id uuid NOT NULL REFERENCES public.invoice_items(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 effect text NOT NULL CHECK(effect IN ('return','price')),
 reviewed_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_profit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_profit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_note_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_profit_costs,public.invoice_profit_costs,public.profit_note_links FROM anon,authenticated;

CREATE FUNCTION public.profit_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('owner','admin');
 IF org IS NULL THEN RAISE EXCEPTION 'Solo propietario o administrador pueden consultar costos y utilidad'; END IF;
 RETURN org;
END $$;

CREATE FUNCTION public.confirm_profit_cost(p_product uuid,p_cost bigint,p_currency text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.profit_org();
BEGIN
 IF p_cost IS NULL OR p_cost<0 OR p_cost>10000000000 OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product AND organization_id=org) THEN RAISE EXCEPTION 'Costo o producto inválido'; END IF;
 IF p_currency IS NULL OR p_currency NOT IN ('PEN','USD') THEN RAISE EXCEPTION 'Moneda inválida'; END IF;
 INSERT INTO public.product_profit_costs(product_id,organization_id,unit_cost_cents,currency,confirmed_by)
 VALUES(p_product,org,p_cost,p_currency,auth.uid()) ON CONFLICT(product_id) DO UPDATE SET unit_cost_cents=excluded.unit_cost_cents,currency=excluded.currency,confirmed_by=excluded.confirmed_by,confirmed_at=now();
 INSERT INTO public.audit_log(organization_id,user_id,action,entity,entity_id,new_value)
 VALUES(org,auth.uid(),'profit.cost.confirm','product',p_product,jsonb_build_object('cost',p_cost,'currency',p_currency));
END $$;

CREATE FUNCTION public.capture_profit_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.invoices; c public.product_profit_costs;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=NEW.invoice_id;
 IF inv.status<>'draft' AND inv.invoice_type IN ('factura','boleta') THEN
 SELECT * INTO c FROM public.product_profit_costs WHERE product_id=NEW.product_id AND organization_id=inv.organization_id;
 INSERT INTO public.invoice_profit_costs(item_id,organization_id,unit_cost_cents,currency)
 VALUES(NEW.id,inv.organization_id,c.unit_cost_cents,c.currency) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_profit_cost AFTER INSERT ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.capture_profit_cost();

CREATE FUNCTION public.capture_draft_profit_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.status='draft' AND NEW.status<>'draft' AND NEW.invoice_type IN ('factura','boleta') THEN
 INSERT INTO public.invoice_profit_costs(item_id,organization_id,unit_cost_cents,currency)
 SELECT it.id,NEW.organization_id,c.unit_cost_cents,c.currency FROM public.invoice_items it
 LEFT JOIN public.product_profit_costs c ON c.product_id=it.product_id AND c.organization_id=NEW.organization_id
 WHERE it.invoice_id=NEW.id ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_draft_profit_cost AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.capture_draft_profit_cost();

CREATE FUNCTION public.review_profit_note(p_item uuid,p_original uuid,p_effect text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.profit_org(); n record; o record; returned numeric;
BEGIN
 SELECT it.*,i.reference_invoice_id,i.invoice_type,i.accounting_currency INTO n FROM public.invoice_items it JOIN public.invoices i ON i.id=it.invoice_id WHERE it.id=p_item AND i.organization_id=org AND i.status NOT IN ('draft','cancelled');
 SELECT it.*,i.accounting_currency INTO o FROM public.invoice_items it JOIN public.invoices i ON i.id=it.invoice_id WHERE it.id=p_original AND i.organization_id=org AND i.status NOT IN ('draft','cancelled') AND i.invoice_type IN ('factura','boleta') FOR UPDATE OF it;
 IF n.id IS NULL OR o.id IS NULL OR n.invoice_type NOT IN ('nota_credito','nota_debito') OR n.reference_invoice_id IS DISTINCT FROM o.invoice_id OR n.product_id IS DISTINCT FROM o.product_id OR n.accounting_currency IS DISTINCT FROM o.accounting_currency THEN RAISE EXCEPTION 'La línea debe pertenecer al comprobante original, producto y moneda'; END IF;
 IF p_effect NOT IN ('return','price') OR (p_effect='return' AND n.invoice_type<>'nota_credito') THEN RAISE EXCEPTION 'Efecto inválido'; END IF;
 IF p_effect='return' THEN
 SELECT coalesce(sum(it.quantity),0) INTO returned FROM public.profit_note_links l JOIN public.invoice_items it ON it.id=l.item_id JOIN public.invoices i ON i.id=it.invoice_id WHERE l.original_item_id=p_original AND l.effect='return' AND l.item_id<>p_item AND i.status NOT IN ('draft','cancelled');
 IF returned+n.quantity>o.quantity THEN RAISE EXCEPTION 'La devolución supera las unidades originales'; END IF;
 END IF;
 INSERT INTO public.profit_note_links VALUES(p_item,p_original,org,p_effect,auth.uid(),now()) ON CONFLICT(item_id) DO UPDATE SET original_item_id=excluded.original_item_id,effect=excluded.effect,reviewed_by=excluded.reviewed_by,reviewed_at=now();
 INSERT INTO public.audit_log(organization_id,user_id,action,entity,entity_id,new_value) VALUES(org,auth.uid(),'profit.note.review','invoice_item',p_item,jsonb_build_object('original',p_original,'effect',p_effect));
END $$;

CREATE FUNCTION public.product_profit_report(p_from date,p_to date,p_branch uuid DEFAULT NULL,p_estimate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.profit_org(); result jsonb;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Selecciona un período de hasta 367 días'; END IF;
 IF p_branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch AND organization_id=org) THEN RAISE EXCEPTION 'Sede inválida'; END IF;
 WITH source AS (
 SELECT it.id,it.product_id,it.product_name,it.product_sku,it.quantity,
 i.id invoice_id,i.serie||'-'||i.correlativo document,i.issue_date,i.invoice_type,i.sales_channel,i.branch_id,i.stock_branch_id,
 coalesce(i.accounting_currency,'SIN MONEDA') currency,coalesce(p.category,'Sin categoría') category,
 (it.line_total_cents-it.igv_cents)*(CASE WHEN i.invoice_type='nota_credito' THEN -1 ELSE 1 END) revenue,
 l.effect,original.status original_status,
 CASE WHEN i.invoice_type IN ('factura','boleta') THEN it.quantity WHEN l.effect='return' THEN -it.quantity ELSE 0 END units,
 CASE WHEN i.invoice_type IN ('nota_credito','nota_debito') AND (l.item_id IS NULL OR original.status IN ('draft','cancelled')) THEN 'pending_adjustment'
 WHEN i.invoice_type IN ('nota_credito','nota_debito') AND l.effect='price' THEN 'historical'
 WHEN snap.unit_cost_cents IS NOT NULL AND snap.currency=i.accounting_currency THEN 'historical'
 WHEN p_estimate AND current_cost.unit_cost_cents IS NOT NULL AND current_cost.currency=i.accounting_currency THEN 'estimated'
 ELSE 'pending' END quality,
 CASE WHEN i.invoice_type IN ('nota_credito','nota_debito') AND l.effect='price' THEN 0
 WHEN snap.unit_cost_cents IS NOT NULL AND snap.currency=i.accounting_currency THEN snap.unit_cost_cents
 WHEN p_estimate AND current_cost.currency=i.accounting_currency THEN current_cost.unit_cost_cents END unit_cost,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.product_name,'quantity',oi.quantity)),'[]') FROM public.invoice_items oi JOIN public.invoices parent ON parent.id=oi.invoice_id WHERE parent.id=i.reference_invoice_id AND parent.organization_id=org AND oi.product_id IS NOT DISTINCT FROM it.product_id) candidates
 FROM public.invoice_items it JOIN public.invoices i ON i.id=it.invoice_id
 LEFT JOIN public.products p ON p.id=it.product_id AND p.organization_id=org
 LEFT JOIN public.profit_note_links l ON l.item_id=it.id
 LEFT JOIN public.invoice_items original_item ON original_item.id=l.original_item_id
 LEFT JOIN public.invoices original ON original.id=original_item.invoice_id
 LEFT JOIN public.invoice_profit_costs snap ON snap.item_id=CASE WHEN i.invoice_type IN ('factura','boleta') THEN it.id ELSE l.original_item_id END
 LEFT JOIN public.product_profit_costs current_cost ON current_cost.product_id=it.product_id AND current_cost.organization_id=org
 WHERE i.organization_id=org AND i.status NOT IN ('draft','cancelled') AND i.issue_date BETWEEN p_from AND p_to AND (p_branch IS NULL OR i.branch_id=p_branch)
 ), lines AS (
 SELECT *,CASE WHEN quality IN ('historical','estimated') THEN unit_cost*units END cost FROM source
 ) SELECT jsonb_build_object('generated_at',now(),'lines',coalesce(jsonb_agg(to_jsonb(lines) ORDER BY issue_date,document,id),'[]')) INTO result FROM lines;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.profit_org(),public.confirm_profit_cost(uuid,bigint,text),public.review_profit_note(uuid,uuid,text),public.product_profit_report(date,date,uuid,boolean),public.capture_profit_cost(),public.capture_draft_profit_cost() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_profit_cost(uuid,bigint,text),public.review_profit_note(uuid,uuid,text),public.product_profit_report(date,date,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
