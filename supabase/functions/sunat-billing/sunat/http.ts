const ALLOWED_ORIGINS = [
  "tauri://localhost",
  "https://tauri.localhost",
  "http://localhost:8551",
  "http://localhost:1420",
  "https://katsumoto.shop",
  "https://katsumoto-fact.pages.dev",
  "https://katsumoto.pages.dev",
];

let _currentOrigin = ALLOWED_ORIGINS[0];

function getAllowOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

export function setRequestOrigin(req: Request): void {
  _currentOrigin = getAllowOrigin(req.headers.get("origin") || "");
}

function buildCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": _currentOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info",
  };
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
};

export function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": getAllowOrigin(origin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info",
  };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...buildCorsHeaders() },
  });
}

export function error(message: string, status = 400, code?: string) {
  return json({
    success: false,
    error_code: code ?? "ERROR",
    error_message: message,
  }, status);
}
