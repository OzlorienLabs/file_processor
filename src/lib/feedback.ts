/**
 * Client side of the footer feedback form. The browser only talks to this app's
 * own `/api/feedback` route, which validates again and relays the note by email.
 */

export const FEEDBACK_ENDPOINT = '/api/feedback';
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_EMAIL_LENGTH = 254;

/** Deliberately loose: catches typos, does not police addresses. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FeedbackDraft {
  readonly message: string;
  /** Optional — only supplied if the visitor wants a reply. */
  readonly email: string;
  /** Honeypot, hidden from people. */
  readonly company?: string;
}

export interface FeedbackIssues {
  message?: string;
  email?: string;
}

export type FeedbackResult =
  | { status: 'sent' }
  | { status: 'invalid'; issues: FeedbackIssues }
  | { status: 'failed'; message: string };

export function validateFeedback(draft: FeedbackDraft): FeedbackIssues {
  const issues: FeedbackIssues = {};
  const message = draft.message.trim();
  const email = draft.email.trim();

  if (!message) {
    issues.message = 'Add a note before sending.';
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    issues.message = `Keep it under ${MAX_MESSAGE_LENGTH.toLocaleString('en-US')} characters.`;
  }
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email))) {
    issues.email = 'That email address does not look right.';
  }
  return issues;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // A non-JSON error body is not worth surfacing.
  }
  return 'That did not send. Please try again in a moment.';
}

export async function submitFeedback(
  draft: FeedbackDraft,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<FeedbackResult> {
  const issues = validateFeedback(draft);
  if (Object.keys(issues).length > 0) return { status: 'invalid', issues };

  const email = draft.email.trim();
  try {
    const response = await fetcher(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: draft.message.trim(),
        ...(email ? { email } : {}),
        ...(draft.company ? { company: draft.company } : {}),
      }),
    });
    if (!response.ok) return { status: 'failed', message: await readErrorMessage(response) };
    return { status: 'sent' };
  } catch {
    return { status: 'failed', message: 'That did not send — check your connection and try again.' };
  }
}
