# Importación de productos

Desde Inventario > Importar se pueden cargar archivos XLSX o CSV de hasta 5 MB y 5.000 productos. Los roles propietario, administrador e inventario tienen acceso; el servidor verifica organización, rol y sede.

## Preparar y revisar

1. Descargar la plantilla desde el sistema. Incluye los catálogos del entorno conectado, instrucciones, ejemplos y listas desplegables.
2. Completar Productos: una fila por SKU, guardado como texto para conservar ceros iniciales. Precios y costos son importes finales en soles; las cantidades son enteras. No usar fórmulas ni separadores de miles.
3. Opcionalmente completar Precios por volumen: SKU, etiqueta, cantidad mínima y precio final. Las cantidades deben ser únicas desde 2 unidades; los precios no aumentan entre escalas ni quedan por debajo del costo.
4. Seleccionar el almacén físico que recibirá las existencias iniciales. La tienda virtual que comparte stock no es un almacén de destino independiente.
5. Revisar el archivo. La vista previa valida contra la base sin guardar productos y muestra errores con la fila original de Excel, cambios y precios.
6. Confirmar únicamente tras resolver todos los errores. Descargar el informe para conservar los resultados.

También se admite la plantilla anterior con precios Especial 3, Mayorista 6 y Distribuidor 20. Las categorías deben existir previamente con su familia y grupo correctos. Las imágenes se especifican con URL HTTPS; no se cargan rutas locales.

## Productos existentes

El modo predeterminado crea nuevos productos y omite SKU existentes. El modo de actualización conserva los campos vacíos; para borrar un campo opcional se utiliza la edición individual. El stock inicial de un producto existente debe estar vacío o en cero: los ajustes de existencias se realizan mediante el flujo habitual de stock.

Reemplazar escalas requiere una selección explícita. Al activarlo se sustituye la lista completa de cada producto actualizado, incluso por una lista vacía. Sin activarlo se conservan las escalas existentes; si el archivo contiene nuevas escalas para un SKU existente, se solicita confirmar su reemplazo.

## Integridad y recuperación

Cada producto, sus escalas y su entrada de stock se guardan en una transacción. Si falla el stock, también se revierte la creación del producto. Otras filas pueden completarse; el informe indica los resultados por fila. Un cambio concurrente desde la revisión obliga a revisar nuevamente ese producto.

Si se interrumpe la conexión, mantener abierta la ventana y usar Reintentar mismo lote. El servidor reconoce el lote y sus filas ya confirmadas: no duplica productos ni suma stock otra vez. Tras cerrar la ventana se necesita una nueva revisión. Los registros internos del lote guardan actor, solicitud y resultado; no se exponen directamente al cliente.

El código de barras no se inventa a partir del SKU: se genera posteriormente con el flujo existente de Imprimir etiquetas.

## Despliegue y comprobación

Aplicar primero `supabase/migrations/20261028010000_transactional_product_import.sql` en el backend de destino y recargar el esquema de PostgREST. Después publicar el frontend con `public/templates/productos-v1.xlsx`. No se requiere una nueva Edge Function. Si falta la RPC, la interfaz indica que falta aplicar la migración.

Pruebas del parser y plantilla: `pnpm exec vitest run src/lib/product-import.test.ts`. Pruebas SQL: ejecutar `supabase/tests/product_import.sql` mediante psql en la base local de desarrollo, con ON_ERROR_STOP. El script usa los catálogos y perfiles de desarrollo, crea sus datos dentro de una transacción y termina en ROLLBACK. No ejecutar ese fixture en producción.
