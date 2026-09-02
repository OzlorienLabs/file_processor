import type { AiProvider } from './ai-settings';
import { chunkText } from './text-extract';

export type SummaryDetail = 'brief' | 'balanced' | 'detailed' | 'plain';

/** Keep single requests comfortably inside provider context windows. */
export const SUMMARY_CHUNK_CHARS = 120_000;

export interface SummarizeOptions {
  provider: AiProvider;
  model: string;
  apiKey: string;
  detail: SummaryDetail;
  signal?: AbortSignal;
  onProgress?: (label: string) => void;
  fetchImpl?: typeof fetch;
}

async function requestSummary(
  text: string,
  options: SummarizeOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl('/api/ai/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-provider-key': options.apiKey,
    },
    body: JSON.stringify({
      provider: options.provider,
      model: options.model,
      text,
      detail: options.detail,
    }),
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
    throw new Error(message ?? 'The summary request failed. Try again.');
  }
  const summary = (payload as { summary?: string } | undefined)?.summary;
  if (!summary) throw new Error('The provider returned no summary text.');
  return summary;
}

export async function summarizeText(text: string, options: SummarizeOptions): Promise<string> {
  const chunks = chunkText(text, SUMMARY_CHUNK_CHARS);
  if (!chunks.length) throw new Error('There is no text to summarize in this document.');

  if (chunks.length === 1) {
    options.onProgress?.('Summarizing the document');
    return requestSummary(chunks[0], options);
  }

  const partials: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    if (options.signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
    options.onProgress?.(`Summarizing part ${index + 1} of ${chunks.length}`);
    partials.push(await requestSummary(chunk, { ...options, detail: 'balanced' }));
  }
  options.onProgress?.('Combining the partial summaries');
  return requestSummary(
    `These are sequential partial summaries of one document:\n\n${partials.join('\n\n---\n\n')}`,
    options,
  );
}
