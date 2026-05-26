import type { ProofWeaveConfig } from "./config.js";
import { requireApiKey } from "./config.js";

export interface ApiResponse<T> {
  data: T;
  status: number;
  receipt?: string;
}

export async function apiRequest<T>(
  config: ProofWeaveConfig,
  method: string,
  path: string,
  options: { body?: unknown; auth?: boolean; headers?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { ...options.headers };

  if (options.auth !== false) headers["X-API-Key"] = requireApiKey(config);
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) as T : ({} as T);
  const receipt = response.headers.get("X-Access-Receipt") ?? undefined;

  if (!response.ok) {
    const detail = typeof data === "object" && data && "error" in data
      ? String((data as { error: unknown }).error)
      : response.statusText;
    const error = new Error(`${method} ${path} failed (${response.status}): ${detail}`);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = data;
    throw error;
  }

  return { data, status: response.status, receipt };
}
