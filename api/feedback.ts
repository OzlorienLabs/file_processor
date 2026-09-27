import { sendError, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

/**
 * Relays a note from the footer feedback modal to Ozlorien Labs through Resend.
 *
 * Same origin as the app, so the browser's `connect-src 'self'` is unchanged and
 * the Resend credential never reaches a client. Nothing is logged or stored.
 *
 *   RESEND_API_KEY  Resend API key (required; without it the endpoint answers 503)
 *   FEEDBACK_TO     destination (defaults to ozlorienlabs@gmail.com)
 *   FEEDBACK_FROM   verified sender (defaults to Resend's shared test sender)
 */

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_EMAIL_LENGTH = 254;
export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const DEFAULT_TO = 'ozlorienlabs@gmail.com';
export const DEFAULT_FROM = 'FileKit <onboarding@resend.dev>';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FeedbackBody {
  message: string;
  email: string;
}

export type FeedbackValidation =
  | { ok: true; body: FeedbackBody }
  | { ok: false; status: number; code: string; message: string }
  | { ok: 'bot' };

export function validateFeedbackBody(body: unknown): FeedbackValidation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, status: 400, code: 'invalid_request', message: 'Send a JSON body.' };
  }
  const { message, email, company } = body as Record<string, unknown>;

  // Honeypot: people never see this field, so a value means a bot.
  if (typeof company === 'string' && company.trim()) return { ok: 'bot' };

  const text = typeof message === 'string' ? message.trim() : '';
  const address = typeof email === 'string' ? email.trim() : '';

  if (!text) {
    return { ok: false, status: 400, code: 'invalid_request', message: 'Add a note before sending.' };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 413, code: 'too_long', message: 'That note is too long to send.' };
  }
  if (address && (address.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(address))) {
    return { ok: false, status: 400, code: 'invalid_email', message: 'That email address does not look right.' };
  }
  return { ok: true, body: { message: text, email: address } };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildResendPayload({ message, email }: FeedbackBody, from: string, to: string) {
  const replyTo = email || 'not supplied';
  return {
    from,
    to: [to],
    subject: email ? `FileKit feedback from ${email}` : 'FileKit feedback',
    ...(email ? { reply_to: email } : {}),
    text: [message, '', '---', `Reply to: ${replyTo}`, 'Sent from the FileKit footer.'].join('\n'),
    html: [
      `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      '<hr />',
      `<p><strong>Reply to:</strong> ${escapeHtml(replyTo)}</p>`,
      '<p>Sent from the FileKit footer.</p>',
    ].join(''),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendError(res, 405, 'method_not_allowed', 'Use POST.');
    return;
  }

  const result = validateFeedbackBody(req.body);
  if (result.ok === 'bot') {
    // Accept and drop, so a bot gets no signal about why it failed.
    sendJson(res, 202, { ok: true });
    return;
  }
  if (!result.ok) {
    sendError(res, result.status, result.code, result.message);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    sendError(res, 503, 'not_configured', 'Feedback is not configured on this deployment yet.');
    return;
  }

  const payload = buildResendPayload(
    result.body,
    process.env.FEEDBACK_FROM || DEFAULT_FROM,
    process.env.FEEDBACK_TO || DEFAULT_TO,
  );

  let upstream: Response;
  try {
    upstream = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    sendError(res, 502, 'mail_unreachable', 'The mail service is unreachable right now.');
    return;
  }

  if (!upstream.ok) {
    sendError(res, 502, 'mail_rejected', 'The mail service refused that message.');
    return;
  }
  sendJson(res, 202, { ok: true });
}
