import {
  headerValue,
  sendError,
  sendJson,
  upstreamError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';
import {
  buildSummarizeRequest,
  buildSummaryPrompt,
  isValidModel,
  MAX_TEXT_CHARS,
  parseSummaryResponse,
  PROVIDERS,
  type Detail,
  type Provider,
} from '../_lib/providers';

export const UPSTREAM_TIMEOUT_MS = 55_000;

interface SummarizeBody {
  provider: Provider;
  model: string;
  text: string;
  detail: Detail;
}

export function validateSummarizeBody(body: unknown): SummarizeBody | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { provider, model, text, detail } = body as Record<string, unknown>;
  if (!PROVIDERS.includes(provider as Provider)) return undefined;
  if (!isValidModel(model)) return undefined;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS) return undefined;
  if (detail !== 'brief' && detail !== 'balanced' && detail !== 'detailed') return undefined;
  return { provider: provider as Provider, model, text, detail };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendError(res, 405, 'method_not_allowed', 'Use POST.');
    return;
  }

  const body = validateSummarizeBody(req.body);
  if (!body) {
    sendError(res, 400, 'invalid_request', 'Provide provider, model, detail, and non-empty text.');
    return;
  }

  const apiKey = headerValue(req.headers, 'x-provider-key').trim();
  if (!apiKey || apiKey.length > 400) {
    sendError(res, 401, 'missing_key', 'Provide your provider API key in the x-provider-key header.');
    return;
  }

  const prompt = buildSummaryPrompt(body.text, body.detail);
  const { url, init } = buildSummarizeRequest(body.provider, body.model, prompt, apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    sendError(res, 504, 'provider_timeout', 'The provider did not answer in time. Try again.');
    return;
  }

  if (!upstream.ok) {
    const mapped = upstreamError(upstream.status);
    sendError(res, mapped.status, mapped.code, mapped.message);
    return;
  }

  let summary: string;
  try {
    summary = parseSummaryResponse(body.provider, await upstream.json());
  } catch {
    summary = '';
  }
  if (!summary) {
    sendError(res, 502, 'empty_response', 'The provider returned no summary text.');
    return;
  }
  sendJson(res, 200, { summary });
}
