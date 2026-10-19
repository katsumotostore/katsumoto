# 01 — Despliegue en Cloudflare Pages

> Guía verificada para desplegar la app web. Método usado: subir la carpeta `dist/` a Cloudflare Pages.

## Requisitos previos

- Node.js 20 + pnpm.
- Archivo `.env` con las variables de entorno (se incrustan en el build):
  ```env
  VITE_SUPABASE_URL=https://kdsjojrrspzmufdumywd.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon-key-publica>
  VITE_ORG_ID=7e80b22f-b06a-4025-937a-5f9d62d78733
  ```
- Acceso a Cloudflare Pages (proyecto: p.ej. `katsumoto-fact` / dominio `katsumoto.shop`).

## Pasos

1. **Build**
   ```bash
   pnpm install          # usa pnpm-lock.yaml
   pnpm build            # ejecuta tsc --noEmit (gate) + vite build → dist/
   ```
   El build debe terminar con `✓ built`.

2. **Verifica el contenido de `dist/`**
   ```
   dist/
     index.html      # app completa (tienda en / + admin en /admin)
     _headers        # cabeceras de seguridad (CSP estricta)
     _redirects      # SPA fallback: /* → /index.html 200
     assets/         # bundles hasheados
   ```

3. **Sube `dist/` a Cloudflare Pages**
   - Dashboard de Cloudflare → **Workers & Pages** → tu proyecto → **Upload assets** (o deploy directo arrastrando `dist/`).
   - Se recomienda deploy directo desde un bucket/S3 o GitHub (opcional), pero el método manual es subir la carpeta.

4. **Verifica** en el dominio:
   - `https://<tu-dominio>/` → tienda pública.
   - `https://<tu-dominio>/admin` → login del admin.
   - Cabeceras de seguridad (devtools → Network → index.html → response headers): deben incluir `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`.

## Qué incluyen los archivos de Cloudflare

**`_redirects`** — enruta el SPA:
```
/*    /index.html   200
```

**`_headers`** — cabeceras de seguridad:
```
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
```

## Notas

- **`connect-src`** solo permite Supabase (REST + Realtime). Si añades otro backend, actualiza esta directiva en `public/_headers` y reconstruye.
- `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` permite la vista previa del PDF en un iframe de la misma app.
- El frontend se conecta directamente a Supabase (el `apikey` es la anon key pública; la autorización va por JWT de sesión).
- **Tauri (desktop)** está deprioritizado: el `src-tauri/` es un placeholder y no es parte del deploy actual.

## Rollback

- Cloudflare Pages mantiene versiones de deploy: en el dashboard, **Rollback to this deployment** para volver a una versión anterior.
