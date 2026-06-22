const API_BASE = ((globalThis as typeof globalThis & { __VINNEXX_API_BASE__?: string }).__VINNEXX_API_BASE__ ?? "/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });
  const payload = (await response.json().catch(() => ({
    error: { message: `HTTP ${response.status}` }
  }))) as {
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  };
  if (!response.ok || payload.error) {
    throw new ApiError(
      payload.error?.message ?? "Request failed.",
      response.status,
      payload.error?.code,
      payload.error?.details
    );
  }
  return payload.data as T;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
