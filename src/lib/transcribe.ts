import { decodeAudioFile, encodeWavPcm16, planChunks, type AudioDecoder, type DecodedAudio } from './audio';

export const WHISPER_SAMPLE_RATE = 16_000;
/** Keeps each base64-encoded WAV chunk safely inside the function payload limit. */
export const API_CHUNK_SECONDS = 90;

export const localWhisperModels = [
  { id: 'onnx-community/whisper-tiny', label: 'Faster (tiny model, ~40 MB)' },
  { id: 'onnx-community/whisper-base', label: 'More accurate (base model, ~80 MB)' },
] as const;

export const apiTranscribeModels = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'] as const;

export const transcribeLanguages = [
  { code: '', whisper: '', label: 'Detect automatically' },
  { code: 'en', whisper: 'english', label: 'English' },
  { code: 'es', whisper: 'spanish', label: 'Spanish' },
  { code: 'fr', whisper: 'french', label: 'French' },
  { code: 'de', whisper: 'german', label: 'German' },
  { code: 'it', whisper: 'italian', label: 'Italian' },
  { code: 'pt', whisper: 'portuguese', label: 'Portuguese' },
  { code: 'nl', whisper: 'dutch', label: 'Dutch' },
  { code: 'pl', whisper: 'polish', label: 'Polish' },
  { code: 'tr', whisper: 'turkish', label: 'Turkish' },
  { code: 'ru', whisper: 'russian', label: 'Russian' },
  { code: 'ar', whisper: 'arabic', label: 'Arabic' },
  { code: 'hi', whisper: 'hindi', label: 'Hindi' },
  { code: 'ja', whisper: 'japanese', label: 'Japanese' },
  { code: 'ko', whisper: 'korean', label: 'Korean' },
  { code: 'zh', whisper: 'chinese', label: 'Chinese' },
] as const;

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
}

export function resampleTo16kMono(decoded: DecodedAudio): Float32Array {
  const { sampleRate, length, channelData } = decoded;
  const channels = channelData.length;
  const targetLength = Math.max(1, Math.round((length * WHISPER_SAMPLE_RATE) / sampleRate));
  const output = new Float32Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const position = (index * sampleRate) / WHISPER_SAMPLE_RATE;
    const before = Math.min(length - 1, Math.floor(position));
    const after = Math.min(length - 1, before + 1);
    const mix = position - before;
    let sample = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = channelData[channel];
      sample += data[before] * (1 - mix) + data[after] * mix;
    }
    output[index] = sample / channels;
  }
  return output;
}

export function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const wholeSeconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)},${pad(millis, 3)}`;
}

export function toSrt(segments: TranscriptionSegment[]): string {
  return segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${segment.text.trim()}`,
    )
    .join('\n\n');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

export type WhisperEngine = (audio: Float32Array, whisperLanguage?: string) => Promise<TranscriptionResult>;

export type DownloadProgress = (info: { status: string; progress?: number }) => void;

interface WhisperChunk {
  timestamp: [number, number | null];
  text: string;
}

export async function createWhisperEngine(
  model: string,
  onDownload?: DownloadProgress,
): Promise<WhisperEngine> {
  const { pipeline } = await import('@huggingface/transformers');
  const transcriber = await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback: onDownload,
  });
  return async (audio, whisperLanguage) => {
    const output = (await transcriber(audio, {
      language: whisperLanguage || undefined,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })) as { text: string; chunks?: WhisperChunk[] } | Array<{ text: string; chunks?: WhisperChunk[] }>;
    const single = Array.isArray(output) ? output[0] : output;
    const segments = (single.chunks ?? []).map((chunk) => ({
      start: chunk.timestamp[0] ?? 0,
      end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0,
      text: chunk.text.trim(),
    }));
    return { text: single.text.trim(), segments };
  };
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

export interface LocalTranscribeOptions {
  model: string;
  languageCode: string;
  engineFactory?: typeof createWhisperEngine;
  decode?: AudioDecoder;
}

export async function transcribeLocally(
  file: Blob,
  options: LocalTranscribeOptions,
  signal?: AbortSignal,
  onProgress?: (label: string) => void,
): Promise<TranscriptionResult> {
  assertNotAborted(signal);
  onProgress?.('Decoding the audio on this device');
  const decoded = await decodeAudioFile(file, options.decode);
  assertNotAborted(signal);

  const factory = options.engineFactory ?? createWhisperEngine;
  onProgress?.('Preparing the speech model (downloads on first use)');
  const engine = await factory(options.model, (info) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      onProgress?.(`Downloading the speech model — ${Math.round(info.progress)}%`);
    }
  });
  assertNotAborted(signal);

  onProgress?.('Transcribing on this device');
  const language = transcribeLanguages.find((entry) => entry.code === options.languageCode)?.whisper;
  return engine(resampleTo16kMono(decoded), language);
}

export interface ApiTranscribeOptions {
  model: string;
  languageCode: string;
  apiKey: string;
  decode?: AudioDecoder;
  fetchImpl?: typeof fetch;
}

export async function transcribeViaApi(
  file: Blob,
  options: ApiTranscribeOptions,
  signal?: AbortSignal,
  onProgress?: (label: string) => void,
): Promise<TranscriptionResult> {
  assertNotAborted(signal);
  onProgress?.('Decoding the audio on this device');
  const decoded = await decodeAudioFile(file, options.decode);
  const mono = resampleTo16kMono(decoded);
  const monoDecoded: DecodedAudio = {
    sampleRate: WHISPER_SAMPLE_RATE,
    length: mono.length,
    channelData: [mono],
  };
  const ranges = planChunks(mono.length, WHISPER_SAMPLE_RATE, API_CHUNK_SECONDS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const parts: string[] = [];

  for (const [index, range] of ranges.entries()) {
    assertNotAborted(signal);
    onProgress?.(
      ranges.length > 1 ? `Transcribing part ${index + 1} of ${ranges.length}` : 'Transcribing the recording',
    );
    const wav = encodeWavPcm16(monoDecoded, range);
    const audio = bytesToBase64(new Uint8Array(await wav.arrayBuffer()));
    const response = await fetchImpl('/api/ai/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider-key': options.apiKey,
      },
      body: JSON.stringify({
        model: options.model,
        language: options.languageCode || undefined,
        audio,
      }),
      signal,
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const message = (payload as { error?: { message?: string } } | undefined)?.error?.message;
      throw new Error(message ?? 'The transcription request failed. Try again.');
    }
    parts.push(((payload as { text?: string } | undefined)?.text ?? '').trim());
  }

  return { text: parts.filter(Boolean).join(' ').trim(), segments: [] };
}
