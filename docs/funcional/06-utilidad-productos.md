# Utilidad por producto

Disponible en Reportes → Utilidad por producto. Acceso backend restringido a propietario/administrador activo de la organización autenticada.

Consulta por fecha de emisión inclusiva (máximo 367 días) y sede comercial. No consulta pedidos, por lo que la conversión de pedidos a comprobantes no duplica ventas. Se conserva el almacén de origen y canal en el detalle. Borradores y anulados se excluyen.

## Costos y límites

El catálogo no define si su costo incluye impuestos. Por ello no se copia automáticamente como costo comparable. Desde el detalle se confirma un costo unitario comparable con ingresos sin IGV y su moneda (PEN/USD). Se guarda en `product_profit_costs`; no modifica el catálogo. Cada confirmación se audita.

Las líneas nuevas de facturas/boletas emitidas capturan ese costo mediante trigger en `invoice_profit_costs`. Los borradores lo capturan al emitir. Las capturas no cambian al confirmar otro costo y no son accesibles directamente por clientes API. No se rellenan costos históricos.

El modo estimado usa el costo confirmado actual cuando falta una captura, únicamente si coincide con la moneda histórica del comprobante. Una moneda desconocida no se asume PEN. Cero requiere confirmación explícita. Los costos incluyen únicamente los conceptos que el administrador haya confirmado; esto no constituye un sistema de compras o valorización automática de inventario.

## Notas

Desde el detalle, el administrador vincula una línea a una línea del comprobante original y clasifica precio o devolución física. Se valida organización, referencia, producto, moneda y cantidad devuelta acumulada, bloqueando la línea original para concurrencia. Las notas de débito solo permiten ajuste de precio. Las notas por cantidad requieren revisión adicional antes de clasificarlas; no se infiere su efecto.

Precio reduce/aumenta ingreso sin cambiar unidades/costo. Devolución revierte unidades y costo histórico original (o estimado explícito). Notas no revisadas o con original anulado se muestran como pendientes y no afectan ventas ni utilidad agregadas. No modifica stock: se debe verificar el movimiento físico existente por separado. El flujo heredado de notas requiere una revisión independiente antes de automatizar totalmente las devoluciones.

## Cálculo

Ingreso por línea = total de línea menos IGV, con signo negativo en NC. No vuelve a aplicar descuentos. Costo = costo unitario por unidades netas. Utilidad bruta = ingreso menos costo. No incluye gastos generales. Margen = utilidad / ingreso con costo conocido. Promedios ponderados por unidades; se omiten si el resultado es parcial o unidades <= 0. Monedas separadas, sin conversión.

Documentos sin moneda histórica conservan sus importes individuales en Detalle, pero no generan sumas monetarias consolidadas ni promedios de precio: no se puede afirmar que sus importes sean comparables. No se asigna PEN por defecto.

El RPC obtiene todas las líneas del período sin el límite REST de 1000 filas. La interfaz consolida y filtra ese conjunto completo, con paginación solo visual de 25 productos. Excel exporta todas las filas filtradas, detalle y criterios. Se ocultan resultados anteriores cuando cambian fechas/sede/modo, hasta consultar de nuevo.

## Despliegue

Aplicar primero `20261102010000_product_profit.sql`, que depende de `20261031010000_accounting_reports.sql`, seguido de `20261102020000_profit_report_metadata.sql` y después desplegar frontend. No basta con push del frontend. Migraciones probadas localmente y aplicadas al proyecto remoto `zenemlznggnugmjvkfbh` el 02/11/2026.

La opción «Preparar costos antes de vender» permite buscar un producto del catálogo y confirmar su costo sin requerir ventas previas. Los accesos rápidos Hoy, Mes anterior y Este mes completan el período; Consultar obtiene la información. Las columnas de unidad y entorno se obtienen mediante la migración de metadatos.

Pruebas: `src/lib/product-profit.test.ts` y `supabase/tests/product_profit.sql` (transacción con rollback).

## Evolución posterior

Compras y entradas valorizadas, fletes/impuestos de adquisición, costo por almacén y método de valorización requieren un módulo adicional. La versión actual registra costos confirmados, no calcula un promedio de compras. No se cambian datos fiscales ni históricos para completar el reporte.
