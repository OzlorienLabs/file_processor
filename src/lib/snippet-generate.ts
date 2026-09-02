import { z } from 'zod';

import { buildSnippetPrompt, type SnippetRequest } from '../../api/_lib/snippet-prompt';
import type { AiProvider } from './ai-settings';
import { promptChromeAi } from './chrome-ai';
import { createCollection, storedRecordSchema, type Collection } from './local-store';

export type { SnippetRequest } from '../../api/_lib/snippet-prompt';

export type GeneratorEngine = 'chrome' | AiProvider;

export interface GeneratedOutput {
  code: string;
  explanation: string;
  raw: string;
}

/** Pulls the first fenced block out of a model reply; anything around it becomes the explanation. */
export function parseGeneratedText(raw: string): GeneratedOutput {
  const match = /```[^\n]*\n([\s\S]*?)```/.exec(raw);
  if (!match) return { code: raw.trim(), explanation: '', raw };
  const code = match[1].replace(/\n$/, '');
  const before = raw.slice(0, match.index).trim();
  const after = raw.slice(match.index + match[0].length).trim();
  return { code, explanation: [before, after].filter(Boolean).join('\n'), raw };
}

export interface GenerateOptions {
  engine: GeneratorEngine;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  onProgress?: (label: string) => void;
  fetchImpl?: typeof fetch;
  chromePrompt?: typeof promptChromeAi;
}

async function requestFromProvider(request: SnippetRequest, options: GenerateOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-provider-key': options.apiKey },
    body: JSON.stringify({ provider: options.engine, model: options.model, ...request }),
    signal: options.signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | undefined)?.error?.message;
    throw new Error(message ?? 'The generation request failed. Try again.');
  }
  const text = (payload as { text?: string } | undefined)?.text;
  if (!text) throw new Error('The provider returned no text.');
  return text;
}

export async function generateSnippet(request: SnippetRequest, options: GenerateOptions): Promise<GeneratedOutput> {
  let raw: string;
  if (options.engine === 'chrome') {
    options.onProgress?.("Generating with Chrome's on-device model");
    const chromePrompt = options.chromePrompt ?? promptChromeAi;
    raw = await chromePrompt(buildSnippetPrompt(request), {
      signal: options.signal,
      onProgress: (percent) => options.onProgress?.(`Downloading the on-device model: ${percent}%`),
    });
  } else {
    options.onProgress?.(`Generating with ${options.model}`);
    raw = await requestFromProvider(request, options);
  }
  const parsed = parseGeneratedText(raw);
  if (!parsed.code) throw new Error('The model returned no code. Try rephrasing the description.');
  return parsed;
}

export const generatedSchema = storedRecordSchema.extend({
  description: z.string().max(20_000),
  language: z.string().min(1).max(40),
  context: z.string().max(20_000),
  explain: z.boolean(),
  engine: z.enum(['chrome', 'openai', 'anthropic', 'google']),
  model: z.string().max(120),
  code: z.string().max(200_000),
  explanation: z.string().max(20_000),
});
export type GeneratedSnippet = z.infer<typeof generatedSchema>;

export const GENERATED_KEY = 'filekit.generated.v1';
export const MAX_GENERATED = 200;

export function createGeneratedCollection(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): Collection<GeneratedSnippet> {
  return createCollection<GeneratedSnippet>({ key: GENERATED_KEY, schema: generatedSchema, max: MAX_GENERATED, storage });
}

export function searchGenerated(items: GeneratedSnippet[], query: string): GeneratedSnippet[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.description.toLowerCase().includes(needle) ||
      item.code.toLowerCase().includes(needle) ||
      item.language.toLowerCase().includes(needle),
  );
}

/** A short title for a generated snippet: the first line of the description. */
export function generatedTitle(description: string): string {
  const line = description.trim().split('\n')[0];
  return line.length > 80 ? `${line.slice(0, 79)}…` : line || 'Generated snippet';
}
