import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileDropzone } from './FileDropzone';

const policy = {
  accept: ['application/pdf'],
  extensions: ['pdf'],
  maxBytes: 1024,
  maxFiles: 2,
};

describe('FileDropzone', () => {
  it('passes valid picker files to the workflow', async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(
      <FileDropzone
        id="pdf-files"
        label="Choose PDF files"
        hint="PDF only"
        policy={policy}
        onFiles={onFiles}
      />,
    );

    const file = new File(['pdf'], 'document.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Choose PDF files'), file);

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('accepts valid dropped files and exposes the active state', () => {
    const onFiles = vi.fn();
    render(
      <FileDropzone
        id="drop-pdf"
        label="Choose PDF files"
        hint="PDF only"
        policy={policy}
        onFiles={onFiles}
      />,
    );

    const zone = screen.getByTestId('dropzone');
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute('data-dragging', 'true');

    const file = new File(['pdf'], 'dropped.pdf', { type: 'application/pdf' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(zone).toHaveAttribute('data-dragging', 'false');
  });

  it('announces validation errors without invoking the workflow', () => {
    const onFiles = vi.fn();
    render(
      <FileDropzone
        id="only-pdf"
        label="Choose PDF files"
        hint="PDF only"
        policy={policy}
        onFiles={onFiles}
      />,
    );

    fireEvent.change(screen.getByLabelText('Choose PDF files'), {
      target: {
        files: [
          new File(['bad'], 'malware.exe', {
            type: 'application/octet-stream',
          }),
        ],
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/not a supported file/i);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
