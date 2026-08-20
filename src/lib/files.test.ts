import { describe, expect, it } from 'vitest';

import {
  FileInputError,
  assertFilesAllowed,
  formatBytes,
  makeOutputName,
  safeBaseName,
} from './files';

const pdfPolicy = {
  accept: ['application/pdf'],
  extensions: ['pdf'],
  maxBytes: 10,
  maxFiles: 2,
};

describe('file helpers', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1 MB'],
  ])('formats %i bytes for people', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('normalizes unsafe names and creates deterministic output names', () => {
    expect(safeBaseName('../../Quarterly report (final).pdf')).toBe(
      'Quarterly-report-final',
    );
    expect(makeOutputName('notes.txt', 'converted', 'pdf')).toBe(
      'notes-converted.pdf',
    );
  });

  it('accepts files whose MIME or extension matches the policy', () => {
    const files = [new File(['123'], 'scan.pdf', { type: 'application/pdf' })];
    expect(() => assertFilesAllowed(files, pdfPolicy)).not.toThrow();
  });

  it('rejects too many, oversized, empty, and unsupported files', () => {
    expect(() => assertFilesAllowed([], pdfPolicy)).toThrow(FileInputError);
    expect(() =>
      assertFilesAllowed(
        [new File(['1'], 'a.pdf'), new File(['2'], 'b.pdf'), new File(['3'], 'c.pdf')],
        pdfPolicy,
      ),
    ).toThrow('Choose no more than 2 files');
    expect(() =>
      assertFilesAllowed([new File(['12345678901'], 'large.pdf')], pdfPolicy),
    ).toThrow('larger than 10 B');
    expect(() =>
      assertFilesAllowed([new File(['hello'], 'notes.exe')], pdfPolicy),
    ).toThrow('is not a supported file');
  });
});
