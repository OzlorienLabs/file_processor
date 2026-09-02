import { useState } from 'react';

import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { formatBytes, safeBaseName } from '../../lib/files';
import { getPdfPageCount, splitPdf, type NamedBlob } from '../../lib/pdf';
import { pagesPerFile, planSplit, splitModes } from '../../lib/split-plan';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf'],
  extensions: ['pdf'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'split')!;

const PAGE_RANGES = splitModes.indexOf('ranges');
const SELECTED_PAGES = splitModes.indexOf('selected');

export function SplitWorkspace() {
  const [pageCount, setPageCount] = useState(0);
  const [ranges, setRanges] = useState('');

  async function describe(files: File[]) {
    const count = await getPdfPageCount(files[0] as NamedBlob).catch(() => {
      throw new Error('This PDF could not be read. It may be encrypted or damaged.');
    });
    setPageCount(count);
    return {
      meta: `${count} ${count === 1 ? 'page' : 'pages'} · ${formatBytes(files[0].size)}`,
      pages: Array.from({ length: count }, (_, index) => `p. ${index + 1}`),
    };
  }

  async function run({ files, output, quality, extra, selectedPages, signal, report }: FlowRun) {
    const groups = planSplit(splitModes[output], {
      pageCount,
      ranges,
      selectedPages,
      size: pagesPerFile(quality),
    });
    if (!groups.length || groups.some((group) => group.length === 0)) {
      throw new Error('Choose at least one page to keep.');
    }
    const base = safeBaseName(files[0].name);
    const outputs = await splitPdf(files[0] as NamedBlob, groups, signal, (done, total) =>
      report(done / total),
    );

    if (outputs.length === 1 && !extra) {
      const pages = groups[0].join('-');
      return {
        blob: new Blob([Uint8Array.from(outputs[0])], { type: 'application/pdf' }),
        filename: `${base}-pages-${pages}.pdf`,
        figure: String(groups[0].length),
        title: `${groups[0].length} ${groups[0].length === 1 ? 'page' : 'pages'} kept`,
        meta: 'One PDF, ready in your downloads folder · nothing was uploaded',
        out: 'PDF',
      };
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    outputs.forEach((bytes, index) => {
      zip.file(`${base}-part-${index + 1}.pdf`, Uint8Array.from(bytes));
    });
    return {
      blob: await zip.generateAsync({ type: 'blob' }),
      filename: `${base}-split.zip`,
      figure: String(outputs.length),
      title: `${outputs.length} PDFs`,
      meta: 'One ZIP archive · nothing was uploaded',
      out: 'ZIP',
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a PDF to split"
      describe={describe}
      pagesSelectable={(state) => state.output === SELECTED_PAGES}
      formatQuality={(value) => `${pagesPerFile(value)} per file`}
      settings={(state) =>
        state.output === PAGE_RANGES ? (
          <label className="field-label" htmlFor="split-ranges">
            Pages or ranges
            <input
              id="split-ranges"
              placeholder="For example: 1-3, 5, 8"
              value={ranges}
              onChange={(event) => setRanges(event.target.value)}
            />
          </label>
        ) : null
      }
      runBlocked={(state) => {
        if (state.output === PAGE_RANGES && !ranges.trim()) return 'Type a page range first';
        if (state.output === SELECTED_PAGES && !state.selectedPages.length) return 'Pick at least one page';
        return undefined;
      }}
      onRun={run}
    />
  );
}
