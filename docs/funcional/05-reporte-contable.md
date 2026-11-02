# Reporte contable: revisión previa

Facturación > Reporte contable consulta en el servidor todos los comprobantes del período y sede, sin depender de la paginación del listado. Excluye borradores e incluye notas y anulados. Solo propietario y administrador pueden consultar la RPC. La interfaz pagina la presentación de los resultados.

La revisión muestra la moneda histórica cuando existe, identifica datos obtenidos de la ficha actual del cliente y comprueba la conciliación entre bases, IGV, total y detalle. No convierte el estado pagado en aceptación SUNAT. La aceptación se muestra con evidencia de fecha y ruta CDR, indicando beta, producción o entorno desconocido.

La migración 20261031010000 captura receptor, moneda y condición de pago al crear el comprobante o emitir un borrador. Después de emitir se conservan esos valores. El entorno se captura cuando cambia la fecha del envío SUNAT, usando la configuración vigente en ese momento. Esto no recupera automáticamente el entorno de envíos antiguos. La condición se obtiene del método actual: credit significa crédito; los otros métodos documentados, contado. No implementa cuotas ni pagos mixtos.

No se modifican cifras históricas ni se rellenan receptores antiguos con datos actuales. Su recuperación requiere evidencia y un flujo posterior. Se añade cancellation_reason como dato separado; su captura en los flujos de anulación sigue pendiente.

## Pendientes confirmados con el usuario

El usuario autorizó usar las reglas propuestas para un borrador que revisará su contador. Está habilitada la descarga preliminar, no una exportación definitiva ni SIRE. El archivo contiene Reporte Contable con las 35 columnas originales, Observaciones con fila/ID/origen de datos y Criterios con filtros, fecha de consulta y versión 0.2. Se usa subtotal neto, importes positivos por documento y descuento separado en base e IGV calculado por línea con la tasa histórica disponible; este último se marca para contrastar con XML. AplicadoEn y los conceptos especiales no registrados quedan vacíos, nunca cero supuesto. Los anulados conservan importes originales y se advierte que no deben sumarse como ventas vigentes.

La descarga registra las filas exactas, filtros, criterios, observaciones e IDs de comprobantes en accounting_exports mediante save_accounting_export, restringido a propietario/administrador. El ID se incluye en el Excel. Si falla el registro, no se descarga. Representa una captura de la revisión, no certificación fiscal del servidor ni garantía de que el usuario guardó el archivo. La pantalla de historial y regeneración de descargas sigue pendiente.

Pendientes posteriores: aprobación del mapeo por el contador; recuperación histórica con XML; captura explícita de condición de pago independiente del medio; captura del motivo de anulación; revisión de aceptación de bajas; pantalla de historial; conceptos especiales si aplican; integración SIRE independiente. La ficha actual del cliente se utiliza como referencia provisional cuando no existe copia histórica y se señala en Observaciones. La moneda histórica faltante permanece vacía. No presentar esta revisión como exportación definitiva ni como carga SUNAT.

## Verificación

Pruebas de reglas: src/lib/accounting-report.test.ts. Pruebas locales transaccionales: supabase/tests/accounting_report.sql, mediante psql con ON_ERROR_STOP. Estas últimas revierten sus datos de prueba y requieren al menos un comprobante local y un propietario activo. No ejecutar en producción.
