// Minimal request/response typing so the functions do not depend on
// @vercel/node at build time; the runtime objects satisfy these shapes.
export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
}

export interface ApiError {
  error: { code: string; message: string };
}

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

export function sendError(res: ApiResponse, status: number, code: string, message: string): void {
  const payload: ApiError = { error: { code, message } };
  sendJson(res, status, payload);
}

export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Maps an upstream provider HTTP status to a safe client-facing error. */
export function upstreamError(status: number): { status: number; code: string; message: string } {
  if (status === 401 || status === 403) {
    return { status: 401, code: 'invalid_key', message: 'The provider rejected this API key.' };
  }
  if (status === 404) {
    return { status: 400, code: 'unknown_model', message: 'The provider does not recognize this model ID.' };
  }
  if (status === 429) {
    return { status: 429, code: 'rate_limited', message: 'The provider rate-limited this key. Try again shortly.' };
  }
  if (status >= 400 && status < 500) {
    return { status: 400, code: 'provider_rejected', message: 'The provider rejected the request.' };
  }
  return { status: 502, code: 'provider_unavailable', message: 'The provider is temporarily unavailable.' };
}
