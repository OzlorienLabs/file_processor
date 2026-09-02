import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import type { PageSpec } from '../../lib/blocks-to-pdf';
import { convertDocxToPdf } from '../../lib/docx-convert';
import { formatBytes, safeBaseName } from '../../lib/files';
import type { NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  extensions: ['docx'],
  maxBytes: 25 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'word-to-pdf')!;

/** Catalog page sizes in order: A4 portrait, Letter portrait, A4 landscape. */
const pageSpecs: PageSpec[] = [
  { format: 'a4', orientation: 'portrait' },
  { format: 'letter', orientation: 'portrait' },
  { format: 'a4', orientation: 'landscape' },
];

export function WordToPdfWorkspace() {
  async function run({ files, output, signal, report }: FlowRun) {
    const bytes = await convertDocxToPdf(
      files[0] as NamedBlob,
      undefined,
      signal,
      pageSpecs[output],
      (done, total) => report(done / total),
    ).catch((reason: Error) => {
      if (reason.name === 'AbortError') throw reason;
      throw new Error('This DOCX could not be converted. It may be damaged or password protected.');
    });
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
    const spec = pageSpecs[output];
    return {
      blob,
      filename: `${safeBaseName(files[0].name)}.pdf`,
      figure: '✓',
      title: 'Create PDF complete',
      meta: `${spec.format.toUpperCase()} ${spec.orientation} · ${formatBytes(blob.size)} · nothing was uploaded`,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a Word document"
      describe={(files) => ({ meta: formatBytes(files[0].size) })}
      settings={() => (
        <p className="fidelity-note">
          Text, headings, and lists convert cleanly. Complex Word layouts such as columns, text
          boxes, and embedded charts are simplified.
        </p>
      )}
      onRun={run}
    />
  );
}
