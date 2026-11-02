# Documentación — Katsumoto

Sistema de facturación electrónica, ERP, POS, inventario y tienda web para **SERVICIOS GENERALES UNITED E.I.R.L.** (RUC 20608183672) — Pichanaqui, Junín, Perú.

Esta carpeta agrupa la documentación vigente del sistema, organizada por tipo. Los documentos anteriores a la revisión de **2026-08-05/06** (auditorías y planes ya ejecutados) están marcados como **históricos** y viven bajo `docs/historicos/`.

## Estructura

| Área | Contenido |
|---|---|
| **`funcional/`** | Cómo **debe** funcionar el sistema: módulos, reglas de negocio, modelo fiscal, tienda. |
| **`tecnica/`** | Cómo funciona **por dentro**: arquitectura, base de datos, Edge Functions, flujos de código. |
| **`despliegue/`** | Todo lo necesario para **desplegar**: Cloudflare Pages, Supabase, migraciones, troubleshooting. |
| **`operativa/`** | Operación del día a día: secrets, SUNAT (beta/prod), respaldos. |
| `AGENTS.md` | Referencia técnica de desarrollo (punto de entrada del código). |
| `README.md` | Entrada del proyecto: arranque rápido y enlaces. |

## Índice

- **General**
  - [00 — Sesión 2026-08-05/06 (análisis exhaustivo y trabajos)](00-sesion-2026-08-05-06.md)
- **Funcional**
  - [01 — Módulos y reglas de negocio](funcional/01-modulos.md)
  - [02 — Modelo fiscal SUNAT](funcional/02-fiscal.md)
  - [03 — Tienda online](funcional/03-tienda.md)
  - [04 — Importación de productos](funcional/04-importacion-productos.md)
  - [05 — Reporte contable: revisión y pendientes](funcional/05-reporte-contable.md)
  - [06 — Utilidad por producto](funcional/06-utilidad-productos.md)
- **Técnica**
  - [01 — Arquitectura](tecnica/01-arquitectura.md)
  - [02 — Base de datos](tecnica/02-base-de-datos.md)
  - [03 — Edge Functions](tecnica/03-edge-functions.md)
  - [04 — Flujos de código](tecnica/04-flujos-codigo.md)
  - [05 — Inventario de código](tecnica/05-inventario-codigo.md)
- **Despliegue**
  - [01 — Cloudflare Pages](despliegue/01-cloudflare-pages.md)
  - [02 — Supabase (migraciones, EF, secrets)](despliegue/02-supabase.md)
  - [03 — Troubleshooting](despliegue/03-troubleshooting.md)
  - [04 — Otros targets (Docker, Vercel, nginx)](despliegue/04-otros-targets.md)
- **Operativa**
  - [01 — Secrets y respaldos](operativa/01-secrets.md)
  - [02 — Operaciones SUNAT](operativa/02-sunat.md)
  - [03 — Workflow de migraciones](operativa/03-migraciones.md)
  - [04 — Respaldos y continuidad](operativa/04-respaldos.md)

## Documentos históricos (auditorías y planes ejecutados)

> No son referencia vigente; se conservan para trazabilidad. El estado actual del sistema está en `AGENTS.md` y en esta carpeta.

- `historicos/01-signing-keys.md` — Claves de firma Tauri (el desktop app está deprioritizado).
- `historicos/02-release.md` — Flujo de releases Tauri.
- `historicos/03-deployment.md` — Guía de despliegue vieja (superada por `despliegue/`).
- `historicos/04-architecture.md` — Arquitectura v1 (superada por `tecnica/`).
- `historicos/05-white-screen-fix.md` — Fix de pantalla blanca Tauri.
- `historicos/06-sunat-compliance-plan.md` .. `historicos/13-*` — Plan, avance y auditorías de cumplimiento SUNAT.
- `historicos/14-especificacion-funcional-por-modulo.md` — Especificación funcional v1 (superada por `funcional/`).
- `historicos/15-*` .. `historicos/21-*` — Planes (frontend, e2e, lógica, QA, POS) y estado v3.
