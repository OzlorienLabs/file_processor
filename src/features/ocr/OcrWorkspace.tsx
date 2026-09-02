import { useState } from 'react';

import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { formatBytes, safeBaseName } from '../../lib/files';
import { ocrLanguages, ocrPages, renderScaleFor, unwrapLines } from '../../lib/ocr';
import type { NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  maxBytes: 25 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'ocr')!;
const PER_PAGE = 1;

export function OcrWorkspace() {
  const [language, setLanguage] = useState('eng');

  async function run({ files, output, quality, extra, signal, report }: FlowRun) {
    const file = files[0];
    const pages = await ocrPages(
      file as NamedBlob,
      language,
      undefined,
      signal,
      (_label, ratio) => report(ratio),
      renderScaleFor(quality),
    ).catch((reason: Error) => {
      if (reason.name === 'AbortError') throw reason;
      throw new Error('The text could not be recognized. Try a sharper scan or a different language.');
    });

    const shaped = pages.map((page) => (extra ? page : unwrapLines(page)));
    const base = safeBaseName(file.name);

    if (output === PER_PAGE && shaped.length > 1) {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      shaped.forEach((text, index) => zip.file(`${base}-page-${index + 1}.txt`, text));
      return {
        blob: await zip.generateAsync({ type: 'blob' }),
        filename: `${base}-ocr.zip`,
        figure: String(shaped.length),
        title: `${shaped.length} pages recognised`,
        meta: 'One text file per page · nothing was uploaded',
        out: 'ZIP',
        text: shaped[0],
      };
    }

    const text = shaped.join('\n\n').trim();
    return {
      blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
      filename: `${base}-ocr.txt`,
      figure: shaped.length > 1 ? String(shaped.length) : '✓',
      title: 'Extract text complete',
      meta: `${text.length.toLocaleString()} characters · nothing was uploaded`,
      text,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a file for OCR"
      describe={(files) => ({ meta: formatBytes(files[0].size) })}
      formatQuality={(value) => `${renderScaleFor(value)}× render`}
      settings={() => (
        <>
          <label className="field-label" htmlFor="ocr-language">
            Document language
            <select id="ocr-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              {ocrLanguages.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="fidelity-note">
            The first run downloads the recognition engine and language data, then everything
            happens on this device. Clear, high-contrast scans read best.
          </p>
        </>
      )}
      onRun={run}
    />
  );
}
