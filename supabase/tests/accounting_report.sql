BEGIN;
DO $$
DECLARE source public.invoices%ROWTYPE; fresh public.invoices%ROWTYPE; actor uuid; frozen jsonb; result jsonb; export_id uuid;
BEGIN
  SELECT * INTO source FROM public.invoices WHERE customer_id IS NOT NULL LIMIT 1;
  IF source.id IS NULL THEN RAISE EXCEPTION 'Fixture requiere un comprobante local'; END IF;
  SELECT id INTO actor FROM public.profiles WHERE organization_id=source.organization_id AND role='owner' AND is_active LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  result:=public.accounting_report_source('2026-01-01','2026-12-31',NULL);
  IF jsonb_typeof(result)<>'array' THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
  export_id:=public.save_accounting_export('{"Version":"0.2 preliminar","qa":true}', '[["prueba",100,18,118]]');
  IF NOT EXISTS(SELECT 1 FROM public.accounting_exports WHERE id=export_id AND created_by=actor AND organization_id=source.organization_id AND report='[["prueba",100,18,118]]'::jsonb) THEN RAISE EXCEPTION 'No se conservó la captura de exportación'; END IF;
  fresh:=jsonb_populate_record(source,jsonb_build_object('id',gen_random_uuid(),'number','QA-ACCOUNTING-'||gen_random_uuid(),'serie','QA99','correlativo',987654321,'status','issued','sunat_sent_at',NULL,'sunat_accepted_at',NULL,'sunat_cdr_path',NULL,'payment_method','cash'));
  INSERT INTO public.invoices SELECT (fresh).* RETURNING * INTO fresh;
  IF fresh.accounting_identity IS NULL OR fresh.accounting_currency IS NULL OR fresh.accounting_payment_condition<>'CONTADO' OR fresh.accounting_environment IS NOT NULL THEN RAISE EXCEPTION 'Captura incorrecta'; END IF;
  frozen:=fresh.accounting_identity;
  UPDATE public.customers SET name='QA cliente modificado' WHERE id=fresh.customer_id;
  UPDATE public.invoices SET status='paid',accounting_identity='{}' WHERE id=fresh.id RETURNING * INTO fresh;
  IF fresh.accounting_identity<>frozen THEN RAISE EXCEPTION 'El receptor histórico cambió'; END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN
    PERFORM public.save_accounting_export('{}','[[1]]');
    RAISE EXCEPTION 'Exportación sin autorización';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Exportación sin autorización' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.accounting_report_source('2026-01-01','2026-12-31',NULL);
    RAISE EXCEPTION 'Permisos no verificados';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Permisos no verificados' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: consulta, captura histórica, exportación registrada y autorización';
END $$;
ROLLBACK;
