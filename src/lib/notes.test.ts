import { describe, expect, it } from 'vitest';

import {
  createNote,
  createNotesCollection,
  displayTitle,
  exportNotesZip,
  isBlankNote,
  MAX_NOTES,
  noteFilename,
  noteToHtml,
  searchNotes,
  type Note,
} from './notes';

const note = (overrides: Partial<Note>): Note => ({ ...createNote(), ...overrides });

describe('notes helpers', () => {
  it('derives a display title from the title, first body line, or a placeholder', () => {
    expect(displayTitle(note({ title: ' Groceries ' }))).toBe('Groceries');
    expect(displayTitle(note({ body: '\n\n# Meeting notes\nmore' }))).toBe('Meeting notes');
    expect(displayTitle(note({ body: '- ' + 'x'.repeat(80) }))).toHaveLength(60);
    expect(displayTitle(note({ body: '   \n  ' }))).toBe('Untitled note');
  });

  it('detects blank notes and builds safe filenames per mode', () => {
    expect(isBlankNote(note({}))).toBe(true);
    expect(isBlankNote(note({ body: 'x' }))).toBe(false);
    expect(noteFilename(note({ title: 'Plan: Q3/Q4?', mode: 'markdown' }))).toBe('Plan-Q3-Q4.md');
    expect(noteFilename(note({ mode: 'html' }))).toBe('Untitled-note.html');
    expect(noteFilename(note({ mode: 'plain' }), 'html')).toBe('Untitled-note.html');
  });

  it('filters notes by title or body, case-insensitively', () => {
    const notes = [note({ title: 'Alpha' }), note({ body: 'contains BETA inside' }), note({ title: 'Gamma' })];
    expect(searchNotes(notes, '')).toHaveLength(3);
    expect(searchNotes(notes, 'beta')).toHaveLength(1);
    expect(searchNotes(notes, 'ALPHA')).toHaveLength(1);
    expect(searchNotes(notes, 'zzz')).toHaveLength(0);
  });

  it('renders every mode to a standalone HTML page', async () => {
    expect(await noteToHtml(note({ mode: 'html', body: '<p>raw</p><script>x</script>' }))).toContain('<p>raw</p>');
    expect(await noteToHtml(note({ mode: 'markdown', body: '# Hi' }))).toContain('<h1>Hi</h1>');
    const plain = await noteToHtml(note({ mode: 'plain', title: 'T', body: 'a < b' }));
    expect(plain).toContain('<pre>a &lt; b</pre>');
    expect(plain).toContain('<title>T</title>');
  });

  it('caps the collection and persists under the versioned key', () => {
    const collection = createNotesCollection();
    expect(collection.key).toBe('filekit.notes.v1');
    for (let index = 0; index < MAX_NOTES + 5; index += 1) {
      collection.upsert({ ...createNote(), id: `n${index}`, updatedAt: index, title: `${index}` });
    }
    expect(collection.list()).toHaveLength(MAX_NOTES);
  });

  it('zips every note with unique filenames plus the JSON export', async () => {
    const notes = [
      note({ title: 'Same', body: 'one' }),
      note({ title: 'Same', body: 'two' }),
      note({ title: 'Same', body: 'three' }),
      note({ title: 'Page', mode: 'html', body: '<p>hi</p>' }),
    ];
    const blob = await exportNotesZip(notes, '{"items":[]}');
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['Page.html', 'Same-2.txt', 'Same-3.txt', 'Same.txt', 'notes.json']);
    expect(await zip.file('Same-3.txt')?.async('string')).toBe('three');
  });
});
