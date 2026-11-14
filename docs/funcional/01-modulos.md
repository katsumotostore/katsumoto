# 01 — Módulos y reglas de negocio

> Cómo **debe** funcionar el sistema. Verificado contra el código y la BD (2026-08-06).

## Roles del sistema

`profiles.role` (tabla `profiles`): `owner`, `admin`, `cashier`, `vendedor`, `inventory`, `reader`.

| Rol | Alcance |
|---|---|
| `owner` | Todo. Gestión de usuarios, config SUNAT, cierre definitivo. |
| `admin` | Todo salvo lo reservado a owner (gestión de usuarios, config SUNAT). |
| `cashier` | POS y facturación. |
| `vendedor` | POS y facturación (sin gestión). |
| `inventory` | Inventario: productos, ajustes, transferencias, movimientos. |
| `reader` | Solo lectura. |

Los roles son **por organización** (multi-tenant por `organization_id`). El rol se lee de `profiles.role` en las políticas RLS y en las Edge Functions (helper `is_owner_or_admin()`).

---

## 1. Punto de Venta (POS)

**Propósito:** venta en mostrador y emisión de comprobantes (boleta/factura).

**Flujo:**
1. Se **abre una caja** en la sede (`/admin/cash-registers`). Sin caja abierta no se puede vender (salvo sede tipo almacén, que no vende).
2. Se arma el carrito con productos de la sede. El stock se valida contra la sede.
3. Se selecciona el cliente: **boleta** → DNI o "Consumidor Final" (00000000); **factura** → RUC obligatorio.
4. Se cobra (7 métodos) y se emite el comprobante vía RPC `create_invoice_with_items` (transacción: cabecera + ítems + descuento de stock + movimiento).
5. Se imprime ticket térmico (ESC/POS o PDF) con QR, hash, totales y pie de página configurable.

**Reglas:**
- Una caja abierta por sede a la vez.
- Boleta mayor a **S/ 700.00** debe identificar al cliente (no puede usar DNI 00000000) — validación SUNAT.
- Factura exige cliente con RUC (módulo 11).
- El precio unitario se aplica con **escalas por cantidad** (price_tiers).
- En el carrito del POS, los artículos de familia **Servicios** permiten **Editar precio** antes de cobrar. Se acepta un precio unitario final mayor a cero con hasta dos decimales; se recalculan los totales e impuestos. El precio personalizado se conserva al cambiar la cantidad o agregar de nuevo el mismo servicio, y se guarda en los ítems de la boleta/factura sin modificar el catálogo. **Restaurar precio** vuelve a la tarifa automática vigente para la cantidad del carrito. Disponible en escritorio y móvil para quien puede operar la caja.
- El efectivo recibido/vuelto se registra al cobrar y se imprime en el ticket.

---

## 2. Facturación (manual + notas)

**Propósito:** emitir comprobantes fuera del POS (facturas, boletas, notas de crédito/débito) y gestionar su envío a SUNAT.

**Tipos de comprobante y series:**
| Tipo | Código SUNAT | Serie | Vía de envío |
|---|---|---|---|
| Factura | 01 | `F001` (o prefijo de sede) | SOAP `sendBill` (síncrono, CDR inmediato) |
| Boleta | 03 | `B001` | Resumen diario `sendSummary` (asíncrono, ticket) |
| Nota de Crédito a factura | 07 | `FC01` | SOAP `sendBill` |
| Nota de Crédito a boleta | 07 | `BC01` | Resumen diario |
| Nota de Débito | 08 | `FD01` | SOAP `sendBill` |

**Reglas:**
- Correlativo único por (organización, serie), asignado por RPC `get_next_correlativo`.
- **Modelo de precio con IGV incluido** (ver `02-fiscal.md`).
- Las boletas **no** se envían por `sendBill` — el sistema lo bloquea (error `USE_SEND_SUMMARY`) y la UI oculta el botón "SUNAT" en boletas.
- Nota de Crédito solo sobre factura/boleta en estado `accepted` o `paid`. Devuelve stock.
- La aceptación de un resumen diario se **propaga** a las boletas (`check-summary-ticket`): aceptado → `accepted`; rechazado → reenviable.

**Estados del documento:** `draft` → `issued` → `accepted` → `paid` → `cancelled` (con `cancelled` terminal; `rejected` se representa como `issued` + `sunat_error_code`).

---

## 3. Inventario

**Propósito:** gestión de productos, stock por sede, ajustes y transferencias.

**Reglas:**
- **Stock nunca negativo**: las RPC `create_invoice_with_items`, `adjust_stock` y `transfer_stock` usan `UPDATE ... WHERE stock >= qty` (falla "Stock insuficiente" si no alcanza).
- Stock se almacena por `(branch_id, product_id)` en `branch_stock`.
- Movimientos (`stock_movements`) con tipos: `in`, `out`, `adjustment`, `transfer_out`, `transfer_in`, `return`.
- **Transferencias**: origen ≠ destino, siempre genera 2 movimientos opuestos en una transacción.
- **Ajuste**: `adjustment` suma la cantidad (para corregir a la baja se usa `out`).
- Creación de producto siembra `branch_stock` (trigger).

---

## 4. Tienda online

Ver detalle completo en `03-tienda.md`.

**Reglas clave:**
- El checkout es **público (anon)** pero los montos los **recalcula el servidor** (RPC `create_store_order`) desde `products.price_cents` + `price_tiers` — el cliente no puede manipular precios.
- Ciclo del pedido: `pending` → `confirmed` → `processing` → `completed` (o `cancelled`).
- Al completar, `fulfill_store_order` crea la factura/boleta en la sede almacén y descuenta stock (transaccional).

---

## 5. Cajas registradoras

