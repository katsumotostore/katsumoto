import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APIS_PERU_BASE = "https://dniruc.apisperu.com/api/v1";

// --- Rate Limiting (in-memory, per IP+userId) ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per window
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

function checkRateLimit(ip: string, userId: string): { allowed: boolean; remaining: number; resetAt: number } {
  // Periodic cleanup: prune expired entries on every call
  cleanupRateLimitStore();

  const key = `${ip}-${userId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    const newEntry = { count: 1, windowStart: now };
    rateLimitStore.set(key, newEntry);
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS };
}
// --- End Rate Limiting ---

const ALLOWED_ORIGINS = [
  "http://localhost:8551",
  "http://localhost:8552",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401, req);
  const token = authHeader.replace("Bearer ", "");
  if (!token || token.length < 10) return json({ error: "Unauthorized" }, 401, req);
  const userId = await verifyToken(token);
  if (!userId) return json({ error: "Invalid or expired token" }, 401, req);

  // Rate limit check (after auth, before external API call)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, userId);
  if (!rateLimit.allowed) {
    return json(
      {
        error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos.",
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      },
      429,
      req,
    );
  }

  const apisToken = Deno.env.get("APIS_PERU_TOKEN");
  if (!apisToken) return json({ error: "APIS_PERU_TOKEN not configured" }, 500, req);

  let body: { type?: string; number?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const { type, number: docNumber } = body;
  if (!type || !docNumber) return json({ error: "Missing type or number" }, 400, req);

  if (type !== "ruc" && type !== "dni") {
    return json({ error: "Invalid type, must be ruc or dni" }, 400, req);
  }

  const cleanNumber = docNumber.replace(/\D/g, "");
  if (type === "ruc" && cleanNumber.length !== 11) {
    return json({ error: "RUC must be 11 digits" }, 400, req);
  }
  if (type === "dni" && cleanNumber.length !== 8) {
    return json({ error: "DNI must be 8 digits" }, 400, req);
  }

  try {
    const apiUrl = `${APIS_PERU_BASE}/${type}/${cleanNumber}?token=${apisToken}`;
    const apiRes = await fetch(apiUrl);

    if (!apiRes.ok) {
      return json({ error: `${type.toUpperCase()} no encontrado o servicio no disponible` }, 502, req);
    }

    const data = await apiRes.json();

    if (type === "ruc" && !data.ruc) {
      return json({ error: "RUC no encontrado en SUNAT" }, 404, req);
    }
    if (type === "dni" && !data.success) {
      return json({ error: "DNI no encontrado en RENIEC" }, 404, req);
    }

    return json(data, 200, req);
  } catch (err) {
    return json({ error: "Internal server error" }, 500, req);
  }
});
