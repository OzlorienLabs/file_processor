import type { Root } from 'hast';

export interface LanguageOption {
  id: string;
  label: string;
  extension: string;
}

/** Curated subset of lowlight's `common` grammars, with labels and download extensions. */
export const languageOptions: LanguageOption[] = [
  { id: 'javascript', label: 'JavaScript', extension: 'js' },
  { id: 'typescript', label: 'TypeScript', extension: 'ts' },
  { id: 'python', label: 'Python', extension: 'py' },
  { id: 'java', label: 'Java', extension: 'java' },
  { id: 'csharp', label: 'C#', extension: 'cs' },
  { id: 'cpp', label: 'C++', extension: 'cpp' },
  { id: 'c', label: 'C', extension: 'c' },
  { id: 'go', label: 'Go', extension: 'go' },
  { id: 'rust', label: 'Rust', extension: 'rs' },
  { id: 'kotlin', label: 'Kotlin', extension: 'kt' },
  { id: 'swift', label: 'Swift', extension: 'swift' },
  { id: 'ruby', label: 'Ruby', extension: 'rb' },
  { id: 'php', label: 'PHP', extension: 'php' },
  { id: 'bash', label: 'Shell / Bash', extension: 'sh' },
  { id: 'powershell', label: 'PowerShell', extension: 'ps1' },
  { id: 'sql', label: 'SQL', extension: 'sql' },
  { id: 'xml', label: 'HTML / XML', extension: 'html' },
  { id: 'css', label: 'CSS', extension: 'css' },
  { id: 'scss', label: 'SCSS', extension: 'scss' },
  { id: 'json', label: 'JSON', extension: 'json' },
  { id: 'yaml', label: 'YAML', extension: 'yaml' },
  { id: 'markdown', label: 'Markdown', extension: 'md' },
  { id: 'graphql', label: 'GraphQL', extension: 'graphql' },
  { id: 'dockerfile', label: 'Dockerfile', extension: 'dockerfile' },
  { id: 'makefile', label: 'Makefile', extension: 'mk' },
  { id: 'ini', label: 'INI / TOML', extension: 'ini' },
  { id: 'diff', label: 'Diff', extension: 'diff' },
  { id: 'lua', label: 'Lua', extension: 'lua' },
  { id: 'perl', label: 'Perl', extension: 'pl' },
  { id: 'r', label: 'R', extension: 'r' },
  { id: 'objectivec', label: 'Objective-C', extension: 'm' },
  { id: 'plaintext', label: 'Plain text', extension: 'txt' },
];

export const AUTO_LANGUAGE = 'auto';
export const PLAIN_LANGUAGE = 'plaintext';

/** Beyond this size highlighting is skipped so huge pastes stay responsive. */
export const MAX_HIGHLIGHT_CHARS = 100_000;

export function languageLabel(id: string): string {
  return languageOptions.find((option) => option.id === id)?.label ?? id;
}

export function extensionFor(language: string): string {
  return languageOptions.find((option) => option.id === language)?.extension ?? 'txt';
}

export function plainTree(code: string): Root {
  return { type: 'root', children: [{ type: 'text', value: code }] };
}

export interface HighlightResult {
  tree: Root;
  language: string;
}

type Lowlight = ReturnType<typeof import('lowlight').createLowlight>;
let lowlightPromise: Promise<Lowlight> | undefined;

async function loadLowlight(): Promise<Lowlight> {
  lowlightPromise ??= import('lowlight').then(({ common, createLowlight }) => createLowlight(common));
  return lowlightPromise;
}

/**
 * Highlights code into a hast tree. Auto-detection falls back to plain text when the
 * grammar engine is not confident, which keeps random prose from being coloured oddly.
 */
export async function highlightCode(code: string, language: string = AUTO_LANGUAGE): Promise<HighlightResult> {
  if (!code || code.length > MAX_HIGHLIGHT_CHARS) {
    return { tree: plainTree(code), language: language === AUTO_LANGUAGE ? PLAIN_LANGUAGE : language };
  }
  const lowlight = await loadLowlight();
  if (language !== AUTO_LANGUAGE && language !== PLAIN_LANGUAGE && lowlight.registered(language)) {
    return { tree: lowlight.highlight(language, code), language };
  }
  if (language !== AUTO_LANGUAGE) {
    return { tree: plainTree(code), language };
  }
  const detected = lowlight.highlightAuto(code);
  const detectedLanguage = detected.data?.language;
  const relevance = detected.data?.relevance ?? 0;
  if (!detectedLanguage || relevance < 5) {
    return { tree: plainTree(code), language: PLAIN_LANGUAGE };
  }
  return { tree: detected, language: detectedLanguage };
}

export async function detectLanguage(code: string): Promise<string> {
  return (await highlightCode(code, AUTO_LANGUAGE)).language;
}
