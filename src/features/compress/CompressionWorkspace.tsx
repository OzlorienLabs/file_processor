import { useState } from 'react';

import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { formatBytes, makeOutputName } from '../../lib/files';
import { getPdfPageCount, type NamedBlob } from '../../lib/pdf';
import { compressPdf } from '../../lib/pdf-compression';
import { compressImage, type CompressionLevel } from '../../lib/raster';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'compress')!;

/** Catalog presets in order: Balanced, Smaller, Sharpest, Custom. */
const presets: CompressionLevel[] = ['balanced', 'strong', 'light', 'balanced'];
const CUSTOM = 3;

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function CompressionWorkspace() {
  const [acknowledged, setAcknowledged] = useState(false);

  async function describe(files: File[]) {
    const file = files[0];
    if (!isPdf(file)) return { meta: formatBytes(file.size) };
    const pages = await getPdfPageCount(file as NamedBlob).catch(() => 0);
    return {
      meta: pages ? `${pages} ${pages === 1 ? 'page' : 'pages'} · ${formatBytes(file.size)}` : formatBytes(file.size),
      pages: Array.from({ length: pages }, (_, index) => `p. ${index + 1}`),
    };
  }

  async function run({ files, output, quality, signal, report }: FlowRun) {
    const file = files[0];
    const level = presets[output];
    const custom = output === CUSTOM ? quality / 100 : undefined;
    let blob: Blob;
    let filename: string;

    if (isPdf(file)) {
      const bytes = await compressPdf(file as NamedBlob, level, undefined, signal, (done, total) =>
        report(done / total),
      );
      blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
      filename = makeOutputName(file.name, 'compressed', 'pdf');
    } else {
      report(0.2);
      const compressed = await compressImage(file, level, undefined, signal, custom);
      report(0.95);
      blob = compressed.blob;
      filename = makeOutputName(file.name, 'compressed', compressed.extension);
    }

    const saved = file.size - blob.size;
    const percent = Math.round((saved / file.size) * 100);
    return {
      blob,
      filename,
      figure: saved > 0 ? `${percent}%` : '✓',
      title: saved > 0 ? `Smaller by ${percent}%` : 'Already efficiently compressed',
      meta: `${formatBytes(file.size)} → ${formatBytes(blob.size)} · nothing was uploaded`,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a file to compress"
      describe={describe}
      settings={({ files }) =>
        files.length && isPdf(files[0]) ? (
          <label className="acknowledge-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand PDF compression will flatten text and links into page images at the
              chosen quality.
            </span>
          </label>
        ) : null
      }
      runBlocked={({ files }) => {
        if (isPdf(files[0]) && !acknowledged) return 'Confirm the note above';
        return undefined;
      }}
      onRun={run}
    />
  );
}
