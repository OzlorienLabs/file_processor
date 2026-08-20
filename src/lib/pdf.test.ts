import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { getPdfPageCount, mergeToPdf, splitPdf, type NamedBlob } from './pdf';

function namedBlob(bytes: Uint8Array, name: string, type = 'application/pdf'): NamedBlob {
  const blob = new Blob([Uint8Array.from(bytes)], { type }) as NamedBlob;
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

async function pdfWithWidths(...widths: number[]) {
  const document = await PDFDocument.create();
  widths.forEach((width) => document.addPage([width, 100]));
  return document.save();
}

const tinyPng = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  (character) => character.charCodeAt(0),
);

describe('mergeToPdf', () => {
  it('keeps PDF order and adds images as fitted pages', async () => {
    const first = namedBlob(await pdfWithWidths(200, 300), 'first.pdf');
    const image = namedBlob(tinyPng, 'pixel.png', 'image/png');
    const last = namedBlob(await pdfWithWidths(400), 'last.pdf');

    const mergedBytes = await mergeToPdf([first, image, last]);
    const merged = await PDFDocument.load(mergedBytes);

    expect(merged.getPageCount()).toBe(4);
    expect(merged.getPages().slice(0, 2).map((page) => page.getWidth())).toEqual([
      200, 300,
    ]);
    expect(merged.getPage(3).getWidth()).toBe(400);
  });

  it('rejects unsupported inputs and respects pre-aborted work', async () => {
    await expect(
      mergeToPdf([namedBlob(new Uint8Array([1, 2]), 'notes.txt', 'text/plain')]),
    ).rejects.toThrow(/unsupported/i);

    const controller = new AbortController();
    controller.abort();
    await expect(
      mergeToPdf([namedBlob(await pdfWithWidths(100), 'one.pdf')], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('splitPdf', () => {
  it('reports the page count before choosing a split', async () => {
    const input = namedBlob(await pdfWithWidths(100, 200, 300), 'three.pdf');
    await expect(getPdfPageCount(input)).resolves.toBe(3);
  });

  it('creates one PDF for every selected group', async () => {
    const input = namedBlob(await pdfWithWidths(100, 200, 300, 400), 'four.pdf');

    const outputs = await splitPdf(input, [
      [1, 3],
      [2],
    ]);

    expect(outputs).toHaveLength(2);
    const first = await PDFDocument.load(outputs[0]);
    const second = await PDFDocument.load(outputs[1]);
    expect(first.getPages().map((page) => page.getWidth())).toEqual([100, 300]);
    expect(second.getPages().map((page) => page.getWidth())).toEqual([200]);
  });

  it('rejects empty groups and page numbers outside the document', async () => {
    const input = namedBlob(await pdfWithWidths(100, 200), 'two.pdf');
    await expect(splitPdf(input, [])).rejects.toThrow(/page group/i);
    await expect(splitPdf(input, [[3]])).rejects.toThrow(/between 1 and 2/i);
  });
});