**Propósito:** abrir/cerrar cajas por sede y llevar el arqueo de ventas en efectivo.

**Reglas:**
- El número de caja se asigna con `get_next_register_number` (por sede, incremental, con UNIQUE por org/sede/número).
- Al **cerrar** se calcula el arqueo esperado (apertura + ventas en efectivo) y se registra la diferencia.
- Al cerrar se dispara el **resumen diario automático** de boletas si SUNAT está configurado.
- `credit` (venta a crédito) no genera transacción de caja.

---

## 6. Clientes

**Propósito:** catálogo de clientes (RUC/DNI/Pasaporte/CE) con validación de documento y datos de envío (Ley Amazonía).

**Reglas:**
- Documento único por (org, tipo, número).
- Facturas exigen cliente RUC válido (módulo 11).
- El RUC/DNI se puede consultar por RUC vía `apis-peru-proxy`.

---

## 7. Usuarios y autenticación

**Propósito:** login e invitación de usuarios del negocio.

**Reglas:**
- El login exige `profiles.is_active = true`.
- Al invitar (signUp), un **trigger** crea el perfil automáticamente desde `user_metadata` (org + rol). Si no hay org, el perfil se crea inactivo.
- Solo `owner`/`admin` gestionan usuarios (RoleGuard en UI).
- El rol se valida en las políticas RLS y en las EFs.

---

## 8. SUNAT (configuración y documentos)

**Propósito:** configurar credenciales/certificado y gestionar el envío de comprobantes a SUNAT.

**Reglas:**
- Config en `sunat_config` (`modo_produccion = false` = **beta** actualmente).
- La `clave_sol` y la contraseña del certificado se guardan **encriptadas** (AES-256-GCM con `SUNAT_CREDENTIALS_KEY`).
- Certificado: PEM (`private_key.pem` + `certificate.pem`) en Storage; no requiere contraseña.
- Documentos (`/admin/sunat-documents`): envío de facturas/notas, resúmenes diarios de boletas, comunicaciones de baja, guías de remisión, y cola de reenvío.

---

## 9. Guías de remisión (GRE)

**Propósito:** emitir y enviar guías de remisión electrónicas (traslados).

**Flujo:** crear guía (serie `T001`, motivo de traslado, remitente/destino/transportista/conductor/vehículo, ítems) → enviar a SUNAT (REST OAuth2, asíncrono) → consultar ticket.

**Reglas:**
- Estados: `draft`, `issued`, `processing`, `accepted`, `rejected`, `cancelled`.
- El envío siempre es **asíncrono** (ticket): `send-despatch` → `processing`; `check-despatch-ticket` resuelve (0=aceptada, 98=proceso, 99=rechazada).
- **Bloqueado actualmente:** las credenciales OAuth2 GRE (client_id/secret) son del sistema viejo y SUNAT las rechaza. Requiere regenerarlas en **SUNAT Menú SOL → OAuth2**.
- No descuenta stock (la guía no afecta inventario).

## 10. Reportes

**Propósito:** reportes contables y de ventas (por día/semana/mes, agrupados).

- Filtros por rango de fechas, sede, cliente, método de pago, tipo de documento.
- Exportación CSV/Excel.
- Métricas: ventas (gravadas/exoneradas/IGV), cobrado vs por cobrar, margen.

## 11. Configuración tributaria

**Propósito:** parametrizar la Ley de Amazonía.

- `tax_configurations`: `selva_law_enabled`, datos del vendedor (ubigeo/selva), `default_tax_affectation`, plantilla legal.
- Nota: `default_tax_affectation` se usa como default al crear productos; la determinación real la hace `tax-engine` según la operación (ver `02-fiscal.md`).

## 12. Sedes

**Propósito:** gestionar sucursales (tipo `warehouse` / `pos` / `online`).

- Cada sede tiene prefijo de serie de comprobante, zona selva, y stock propio (`branch_stock`).
- `online` = la sede de la tienda web. `warehouse` = almacén (no vende; recibe el fulfillment de pedidos).
- Al crear una sede se siembra `branch_stock` para productos existentes (trigger).

## 13. Impresora

**Propósito:** configurar la impresión del ticket térmico.

- ESC/POS (impresora física, vía Tauri/desktop) o PDF (browser).
- Config: ancho (58/80mm), auto-corte, gaveta, copias.
- El contenido del ticket incluye: cabecera (RUC, razón social, teléfono, email), comprobante, cliente, ítems, desglose, total, SON en letras, pago, Recibido/Vuelto, QR + hash, pie de página configurable (`sunat_config.ticket_footer`).

## 14. Sistema

**Propósito:** info de la app (versión), chequeo de actualizaciones y plataforma.

- Versión leída de `src-tauri/tauri.conf.json` (v2.1.7).
- El auto-update de Tauri está deprioritizado (no hay build desktop).

## 15. Productos (CRUD)

**Propósito:** catálogo de repuestos.

- Datos: nombre, SKU, código de barras, familia/grupo/categoría, unidad, precios (venta/costo), stock mín/máx, afectación tributaria, tags, imagen, proveedor.
- Escalas de precio por cantidad (`price_tiers`).
- Importación CSV con mapeo de columnas y validación.
- Compatibilidad con modelos de máquina (`product_machines`).
- Al crear/editar un producto se siembra `branch_stock` (trigger).

---

## Multi-tenant

- Aislamiento por `organization_id` en todas las tablas (RLS + validación en RPC).
- El frontend usa `VITE_ORG_ID` (org del `.env`). En la práctica el sistema opera como una sola organización.
- El proyecto Supabase es **compartido** con otra app ("servicios técnicos"): las tablas `katsumoto_usuarios`, `servicios`, `piezas`, `actualizaciones` pertenecen a esa app y no se usan aquí.
