# Etiquetas y codigos internos

La asignacion se realiza en PostgreSQL mediante la migracion
`20261018160000_product_barcode_assignment.sql`. Debe aplicarse antes de desplegar
el frontend que usa `prepare_product_labels`.

- Los nuevos productos reciben codigo en un trigger, tambien al importar lotes.
- Los productos antiguos sin codigo se completan al confirmar la preparacion de etiquetas.
- Los codigos nuevos tienen formato EAN-13 con prefijo interno `20`, una secuencia
  de diez digitos y digito verificador. Son identificadores internos de Katsumoto,
  no acreditan un registro GS1 ni se ofrecen como identificadores comerciales globales.
- Los codigos existentes se conservan. Los invalidos o duplicados requieren revision;
  el flujo de etiquetas no los reemplaza.
- `product_barcode_reservations` reserva los numeros por organizacion con clave
  primaria. La secuencia y las reservas no estan expuestas al cliente. Los numeros
  reservados no se reutilizan al borrar productos.
- La RPC valida usuario activo y organizacion, bloquea productos en orden estable
  y procesa el lote en una transaccion. Solo owner, admin e inventory asignan codigos;
  otros perfiles activos pueden preparar etiquetas de codigos existentes validos.
- Reintentar reutiliza el codigo guardado. Descargar o abrir el PDF no crea otro codigo.
- Se admiten 1 a 99 copias por producto, hasta 500 productos y 5000 etiquetas por PDF.

El detalle del producto y la accion de la tabla abren el mismo dialogo con el producto
preseleccionado. El acceso general ofrece filtros y seleccion masiva. La opcion
Vista previa abre el PDF; la impresion fisica se realiza desde el visor.

Pruebas: `src/lib/product-labels.test.ts`,
`src/lib/printing/__tests__/labels.test.ts` y
`supabase/tests/product_barcode_assignment.sql` (base local, transaccion con rollback).

## Reparacion de codigos

La migracion `20261018180000_product_barcode_repair.sql` agrega:

- `product_barcode_conflicts`: incluye productos archivados de la misma organizacion.
- `repair_product_barcode`: restringida a owner, admin e inventory activos. Recibe
  el codigo esperado para evitar sobrescribir cambios concurrentes. Un reintento
  con el codigo anterior es rechazado, no genera otra asignacion.
- Reparacion individual con codigo interno nuevo o EAN-13 del fabricante. Se
  validan formato, verificador y reservas en el servidor, sin alterar los pares
  que comparten el codigo anterior.
- Auditoria `barcode_repaired` con usuario, producto, codigo anterior, nuevo y origen.

En el dialogo de etiquetas, cada fila por revisar ofrece Reparar codigo. El panel
muestra los productos que comparten el codigo, solicita confirmacion para reemplazar
las etiquetas fisicas y regresa al producto listo para descargar. Los productos sin
codigo tambien pueden recibir un EAN-13 del fabricante mediante Asignar codigo.
Los codigos antiguos permanecen reservados y no se reasignan automaticamente.

Prueba adicional: `supabase/tests/product_barcode_repair.sql`, con rollback.
