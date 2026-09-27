import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitFeedback } from '../../lib/feedback';
import { FeedbackDialog } from './FeedbackDialog';

vi.mock('../../lib/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/feedback')>()),
  submitFeedback: vi.fn(),
}));

const submit = vi.mocked(submitFeedback);

beforeEach(() => submit.mockReset());

function setup() {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<FeedbackDialog onClose={onClose} />);
  return { onClose, user };
}

describe('FeedbackDialog', () => {
  it('opens as a labelled modal with the note focused', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /say hello to ozlorien labs/i })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/your note/i)).toHaveFocus();
    expect(screen.getByLabelText(/email \(optional/i)).toBeInTheDocument();
  });

  it('sends the note and optional email, then thanks the visitor', async () => {
    submit.mockResolvedValue({ status: 'sent' });
    const { user, onClose } = setup();
    await user.type(screen.getByLabelText(/your note/i), 'Please add HEIC support');
    await user.type(screen.getByLabelText(/email \(optional/i), 'me@x.io');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(submit).toHaveBeenCalledWith({ message: 'Please add HEIC support', email: 'me@x.io', company: '' });
    expect(await screen.findByRole('heading', { name: /thank you for reaching out/i })).toBeInTheDocument();
    expect(screen.getByText(/reply to the address you left/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('thanks without promising a reply when no email was left', async () => {
    submit.mockResolvedValue({ status: 'sent' });
    const { user } = setup();
    await user.type(screen.getByLabelText(/your note/i), 'Love it');
    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByText(/we read every message\.$/i)).toBeInTheDocument();
  });

  it('shows field issues and disables send while sending', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof submitFeedback>>) => void;
    submit.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    resolve({ status: 'invalid', issues: { message: 'Add a note before sending.', email: 'Bad email.' } });
    expect(await screen.findByText('Add a note before sending.')).toBeInTheDocument();
    expect(screen.getByText('Bad email.')).toBeInTheDocument();
    expect(screen.getByLabelText(/your note/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/email \(optional/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a delivery failure as an alert', async () => {
    submit.mockResolvedValue({ status: 'failed', message: 'Feedback is not configured.' });
    const { user } = setup();
    await user.type(screen.getByLabelText(/your note/i), 'hi');
    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Feedback is not configured.');
    expect(screen.getByRole('button', { name: /^send$/i })).toBeEnabled();
  });

  it('closes on Escape, Cancel and the scrim, but not on clicks inside', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps focus trapped inside the dialog', async () => {
    const { user } = setup();
    const note = screen.getByLabelText(/your note/i);
    const send = screen.getByRole('button', { name: /^send$/i });

    await user.tab({ shift: true });
    expect(send).toHaveFocus();
    await user.tab();
    expect(note).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/email \(optional/i)).toHaveFocus();
  });

  it('lets bots fill the hidden honeypot', async () => {
    submit.mockResolvedValue({ status: 'sent' });
    const { user } = setup();
    const honeypot = document.querySelector<HTMLInputElement>('input[name="company"]')!;
    await user.type(honeypot, 'Acme');
    await user.type(screen.getByLabelText(/your note/i), 'spam');
    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ company: 'Acme' }));
  });
});
