import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ENCRYPTION_KEY = Deno.env.get("SUNAT_CREDENTIALS_KEY");
if (!ENCRYPTION_KEY) throw new Error("SUNAT_CREDENTIALS_KEY no configurado");

async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyBytes = new Uint8Array(32);
  const encoded = encoder.encode(ENCRYPTION_KEY);
  keyBytes.set(encoded.slice(0, 32));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), 12);
  const chunks: string[] = [];
  for (let i = 0; i < combined.length; i += 8192) {
    chunks.push(String.fromCharCode(...combined.slice(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

const ALLOWED_ORIGINS = [
  "http://localhost:8551",
  "http://localhost:5173",
  "https://kdsjojrrspzmufdumywd.supabase.co",
  "https://katsumoto.shop",
  "https://katsumoto-fact.pages.dev",
  "https://katsumoto.pages.dev",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Credentials": "true",
  };
}

function json(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}
function errorRes(message: string, status: number, req: Request) {
  return json({ error: message }, status, req);
}

async function verifyToken(token: string): Promise<string | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) return null;
    const supabase = createClient(url, anonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return user.id;
  } catch {
    return null;
  }
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      list: (path: string) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
    };
  };
};

async function verifyCertificateInStorage(supabase: StorageClient, certPath: string | null): Promise<boolean> {
  if (!certPath) return false;
  const lastSlash = certPath.lastIndexOf("/");
  const dir = certPath.substring(0, lastSlash);
  const fileName = certPath.substring(lastSlash + 1);
  const { data, error } = await supabase.storage.from("sunat-documents").list(dir);
  if (error || !data) return false;
  return data.some((f) => f.name === fileName);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return errorRes("Method not allowed", 405, req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorRes("Invalid JSON", 400, req);
  }

  const action = body.action as string;
  const VALID_ACTIONS = ["save", "get"];
  if (!action || !VALID_ACTIONS.includes(action)) {
    return errorRes("Invalid action. Use: save, get", 400, req);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return errorRes("Unauthorized: missing header", 401, req);
  const token = authHeader.replace("Bearer ", "");
  if (!token || token.length < 10) return errorRes("Unauthorized: empty token", 401, req);

  const userId = await verifyToken(token);
  if (!userId) return errorRes("Unauthorized: invalid or expired token", 401, req);

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", userId)
    .single();
  if (!profile) return errorRes("Profile not found", 403, req);

  const orgId = profile.organization_id;

  if (action === "get") {
    const { data, error } = await supabase
      .from("sunat_config")
      .select("*")
      .eq("organization_id", orgId)
      .single();
    if (error && error.code !== "PGRST116") return errorRes(error.message, 500, req);
    if (!data) return json(null, 200, req);

    const certExists = await verifyCertificateInStorage(supabase, data.certificado_path);
    const { clave_sol, certificado_password, gre_client_id, gre_client_secret, ...safeConfig } = data;
    return json({
      ...safeConfig,
      has_clave_sol: !!clave_sol,
      has_certificado_password: !!certificado_password,
      has_gre_credentials: !!gre_client_id && !!gre_client_secret,
      certificado_exists_in_storage: certExists,
    }, 200, req);
  }

  if (action === "save") {
    if (profile.role !== "owner" && profile.role !== "admin") {
      return errorRes("Solo administradores pueden modificar la configuración SUNAT", 403, req);
    }

    const formData = body.formData as Record<string, unknown>;
    if (!formData) return errorRes("formData is required", 400, req);

    const requiredFields = ["ruc", "razon_social", "usuario_sol"];
    const missing = requiredFields.filter((f) => !formData[f]);
    if (missing.length > 0) {
      return errorRes(`Campos requeridos faltantes: ${missing.join(", ")}`, 400, req);
    }

    if (!/^\d{11}$/.test(String(formData.ruc || ""))) {
      return errorRes("RUC debe tener 11 dígitos", 400, req);
    }

    const { data: existing } = await supabase
      .from("sunat_config")
      .select("id, clave_sol, certificado_password, certificado_path")
      .eq("organization_id", orgId)
      .maybeSingle();

    const certPath = (formData.certificado_path as string) || null;

    if (certPath) {
      const certExists = await verifyCertificateInStorage(supabase, certPath);
      if (!certExists) {
        return errorRes("El archivo de certificado no se encuentra en Storage. Suba el certificado nuevamente.", 400, req);
      }
    }

    const rowData: Record<string, unknown> = {
      ruc: formData.ruc,
      razon_social: formData.razon_social,
      nombre_comercial: formData.nombre_comercial || "",
      ubigeo: formData.ubigeo || "",
      departamento: formData.departamento || "",
      provincia: formData.provincia || "",
      distrito: formData.distrito || "",
      direccion: formData.direccion || "",
      usuario_sol: formData.usuario_sol,
      modo_produccion: formData.modo_produccion || false,
      certificado_path: certPath,
      ticket_footer: formData.ticket_footer || null,
    };

    const claveSol = (formData.clave_sol as string) || "";
    if (claveSol.trim() !== "") {
      rowData.clave_sol = await encrypt(claveSol);
    } else if (existing?.clave_sol) {
      rowData.clave_sol = existing.clave_sol;
    } else {
      rowData.clave_sol = "";
    }

    const certPassword = (formData.certificado_password as string) || "";
    if (certPassword.trim() !== "") {
      rowData.certificado_password = await encrypt(certPassword);
    } else if (existing?.certificado_password) {
      rowData.certificado_password = existing.certificado_password;
    } else {
      rowData.certificado_password = null;
    }

    const effectiveCertPath = certPath || (existing?.certificado_path as string | null);
    rowData.is_configured = !!(
      formData.ruc &&
      formData.razon_social &&
      formData.usuario_sol &&
      rowData.clave_sol &&
      effectiveCertPath
    );

    if (existing) {
      const { data, error } = await supabase
        .from("sunat_config")
        .update(rowData)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return errorRes(error.message, 500, req);
      const { clave_sol, certificado_password, ...safeData } = data;
      return json({
        ...safeData,
        has_clave_sol: !!clave_sol,
        has_certificado_password: !!certificado_password,
      }, 200, req);
    }

    rowData.organization_id = orgId;
    const { data, error } = await supabase
      .from("sunat_config")
      .insert(rowData)
      .select()
      .single();
    if (error) return errorRes(error.message, 500, req);
    const { clave_sol, certificado_password, ...safeData } = data;
    return json({
      ...safeData,
      has_clave_sol: !!clave_sol,
      has_certificado_password: !!certificado_password,
    }, 200, req);
  }

  return errorRes("Unhandled action", 500, req);
});
