import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { coreTools, type ToolDefinition } from '../../app/tool-catalog';
import { downloadBlob } from '../../lib/download';
import { FileToolFlow, type FlowResult, type FlowRun } from './FileToolFlow';

vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

const tool = coreTools.find((candidate) => candidate.id === 'compress') as ToolDefinition;
const policy = { accept: ['image/png'], extensions: ['png'], maxBytes: 1024, maxFiles: 1 };

function result(overrides: Partial<FlowResult> = {}): FlowResult {
  return {
    blob: new Blob(['out']),
    filename: 'out.png',
    figure: '68%',
    title: 'Smaller by 68%',
    meta: 'nothing was uploaded',
    ...overrides,
  };
}

function renderFlow(props: Partial<Parameters<typeof FileToolFlow>[0]> = {}) {
  return render(
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a file"
      onRun={async () => result()}
      {...props}
    />,
  );
}

const png = () => new File(['x'], 'photo.png', { type: 'image/png' });

describe('FileToolFlow', () => {
  it('shows the tool mark, accepted types, and size cap in the empty state', () => {
    renderFlow();
    expect(screen.getByText('Drop a file, or click to choose')).toBeInTheDocument();
    expect(screen.getByText(tool.accept.join(' · '))).toBeInTheDocument();
    expect(screen.getByText(tool.maxSize)).toBeInTheDocument();
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });

  it('accepts a dropped file and marks the zone while a drag is over it', async () => {
    renderFlow();
    const zone = screen.getByTestId('dropzone');
    expect(zone).toHaveAttribute('data-dragging', 'false');

    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute('data-dragging', 'false');

    fireEvent.dragEnter(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [png()] } });
    expect(await screen.findByText('photo.png')).toBeInTheDocument();
  });

  it('rejects a file the policy does not allow', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderFlow();
    await user.upload(screen.getByLabelText('Choose a file'), new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a supported file/i);
  });

  it('falls back to the file size when the tool describes nothing', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.upload(screen.getByLabelText('Choose a file'), png());
    expect(await screen.findByText('1 B')).toBeInTheDocument();
  });

  it('passes the option, slider, and checkbox into the run', async () => {
    const onRun = vi.fn(async (_run: FlowRun) => result());
    const user = userEvent.setup();
    renderFlow({ onRun, tool: coreTools.find((candidate) => candidate.id === 'split')! });
    await user.upload(screen.getByLabelText('Choose a file'), png());

    await user.click(screen.getByRole('radio', { name: /page ranges/i }));
    fireEvent.change(screen.getByLabelText(/pages per file/i), { target: { value: '100' } });
    await user.click(screen.getByLabelText(/deliver as a zip archive/i));
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ output: 1, quality: 100, extra: false }),
    );
  });

  it('renders a percentage on the slider by default', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.upload(screen.getByLabelText('Choose a file'), png());
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('shows the plate figure, the stamped sheet, and downloads on request', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.upload(screen.getByLabelText('Choose a file'), png());
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(await screen.findByText('Smaller by 68%')).toBeInTheDocument();
    expect(screen.getAllByText('68%').length).toBeGreaterThan(1);
    expect(screen.getByText('Done')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download file/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'out.png');
  });

  it('puts a text result on the sheet instead of the placeholder bars', async () => {
    const user = userEvent.setup();
    renderFlow({ onRun: async () => result({ text: 'the real words' }) });
    await user.upload(screen.getByLabelText('Choose a file'), png());
    await user.click(screen.getByRole('button', { name: /compress file/i }));
    expect(await screen.findByText('the real words')).toBeInTheDocument();
  });

  it('announces the stage and percentage to a live region', async () => {
    let report: ((fraction: number) => void) | undefined;
    const user = userEvent.setup();
    renderFlow({
      onRun: (run) =>
        new Promise((resolve) => {
          report = run.report;
          run.report(0.9);
          setTimeout(() => resolve(result()), 0);
        }),
    });
    await user.upload(screen.getByLabelText('Choose a file'), png());
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(report).toBeTypeOf('function');
    expect(await screen.findByText('Smaller by 68%')).toBeInTheDocument();
  });

  it('reports a failure without losing the chosen file', async () => {
    const user = userEvent.setup();
    renderFlow({ onRun: async () => { throw new Error('the engine gave up'); } });
    await user.upload(screen.getByLabelText('Choose a file'), png());
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('the engine gave up');
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });

  it('falls back to a generic message when the engine throws a non-error', async () => {
    const user = userEvent.setup();
    renderFlow({ onRun: async () => { throw 'oops'; } });
    await user.upload(screen.getByLabelText('Choose a file'), png());
    await user.click(screen.getByRole('button', { name: /compress file/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not finish/i);
  });

  it('ticks a page back on after it has been removed from the selection', async () => {
    const onRun = vi.fn(async (_run: FlowRun) => result());
    const user = userEvent.setup();
    renderFlow({
      onRun,
      tool: coreTools.find((candidate) => candidate.id === 'split')!,
      describe: () => ({ meta: '2 pages', pages: ['p. 1', 'p. 2'] }),
      pagesSelectable: () => true,
    });
    await user.upload(screen.getByLabelText('Choose a file'), png());

    await user.click(await screen.findByRole('button', { name: 'p. 1', pressed: true }));
    await user.click(screen.getByRole('button', { name: 'p. 1', pressed: false }));
    await user.click(screen.getByRole('button', { name: /split pdf/i }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ selectedPages: [1, 2] }));
  });

  it('ignores an empty selection', async () => {
    renderFlow();
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [] } });
    expect(screen.getByText('Drop a file, or click to choose')).toBeInTheDocument();
  });
});
