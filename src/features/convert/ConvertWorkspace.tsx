import { useState } from 'react';

import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { conversionsFor, type ConversionOption } from '../../lib/convert-map';
import { formatBytes } from '../../lib/files';

const MB = 1024 * 1024;
const policy = {
  accept: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/flac',
  ],
  extensions: ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'convert')!;

export function ConvertWorkspace() {
  // The real option list depends on the file, so the catalog's four are only the placeholder
  // shown before one is chosen.
  const [options, setOptions] = useState<ConversionOption[]>([]);

  function describe(files: File[]) {
    const available = conversionsFor(files[0]);
    setOptions(available);
    if (!available.length) {
      throw new Error(
        `${files[0].name} has no supported conversions. Try a PDF, DOCX, text, image, or audio file.`,
      );
    }
    return { meta: formatBytes(files[0].size) };
  }

  async function run({ files, output, quality, signal, report }: FlowRun) {
    const option = options[output] ?? options[0];
    const produced = await option
      .run(files[0], signal, (done, total) => report(done / total), quality / 100)
      .catch((reason: Error) => {
        if (reason.name === 'AbortError') throw reason;
        throw new Error('This file could not be converted. It may be damaged or use an unsupported codec.');
      });
    return {
      ...produced,
      figure: '✓',
      title: 'Convert file complete',
      meta: `${option.label} · ${formatBytes(produced.blob.size)} · nothing was uploaded`,
      out: option.label,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a file to convert"
      outputs={options.length ? options.map((option) => ({ label: option.label, note: option.hint })) : undefined}
      describe={describe}
      onRun={run}
    />
  );
}
