/** Calls to the backend through the Vite proxy (/api/<service>/...), so phones only talk to one HTTPS origin. */
export type Service = "auth" | "issuer" | "trust" | "audit";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(service: Service, path: string, opts: { method?: string; token?: string; json?: unknown; form?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = new URLSearchParams(opts.form);
  }
  let res: Response;
  try {
    res = await fetch(`/api/${service}${path}`, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, "No connection to the server. Check the network and try again.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, (data && (data.detail?.toString?.() || data.detail)) || res.statusText);
  return data as T;
}

export interface Session { token: string; username: string; role: string; pointId: string | null; expiresAt: number }

export async function login(username: string, password: string): Promise<Session> {
  const r = await api("auth", "/token", { form: { username, password } });
  return { token: r.access_token, username, role: r.role, pointId: r.point_id, expiresAt: Date.now() + r.expires_in * 1000 };
}
