import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmojiCatalog } from '../lib/emoji';
import EmojiPage from './EmojiPage';

const catalog: EmojiCatalog = {
  version: '17.0',
  count: 3,
  groups: [
    { name: 'Smileys & Emotion', emojis: [{ e: '😀', n: 'grinning face' }, { e: '😢', n: 'crying face' }] },
    { name: 'Flags', emojis: [{ e: '🇮🇳', n: 'flag: India' }] },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe('EmojiPage', () => {
  it('loads the catalog lazily and shows every emoji with a count', async () => {
    render(<EmojiPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

    expect(await screen.findByRole('button', { name: /copy grinning face/i })).toBeInTheDocument();
    expect(screen.getByText('3 emoji shown.')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/emoji/catalog.json');
  });

  it('filters by search and category', async () => {
    const user = userEvent.setup();
    render(<EmojiPage />);
    await screen.findByRole('button', { name: /copy grinning face/i });

    await user.type(screen.getByLabelText(/search by name/i), 'crying');
    expect(screen.queryByRole('button', { name: /copy grinning face/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy crying face/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/search by name/i));
    await user.selectOptions(screen.getByLabelText(/category/i), 'Flags');
    expect(screen.getByText('1 emoji shown.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy flag: india/i })).toBeInTheDocument();
  });

  it('copies an emoji on click and announces it', async () => {
    const user = userEvent.setup();
    render(<EmojiPage />);

    await user.click(await screen.findByRole('button', { name: /copy grinning face/i }));

    expect(await navigator.clipboard.readText()).toBe('😀');
    expect(screen.getByText(/copied 😀/i)).toBeInTheDocument();
  });

  it('shows an error state when the catalog cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
    render(<EmojiPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });
});
