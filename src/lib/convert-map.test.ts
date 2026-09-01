import { describe, expect, it, vi } from 'vitest';

import { conversionsFor, detectInputKind } from './convert-map';

vi.mock('./raster', () => ({
  convertImage: vi.fn(async () => new Blob(['img'], { type: 'image/png' })),
}));
vi.mock('./pdf', () => ({
  mergeToPdf: vi.fn(async () => new Uint8Array([1])),
}));
vi.mock('./docx-convert', () => ({
  convertDocxToPdf: vi.fn(async () => new Uint8Array([2])),
  extractDocxText: vi.fn(async () => 'docx words'),
}));
vi.mock('./audio', () => ({
  decodeAudioFile: vi.fn(async () => ({ sampleRate: 8000, length: 1, channelData: [new Float32Array([0])] })),
  encodeWavPcm16: vi.fn(() => new Blob(['wav'], { type: 'audio/wav' })),
}));
vi.mock('./pdf-raster', () => ({
  openPdfRasterDocument: vi.fn(async () => ({
    pageCount: 2,
    renderPage: vi.fn(async () => ({ blob: new Blob(['jpg']), width: 100, height: 100 })),
    extractPageText: vi.fn(async (page: number) => `page ${page} text`),
    close: vi.fn(async () => {}),
  })),
}));

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('detectInputKind', () => {
  it.each([
    ['report.pdf', 'application/pdf', 'pdf'],
    ['report.docx', docxType, 'docx'],
    ['photo.JPG', '', 'image'],
    ['notes.md', '', 'text'],
    ['song.mp3', 'audio/mpeg', 'audio'],
  ])('classifies %s', (name, type, expected) => {
    expect(detectInputKind(new File(['x'], name, { type }))).toBe(expected);
  });

  it('returns undefined for unsupported files', () => {
    expect(detectInputKind(new File(['x'], 'app.exe', { type: 'application/octet-stream' }))).toBeUndefined();
  });
});

describe('conversionsFor', () => {
  it('never offers converting an image to its own format', () => {
    const ids = conversionsFor(new File(['x'], 'photo.jpeg', { type: 'image/jpeg' })).map((option) => option.id);
    expect(ids).toEqual(['image-png', 'image-webp', 'image-pdf']);
  });

  it('offers nothing for unsupported files', () => {
    expect(conversionsFor(new File(['x'], 'data.bin', { type: '' }))).toEqual([]);
  });

  it('converts an image to another format with a renamed output', async () => {
    const option = conversionsFor(new File(['x'], 'photo.png', { type: 'image/png' })).find(
      (candidate) => candidate.id === 'image-webp',
    )!;
    const result = await option.run(new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(result.filename).toBe('photo.webp');
  });

  it('wraps an image into a single-page PDF', async () => {
    const { mergeToPdf } = await import('./pdf');
    const option = conversionsFor(new File(['x'], 'scan.webp', { type: 'image/webp' })).find(
      (candidate) => candidate.id === 'image-pdf',
    )!;
    const result = await option.run(new File(['x'], 'scan.webp', { type: 'image/webp' }));
    expect(result.filename).toBe('scan.pdf');
    expect(result.blob.type).toBe('application/pdf');
    expect(vi.mocked(mergeToPdf).mock.calls[0][0][0].name).toBe('scan.png');
  });

  it('renders PDF pages into a ZIP of images with progress', async () => {
    const option = conversionsFor(new File(['x'], 'deck.pdf', { type: 'application/pdf' })).find(
      (candidate) => candidate.id === 'pdf-images',
    )!;
    const progress = vi.fn();
    const result = await option.run(new File(['x'], 'deck.pdf', { type: 'application/pdf' }), undefined, progress);

    expect(result.filename).toBe('deck-pages.zip');
    expect(progress).toHaveBeenCalledWith(2, 2);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['deck-page-1.jpg', 'deck-page-2.jpg']);
  });

  it('extracts PDF text into a plain text file', async () => {
    const option = conversionsFor(new File(['x'], 'deck.pdf', { type: 'application/pdf' })).find(
      (candidate) => candidate.id === 'pdf-txt',
    )!;
    const result = await option.run(new File(['x'], 'deck.pdf', { type: 'application/pdf' }));
    expect(result.filename).toBe('deck.txt');
    expect(await result.blob.text()).toBe('page 1 text\n\npage 2 text');
  });

  it('converts DOCX to PDF and to text', async () => {
    const file = new File(['x'], 'notes.docx', { type: docxType });
    const [pdfOption, textOption] = conversionsFor(file);
    expect((await pdfOption.run(file)).filename).toBe('notes.pdf');
    const textResult = await textOption.run(file);
    expect(textResult.filename).toBe('notes.txt');
    expect(await textResult.blob.text()).toBe('docx words');
  });

  it('typesets plain text into a PDF', async () => {
    const file = new File(['Hello convert world'], 'readme.md', { type: 'text/markdown' });
    const [option] = conversionsFor(file);
    const result = await option.run(file);
    expect(result.filename).toBe('readme.pdf');
    expect(new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()))).toContain(
      'Hello convert world',
    );
  });

  it('re-encodes audio as WAV', async () => {
    const file = new File(['x'], 'memo.mp3', { type: 'audio/mpeg' });
    const [option] = conversionsFor(file);
    const result = await option.run(file);
    expect(result.filename).toBe('memo.wav');
    expect(result.blob.type).toBe('audio/wav');
  });

  it('propagates cancellation before decoding starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(['x'], 'memo.mp3', { type: 'audio/mpeg' });
    const [option] = conversionsFor(file);
    await expect(option.run(file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
