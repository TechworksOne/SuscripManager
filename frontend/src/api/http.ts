// src/api/http.ts
// apiFetch centralizado con soporte de skipAuth (para /auth/login, etc.)
// - Agrega Authorization automáticamente (a menos que skipAuth=true)
// - Maneja errores con status
// - Controla casos cuando backend "no responde" (ERR_EMPTY_RESPONSE)

export type ApiFetchOptions = RequestInit & {
  skipAuth?: boolean; // <- NUEVO: permite no adjuntar Authorization
};

type ApiError = Error & {
  status?: number;
  body?: any;
};

function getBaseUrl() {
  const envUrl = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
  if (envUrl && typeof envUrl === "string") return envUrl.replace(/\/$/, "");
  return "http://localhost:4000";
}

function buildHeaders(initHeaders?: HeadersInit, skipAuth?: boolean) {
  const headers = new Headers(initHeaders || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  if (!skipAuth) {
    const token = localStorage.getItem("token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { skipAuth, ...init } = options; // <- sacamos skipAuth para que no vaya a fetch()
  const base = getBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = buildHeaders(init.headers, skipAuth);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    const err: ApiError = Object.assign(
      new Error("No se pudo conectar al servidor (backend caído o sin respuesta)"),
      { status: 0, body: null }
    );
    throw err;
  }

  if (!res.ok) {
    const body = await readJsonSafe(res);
    const msg = body?.message || `${res.status} ${res.statusText || "Error"}`;

    const err: ApiError = Object.assign(new Error(msg), {
      status: res.status,
      body,
    });

    throw err;
  }

  const body = await readJsonSafe(res);
  return (body as T) ?? (null as unknown as T);
}
