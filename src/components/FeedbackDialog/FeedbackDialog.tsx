import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import {
  MAX_MESSAGE_LENGTH,
  submitFeedback,
  type FeedbackIssues,
} from '../../lib/feedback';

interface FeedbackDialogProps {
  onClose: () => void;
}

type Phase = 'editing' | 'sending' | 'sent';

/** Centered modal: a free-text note, an optional reply address, then a thank-you. */
export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const titleId = useId();
  const noteId = useId();
  const emailId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phase, setPhase] = useState<Phase>('editing');
  const [issues, setIssues] = useState<FeedbackIssues>({});
  const [failure, setFailure] = useState('');

  useEffect(() => {
    noteRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not([tabindex="-1"]), textarea',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    setPhase('sending');
    const result = await submitFeedback({ message, email, company });
    if (result.status === 'sent') {
      setPhase('sent');
      return;
    }
    setPhase('editing');
    if (result.status === 'invalid') {
      setIssues(result.issues);
    } else {
      setIssues({});
      setFailure(result.message);
    }
  }

  return (
    <div className="feedback-scrim" role="presentation" onClick={onClose}>
      <div
        className="feedback-dialog g fu"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {phase === 'sent' ? (
          <div className="feedback-thanks" role="status">
            <h2 id={titleId}>Thank you for reaching out</h2>
            <p>
              Your note is on its way to Ozlorien Labs.
              {email.trim() ? ' We read every message and will reply to the address you left.' : ' We read every message.'}
            </p>
            <button className="button button-primary" type="button" onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={handleSubmit} noValidate>
            <div className="feedback-head">
              <h2 id={titleId}>Say hello to Ozlorien Labs</h2>
              <p>Share feedback, report something odd, or ask for a tool you wish FileKit had.</p>
            </div>

            <label className="field-label" htmlFor={noteId}>
              Your note
              <textarea
                id={noteId}
                ref={noteRef}
                rows={6}
                maxLength={MAX_MESSAGE_LENGTH}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-invalid={issues.message ? true : undefined}
                aria-describedby={issues.message ? `${noteId}-error` : undefined}
              />
            </label>
            {issues.message ? (
              <p className="field-error" id={`${noteId}-error`}>{issues.message}</p>
            ) : null}

            <label className="field-label" htmlFor={emailId}>
              Email (optional — only if you'd like a reply)
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={issues.email ? true : undefined}
                aria-describedby={issues.email ? `${emailId}-error` : undefined}
              />
            </label>
            {issues.email ? (
              <p className="field-error" id={`${emailId}-error`}>{issues.email}</p>
            ) : null}

            <input
              className="feedback-honeypot"
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />

            {failure ? <p className="field-error" role="alert">{failure}</p> : null}

            <div className="feedback-actions">
              <button className="button button-secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={phase === 'sending'}>
                {phase === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
