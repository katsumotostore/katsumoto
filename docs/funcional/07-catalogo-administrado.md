# Catálogo administrado

Productos, filtros de inventario, POS, tienda e importación comparten las tablas managed_category_families, managed_category_groups y managed_categories. Se elimina la lista fija paralela del frontend.

## Clasificación

Ejemplos confirmados: **Carburador → Original → STIHL** y **Carburador → Alternativo → STIHL2**. Producto/Servicio es un tipo separado. La migración 20261125020000 archiva las familias heredadas que representaban tipos, convierte las clasificaciones anteriores en familias comerciales y conserva los artículos en ramas explícitas «Por clasificar» cuando se desconoce origen o categoría. No asigna marcas por suposición; las imágenes existentes se preservan en las categorías pendientes. El administrador permite completar estas asignaciones individualmente o por categoría.

El tipo permanece controlado: Producto o Servicio, porque determina el tratamiento del inventario. Es independiente de la clasificación Familia → Grupo → Categoría. Las familias son administrables. products.category_id identifica la categoría y permite obtener su grupo y familia. El campo legado products.product_family conserva únicamente el tipo operativo para mantener compatibles las ventas, stock y servicios; no representa la familia comercial.

Renombrar una categoría actualiza su nombre en los productos vinculados sin modificar comprobantes históricos. No se admiten categorías de otra organización, destinos archivados ni duplicados normalizados dentro del mismo grupo.

## Operación

- El formulario de producto permite buscar una categoría del grupo elegido y crearla con permisos de administración de inventario.
- Cambiar familia o grupo requiere seleccionar nuevamente la categoría. Cambiar tipo conserva la clasificación y se impide cuando el artículo tiene existencias.
- Categorías permite buscar, ver cantidades de productos, editar nombres e imágenes y mostrar archivados.
- Archivar conserva los vínculos existentes y excluye la categoría de nuevas asignaciones.
- Eliminar requiere confirmación y permiso owner/admin/inventory. Borra la categoría y deja sus artículos con category_id nulo y los textos de grupo/categoría vacíos. Eliminar un grupo o familia incluye sus descendientes. Se conservan artículos, tipo, precios, stock y comprobantes; el cambio queda auditado en una transacción. Los artículos aparecen en pendientes para volver a asignarlos. Requiere la migración 20261125040000.
- Reasignar mueve todos los productos de la categoría, incluidos los inactivos, a otra de la misma organización y archiva el origen en una transacción auditada. Puede cruzar familias sin modificar el tipo de los artículos.
- Los productos sin vínculo se muestran como pendientes para asignarlos explícitamente.
- La plantilla de importación toma grupos y categorías activos del administrador.

## Migración de datos

La migración 20261125010000 separa el tipo de la familia. Conserva todos los nombres y vínculos actuales, permite crear y renombrar familias libremente y no reactiva automáticamente familias archivadas de prueba. Aplicarla antes del nuevo frontend. En Excel, la columna antes llamada Familia (productos/servicios) pasa a llamarse Tipo; se siguen aceptando las plantillas anteriores. La familia comercial se obtiene del grupo seleccionado.

Las migraciones 20261124010000, 20261124020000 y 20261124030000 incorporan vínculos, controles, auditoría y permisos de lectura pública de category_id. Se registra una copia de la clasificación anterior en audit_log. Las coincidencias ambiguas quedan pendientes; no se fusionan por suposición.

En la base local revisada se vincularon ocho productos. Se conservaron Carburador e Instalación creando sus entradas administradas faltantes. ACEI-001, con nombre Aceite 2T Castrol, se corrigió de Cadena a Lubricantes mediante una condición específica de SKU y nombre. La familia de prueba no reconocida se archivó. La reclasificación no cambia existencias ni importes.

## Despliegue

Aplicar las tres migraciones en orden antes de publicar el frontend. Revisar el proyecto Supabase destino y respaldar sus datos según el procedimiento de despliegue. La base remota puede tener productos distintos: revisar los pendientes después de migrar. Las migraciones de esta entrega se aplicaron solamente al entorno local; un push del frontend por sí solo no actualiza Supabase.

## Verificación

Pruebas unitarias del catálogo cubren jerarquías activas, grupos dinámicos y categorías homónimas con identificadores distintos. supabase/tests/managed_catalog.sql valida la migración del conjunto local, renombrado, duplicados, destinos inválidos, permisos, reasignación, conservación de stock y auditoría dentro de una transacción que se revierte.
