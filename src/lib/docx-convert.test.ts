import { afterEach, describe, expect, it, vi } from 'vitest';

import { convertDocxToPdf, extractDocxBlocks, extractDocxText, mammothInput } from './docx-convert';
import type { NamedBlob } from './pdf';

async function buildDocxFixture(): Promise<File> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Fixture Title')] }),
          new Paragraph({ children: [new TextRun('Body paragraph for conversion.')] }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  return new File([blob], 'fixture.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('mammothInput', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('wraps bytes as a Buffer when running under Node', () => {
    const input = mammothInput(new ArrayBuffer(4));
    expect('buffer' in input && Buffer.isBuffer(input.buffer)).toBe(true);
  });

  it('passes the raw ArrayBuffer in browsers without Buffer', () => {
    vi.stubGlobal('Buffer', undefined);
    const bytes = new ArrayBuffer(4);
    expect(mammothInput(bytes)).toEqual({ arrayBuffer: bytes });
  });
});

describe('docx conversion', () => {
  it('extracts headings and paragraphs from a real DOCX file', async () => {
    const blocks = await extractDocxBlocks(await buildDocxFixture());
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Fixture Title' },
      { kind: 'paragraph', level: 0, text: 'Body paragraph for conversion.' },
    ]);
  });

  it('extracts raw text from a real DOCX file', async () => {
    const text = await extractDocxText(await buildDocxFixture());
    expect(text).toContain('Fixture Title');
    expect(text).toContain('Body paragraph for conversion.');
  });

  it('converts extracted blocks into a PDF containing the text', async () => {
    const file = (await buildDocxFixture()) as unknown as NamedBlob;
    const bytes = await convertDocxToPdf(file);
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw).toContain('Fixture Title');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = (await buildDocxFixture()) as unknown as NamedBlob;
    await expect(convertDocxToPdf(file, extractDocxBlocks, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
