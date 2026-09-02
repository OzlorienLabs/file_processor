/** The message of a thrown Error, or `fallback` for anything else (strings, undefined, empty). */
export function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/** True for AbortController cancellations (DOMException is not an Error subclass in every realm). */
export function isAbortError(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && (reason as { name?: unknown }).name === 'AbortError';
}
