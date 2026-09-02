/**
 * Thin adapter over Chrome's built-in Prompt API (`LanguageModel`, Gemini Nano on device).
 * Everything here is feature-detected; nothing assumes the API exists.
 */
export type ChromeAiAvailability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface LanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

export interface LanguageModelApi {
  availability(): Promise<Exclude<ChromeAiAvailability, 'unsupported'>>;
  create(options?: {
    signal?: AbortSignal;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<LanguageModelSession>;
}

export function findLanguageModel(root: object = globalThis): LanguageModelApi | undefined {
  const candidate = (root as { LanguageModel?: unknown }).LanguageModel;
  if (typeof candidate !== 'object' && typeof candidate !== 'function') return undefined;
  if (candidate === null) return undefined;
  const api = candidate as Partial<LanguageModelApi>;
  return typeof api.create === 'function' && typeof api.availability === 'function' ? (api as LanguageModelApi) : undefined;
}

export async function checkChromeAi(api: LanguageModelApi | undefined = findLanguageModel()): Promise<ChromeAiAvailability> {
  if (!api) return 'unsupported';
  try {
    return await api.availability();
  } catch {
    return 'unavailable';
  }
}

export const chromeAiHints: Record<ChromeAiAvailability, string> = {
  unsupported:
    "This browser does not expose Chrome's built-in model. Use Chrome 138 or newer with the Prompt API enabled, or switch to a cloud provider below.",
  unavailable: "Chrome's built-in model cannot run on this device (it needs a recent Chrome, enough free storage, and a supported GPU or CPU).",
  downloadable: "Chrome's built-in model is ready to download (about 2 GB, one time). It downloads the first time you generate.",
  downloading: "Chrome's built-in model is downloading. You can start generating; the first result waits for it to finish.",
  available: "Chrome's built-in model is ready. Prompts never leave this device.",
};

export interface ChromePromptOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  api?: LanguageModelApi;
}

/** Runs one prompt on the on-device model, reporting download progress and always destroying the session. */
export async function promptChromeAi(prompt: string, options: ChromePromptOptions = {}): Promise<string> {
  const api = options.api ?? findLanguageModel();
  if (!api) throw new Error(chromeAiHints.unsupported);
  const session = await api.create({
    signal: options.signal,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        const { loaded, total } = event as ProgressEvent;
        const fraction = total ? loaded / total : loaded;
        options.onProgress?.(Math.min(100, Math.round(fraction * 100)));
      });
    },
  });
  try {
    return await session.prompt(prompt, { signal: options.signal });
  } finally {
    session.destroy();
  }
}
