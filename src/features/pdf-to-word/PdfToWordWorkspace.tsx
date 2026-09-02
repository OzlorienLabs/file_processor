import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { formatBytes, safeBaseName } from '../../lib/files';
import { getPdfPageCount, type NamedBlob } from '../../lib/pdf';
import { convertPdfToDocx, extractPdfPageTexts, pageTextsToMarkdown } from '../../lib/pdf-to-docx';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf'],
  extensions: ['pdf'],
  maxBytes: 50 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'pdf-to-word')!;
const MARKDOWN = 1;

export function PdfToWordWorkspace() {
  async function describe(files: File[]) {
    const pages = await getPdfPageCount(files[0] as NamedBlob).catch(() => {
      throw new Error('This PDF could not be read. It may be encrypted or damaged.');
    });
    return {
      meta: `${pages} ${pages === 1 ? 'page' : 'pages'} · ${formatBytes(files[0].size)}`,
      pages: Array.from({ length: pages }, (_, index) => `p. ${index + 1}`),
    };
  }

  async function run({ files, output, signal, report }: FlowRun) {
    const file = files[0] as NamedBlob;
    const base = safeBaseName(files[0].name);
    const onPage = (done: number, total: number) => report((done / total) * 0.9);

    if (output === MARKDOWN) {
      const texts = await extractPdfPageTexts(file, undefined, signal, onPage);
      const markdown = pageTextsToMarkdown(texts);
      return {
        blob: new Blob([markdown], { type: 'text/markdown' }),
        filename: `${base}.md`,
        figure: String(texts.length),
        title: `${texts.length} ${texts.length === 1 ? 'page' : 'pages'} as Markdown`,
        meta: 'Plain structure · nothing was uploaded',
        out: 'Markdown',
        text: markdown,
      };
    }

    const blob = await convertPdfToDocx(file, undefined, signal, onPage);
    return {
      blob,
      filename: `${base}.docx`,
      figure: '✓',
      title: 'Create DOCX complete',
      meta: `${formatBytes(blob.size)} of editable paragraphs · nothing was uploaded`,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a PDF document"
      describe={describe}
      settings={() => (
        <p className="fidelity-note">
          The text of each page becomes editable paragraphs. Scanned PDFs without a text layer
          come out empty — run them through the OCR tool instead.
        </p>
      )}
      onRun={run}
    />
  );
}
