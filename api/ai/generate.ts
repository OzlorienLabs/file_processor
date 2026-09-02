import {
  headerValue,
  sendError,
  sendJson,
  upstreamError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';
import { buildTextRequest, isValidModel, parseTextResponse, PROVIDERS, type Provider } from '../_lib/providers';
import { buildSnippetPrompt, validateSnippetRequest, type SnippetRequest } from '../_lib/snippet-prompt';

export const UPSTREAM_TIMEOUT_MS = 55_000;

export interface GenerateBody extends SnippetRequest {
  provider: Provider;
  model: string;
}

export function validateGenerateBody(body: unknown): GenerateBody | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { provider, model } = body as Record<string, unknown>;
  if (!PROVIDERS.includes(provider as Provider)) return undefined;
  if (!isValidModel(model)) return undefined;
  const request = validateSnippetRequest(body);
  if (!request) return undefined;
  return { ...request, provider: provider as Provider, model };
}

/**
 * Generates a code snippet through the user's chosen provider. Stateless: the key travels in a
 * header, nothing is logged, and the response is marked no-store.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendError(res, 405, 'method_not_allowed', 'Use POST.');
    return;
  }

  const body = validateGenerateBody(req.body);
  if (!body) {
    sendError(res, 400, 'invalid_request', 'Provide provider, model, language, and a non-empty description.');
    return;
  }

  const apiKey = headerValue(req.headers, 'x-provider-key').trim();
  if (!apiKey || apiKey.length > 400) {
    sendError(res, 401, 'missing_key', 'Provide your provider API key in the x-provider-key header.');
    return;
  }

  const { url, init } = buildTextRequest(body.provider, body.model, buildSnippetPrompt(body), apiKey);

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

  let text: string;
  try {
    text = parseTextResponse(body.provider, await upstream.json());
  } catch {
    text = '';
  }
  if (!text) {
    sendError(res, 502, 'empty_response', 'The provider returned no text.');
    return;
  }
  sendJson(res, 200, { text });
}
