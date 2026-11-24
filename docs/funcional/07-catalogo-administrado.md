# Catálogo administrado

Productos, filtros de inventario, POS, tienda e importación comparten las tablas managed_category_families, managed_category_groups y managed_categories. Se elimina la lista fija paralela del frontend.

## Clasificación

El tipo permanece controlado: Producto o Servicio, porque determina el tratamiento del inventario. Dentro de cada tipo se administran grupos y categorías. products.category_id identifica la categoría; los campos de texto anteriores se conservan sincronizados para compatibilidad.

Renombrar una categoría actualiza su nombre en los productos vinculados sin modificar comprobantes históricos. No se admiten categorías de otra organización, destinos archivados ni duplicados normalizados dentro del mismo grupo.

## Operación

- El formulario de producto permite buscar una categoría del grupo elegido y crearla con permisos de administración de inventario.
- Cambiar tipo o grupo requiere seleccionar nuevamente la categoría.
- Categorías permite buscar, ver cantidades de productos, editar nombres e imágenes y mostrar archivados.
- Archivar conserva los vínculos existentes y excluye la categoría de nuevas asignaciones.
- Reasignar mueve todos los productos de la categoría, incluidos los inactivos, a otra del mismo tipo y archiva el origen en una transacción auditada.
- Los productos sin vínculo se muestran como pendientes para asignarlos explícitamente.
- La plantilla de importación toma grupos y categorías activos del administrador.

## Migración de datos

Las migraciones 20261124010000, 20261124020000 y 20261124030000 incorporan vínculos, controles, auditoría y permisos de lectura pública de category_id. Se registra una copia de la clasificación anterior en audit_log. Las coincidencias ambiguas quedan pendientes; no se fusionan por suposición.

En la base local revisada se vincularon ocho productos. Se conservaron Carburador e Instalación creando sus entradas administradas faltantes. ACEI-001, con nombre Aceite 2T Castrol, se corrigió de Cadena a Lubricantes mediante una condición específica de SKU y nombre. La familia de prueba no reconocida se archivó. La reclasificación no cambia existencias ni importes.

## Despliegue

Aplicar las tres migraciones en orden antes de publicar el frontend. Revisar el proyecto Supabase destino y respaldar sus datos según el procedimiento de despliegue. La base remota puede tener productos distintos: revisar los pendientes después de migrar. Las migraciones de esta entrega se aplicaron solamente al entorno local; un push del frontend por sí solo no actualiza Supabase.

## Verificación

Pruebas unitarias del catálogo cubren jerarquías activas, grupos dinámicos y categorías homónimas con identificadores distintos. supabase/tests/managed_catalog.sql valida la migración del conjunto local, renombrado, duplicados, destinos inválidos, permisos, reasignación, conservación de stock y auditoría dentro de una transacción que se revierte.
