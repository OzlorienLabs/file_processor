import { z } from 'zod';

import { safeBaseName } from './files';
import { createCollection, stampNew, storedRecordSchema, type Collection } from './local-store';
import { markdownToHtml, sanitizeHtmlDocument, wrapHtmlDocument } from './markdown';

export const noteModes = ['plain', 'markdown', 'html'] as const;
export type NoteMode = (typeof noteModes)[number];

export const noteSchema = storedRecordSchema.extend({
  title: z.string().max(200),
  body: z.string().max(2_000_000),
  mode: z.enum(noteModes),
});
export type Note = z.infer<typeof noteSchema>;

export const NOTES_KEY = 'filekit.notes.v1';
export const MAX_NOTES = 500;

export function createNotesCollection(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): Collection<Note> {
  return createCollection<Note>({ key: NOTES_KEY, schema: noteSchema, max: MAX_NOTES, storage });
}

export function createNote(mode: NoteMode = 'plain'): Note {
  return { ...stampNew(), title: '', body: '', mode };
}

export function isBlankNote(note: Pick<Note, 'title' | 'body'>): boolean {
  return !note.title.trim() && !note.body.trim();
}

/** The list label: the title, else the first non-empty line, else a placeholder. */
export function displayTitle(note: Pick<Note, 'title' | 'body'>): string {
  const title = note.title.trim();
  if (title) return title;
  const firstLine = note.body
    .split('\n')
    .map((line) => line.replace(/^[#>\-*\s]+/, '').trim())
    .find(Boolean);
  if (!firstLine) return 'Untitled note';
  return firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
}

export const noteExtensions: Record<NoteMode, string> = { plain: 'txt', markdown: 'md', html: 'html' };

export function noteFilename(note: Note, extension = noteExtensions[note.mode]): string {
  return `${safeBaseName(displayTitle(note))}.${extension}`;
}

/** Renders a note as a standalone HTML page regardless of its mode. */
export async function noteToHtml(note: Note): Promise<string> {
  const title = displayTitle(note);
  if (note.mode === 'html') return sanitizeHtmlDocument(note.body);
  if (note.mode === 'markdown') return wrapHtmlDocument(await markdownToHtml(note.body), title);
  const escaped = note.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return wrapHtmlDocument(`<pre>${escaped}</pre>`, title);
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter(
    (note) => note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle),
  );
}

/** One file per note in its native format plus the JSON export for re-import. */
export async function exportNotesZip(notes: Note[], exportJson: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  for (const note of notes) {
    let name = noteFilename(note);
    let counter = 2;
    while (used.has(name)) {
      name = noteFilename(note).replace(/(\.[^.]+)$/, `-${counter}$1`);
      counter += 1;
    }
    used.add(name);
    zip.file(name, note.body);
  }
  zip.file('notes.json', exportJson);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
