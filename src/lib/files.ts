export interface FilePolicy {
  accept: string[];
  extensions: string[];
  maxBytes: number;
  maxFiles: number;
  minFiles?: number;
  maxTotalBytes?: number;
}

export class FileInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileInputError';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function safeBaseName(name: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, '');
  const normalized = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'file';
}

export function makeOutputName(
  inputName: string,
  suffix: string,
  extension: string,
): string {
  return `${safeBaseName(inputName)}-${suffix}.${extension.replace(/^\./, '')}`;
}

export function assertFilesAllowed(files: File[], policy: FilePolicy): void {
  const minFiles = policy.minFiles ?? 1;
  if (files.length < minFiles) {
    throw new FileInputError(
      minFiles === 1 ? 'Choose at least one file.' : `Choose at least ${minFiles} files.`,
    );
  }
  if (files.length > policy.maxFiles) {
    throw new FileInputError(`Choose no more than ${policy.maxFiles} files.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (policy.maxTotalBytes && totalBytes > policy.maxTotalBytes) {
    throw new FileInputError(
      `The selected files are larger than ${formatBytes(policy.maxTotalBytes)} in total.`,
    );
  }

  for (const file of files) {
    if (file.size > policy.maxBytes) {
      throw new FileInputError(
        `${file.name} is larger than ${formatBytes(policy.maxBytes)}.`,
      );
    }
    const extensionMatches = policy.extensions.includes(fileExtension(file.name));
    const typeMatches = Boolean(file.type) && policy.accept.includes(file.type);
    if (!extensionMatches && !typeMatches) {
      throw new FileInputError(`${file.name} is not a supported file.`);
    }
  }
}

export async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}
