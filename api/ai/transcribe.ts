import {
  headerValue,
  sendError,
  sendJson,
  upstreamError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http';

export const UPSTREAM_TIMEOUT_MS = 55_000;
/** Decoded audio chunks stay below the Vercel request payload boundary. */
export const MAX_AUDIO_BYTES = Math.floor(3.75 * 1024 * 1024);

const TRANSCRIBE_MODELS = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'];
const LANGUAGE_PATTERN = /^[a-z]{2}(-[A-Za-z]{2})?$/;

interface TranscribeBody {
  model: string;
  language?: string;
  audio: string;
}

export function validateTranscribeBody(body: unknown): TranscribeBody | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { model, language, audio } = body as Record<string, unknown>;
  if (typeof model !== 'string' || !TRANSCRIBE_MODELS.includes(model)) return undefined;
  if (language !== undefined && (typeof language !== 'string' || !LANGUAGE_PATTERN.test(language))) {
    return undefined;
  }
  if (typeof audio !== 'string' || !audio || audio.length > Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4) {
    return undefined;
  }
  return { model, language, audio };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendError(res, 405, 'method_not_allowed', 'Use POST.');
    return;
  }

  const body = validateTranscribeBody(req.body);
  if (!body) {
    sendError(res, 400, 'invalid_request', 'Provide a supported model and one base64 WAV chunk.');
    return;
  }

  const apiKey = headerValue(req.headers, 'x-provider-key').trim();
  if (!apiKey || apiKey.length > 400) {
    sendError(res, 401, 'missing_key', 'Provide your OpenAI API key in the x-provider-key header.');
    return;
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(body.audio, 'base64');
  } catch {
    bytes = Buffer.alloc(0);
  }
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) {
    sendError(res, 400, 'invalid_audio', 'The audio chunk is empty or too large.');
    return;
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'chunk.wav');
  form.append('model', body.model);
  form.append('response_format', 'json');
  if (body.language) form.append('language', body.language);

  let upstream: Response;
  try {
    upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
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
    const payload = (await upstream.json()) as { text?: string };
    text = typeof payload.text === 'string' ? payload.text : '';
  } catch {
    text = '';
  }
  if (!text.trim()) {
    sendError(res, 502, 'empty_response', 'The provider returned no transcription text.');
    return;
  }
  sendJson(res, 200, { text: text.trim() });
}
