ALTER TABLE public.invoices ADD COLUMN accounting_identity jsonb;
ALTER TABLE public.invoices ADD COLUMN accounting_currency text;
ALTER TABLE public.invoices ADD COLUMN accounting_payment_condition text;
ALTER TABLE public.invoices ADD COLUMN accounting_environment text;
ALTER TABLE public.invoices ADD COLUMN cancellation_reason text;

CREATE FUNCTION public.capture_accounting_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' OR (OLD.status='draft' AND NEW.status<>'draft') THEN
    SELECT jsonb_build_object('name',name,'document_type',document_type,'document_number',document_number)
    INTO NEW.accounting_identity FROM public.customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id;
    SELECT currency INTO NEW.accounting_currency FROM public.organizations WHERE id=NEW.organization_id;
    NEW.accounting_payment_condition := CASE WHEN NEW.payment_method='credit' THEN 'CREDITO' WHEN NEW.payment_method IS NOT NULL THEN 'CONTADO' ELSE NULL END;
  ELSIF OLD.status<>'draft' THEN
    NEW.accounting_identity:=OLD.accounting_identity;
    NEW.accounting_currency:=OLD.accounting_currency;
    NEW.accounting_payment_condition:=OLD.accounting_payment_condition;
  END IF;
  IF TG_OP='INSERT' THEN NEW.accounting_environment:=NULL;
  ELSE NEW.accounting_environment:=OLD.accounting_environment;
  END IF;
  IF NEW.sunat_sent_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.sunat_sent_at IS DISTINCT FROM OLD.sunat_sent_at) THEN
    SELECT CASE WHEN modo_produccion THEN 'production' ELSE 'beta' END INTO NEW.accounting_environment
    FROM public.sunat_config WHERE organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER capture_accounting_identity BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.capture_accounting_identity();

CREATE TABLE public.accounting_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  filters jsonb NOT NULL,
  report jsonb NOT NULL,
  version text NOT NULL DEFAULT '1'
);
ALTER TABLE public.accounting_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_exports FROM anon,authenticated;
GRANT SELECT ON public.accounting_exports TO authenticated;
CREATE POLICY accounting_exports_read ON public.accounting_exports FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=accounting_exports.organization_id AND p.is_active AND p.role IN ('owner','admin')));

CREATE FUNCTION public.accounting_report_source(p_from date,p_to date,p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result jsonb;
BEGIN
  SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('owner','admin');
  IF org IS NULL THEN RAISE EXCEPTION 'Solo propietario o administrador pueden exportar reportes contables'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Selecciona un período de hasta 367 días'; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch AND organization_id=org) THEN RAISE EXCEPTION 'Sede inválida'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object(
    'customer',(SELECT jsonb_build_object('name',c.name,'document_type',c.document_type,'document_number',c.document_number) FROM public.customers c WHERE c.id=i.customer_id AND c.organization_id=org),
    'items',(SELECT coalesce(jsonb_agg(to_jsonb(it)),'[]') FROM public.invoice_items it WHERE it.invoice_id=i.id),
    'reference',(SELECT jsonb_build_object('serie',r.serie,'correlativo',r.correlativo,'issue_date',r.issue_date) FROM public.invoices r WHERE r.id=i.reference_invoice_id AND r.organization_id=org)
  ) ORDER BY i.issue_date,i.serie,i.correlativo),'[]') INTO result
  FROM public.invoices i WHERE i.organization_id=org AND i.issue_date BETWEEN p_from AND p_to AND i.status<>'draft' AND (p_branch IS NULL OR i.branch_id=p_branch);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.accounting_report_source(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accounting_report_source(date,date,uuid) TO authenticated;

CREATE FUNCTION public.save_accounting_export(p_filters jsonb,p_report jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result uuid;
BEGIN
  SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('owner','admin');
  IF org IS NULL THEN RAISE EXCEPTION 'Sin permisos para exportar'; END IF;
  IF jsonb_typeof(p_report)<>'array' OR jsonb_array_length(p_report)=0 OR octet_length(p_report::text)>20000000 THEN RAISE EXCEPTION 'Reporte vacío o demasiado grande'; END IF;
  INSERT INTO public.accounting_exports(organization_id,created_by,filters,report) VALUES(org,auth.uid(),p_filters,p_report) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_accounting_export(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_accounting_export(jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
