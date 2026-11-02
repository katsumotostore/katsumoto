DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.product_profit_report(date,date,uuid,boolean)'::regprocedure) INTO definition;
 IF position('coalesce(i.accounting_currency,''SIN MONEDA'') currency' IN definition)=0 THEN RAISE EXCEPTION 'Revisar contrato del reporte de utilidad'; END IF;
 definition:=replace(definition,'coalesce(i.accounting_currency,''SIN MONEDA'') currency','i.accounting_environment environment,p.unit,l.original_item_id reference_item,coalesce(i.accounting_currency,''SIN MONEDA'') currency');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
