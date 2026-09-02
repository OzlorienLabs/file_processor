import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { ToolMark } from '../../components/ToolMark/ToolMark';
import { formatBytes } from '../../lib/files';
import { mergeOrders, orderFiles } from '../../lib/merge-order';
import { getPdfPageCount, mergeToPdf, type NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  maxBytes: 100 * MB,
  maxFiles: 20,
  minFiles: 2,
  maxTotalBytes: 150 * MB,
};

const tool = coreTools.find((candidate) => candidate.id === 'merge')!;

export function MergeWorkspace() {
  async function run({ files, output, quality, signal, report }: FlowRun) {
    const ordered = orderFiles(files, mergeOrders[output]);
    const bytes = await mergeToPdf(
      ordered as NamedBlob[],
      signal,
      (done, total) => report((done / total) * 0.95),
      quality / 100,
    );
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
    report(0.98);
    const pages = await getPdfPageCount(blob as NamedBlob);
    return {
      blob,
      filename: 'merged-document.pdf',
      figure: String(pages),
      title: `One PDF, ${pages} ${pages === 1 ? 'page' : 'pages'}`,
      meta: `${formatBytes(blob.size)} · images placed at ${quality}% of the page · nothing was uploaded`,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose files to merge"
      describe={(files) => ({
        meta: `${files.length} files · ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))}`,
      })}
      sourceExtra={({ files, output, working }, { setFiles }) => {
        const ordered = orderFiles(files, mergeOrders[output]);
        const manual = output === 0;
        const move = (index: number, delta: number) => {
          const destination = index + delta;
          if (destination < 0 || destination >= files.length) return;
          const next = [...files];
          [next[index], next[destination]] = [next[destination], next[index]];
          setFiles(next);
        };
        return (
          <ul className="flow-order" aria-label="Files to merge">
            {ordered.map((file, index) => (
              <li className="gi" key={`${file.name}-${file.size}-${index}`}>
                <span className="flow-order-mark" aria-hidden="true">
                  <ToolMark tool="merge" />
                </span>
                <span className="flow-order-name">
                  <strong>{file.name}</strong>
                  <small>{formatBytes(file.size)}</small>
                </span>
                <span className="icon-actions">
                  <button
                    type="button"
                    disabled={!manual || index === 0 || working}
                    aria-label={`Move ${file.name} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={!manual || index === files.length - 1 || working}
                    aria-label={`Move ${file.name} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={working}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles(files.filter((candidate) => candidate !== file))}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        );
      }}
      runBlocked={(state) =>
        state.files.length < 2 ? 'Add at least two files' : undefined
      }
      onRun={run}
    />
  );
}
