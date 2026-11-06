import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The drop zone the composer and the Media library use. Samy's chat takes the
// same handling with its own overlay, and without the tab stop a whole chat
// column would be: invisible, under the global `outline: none`. `react-dropzone`
// is a stand-in so the drag state and the options can be read, as in
// editor.paste.spec.tsx.
const dropzone = {
  isDragActive: false,
  options: undefined as
    | { onDrop: (files: File[]) => void; noKeyboard?: boolean }
    | undefined,
};
const show = jest.fn();

jest.mock('react-dropzone', () => ({
  useDropzone: (options: typeof dropzone.options) => {
    dropzone.options = options;
    return { getRootProps: () => ({}), isDragActive: dropzone.isDragActive };
  },
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show }),
}));

import { DropFiles } from '@gitroom/frontend/components/layout/drop.files';

const mounted: Root[] = [];

const render = async (props: {
  overlay?: ReactNode;
  noKeyboard?: boolean;
  disabled?: boolean;
  onDrop?: (files: File[]) => void;
}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <DropFiles onDrop={jest.fn()} {...props}>
        <span>content</span>
      </DropFiles>
    );
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  dropzone.isDragActive = false;
  jest.clearAllMocks();
});

describe('DropFiles', () => {
  it('draws the black overlay during a drag, and asks for no change to the keyboard, by default', async () => {
    dropzone.isDragActive = true;
    const host = await render({});

    expect(host.querySelector('.bg-black\\/90')?.textContent).toBe(
      'Drag n drop some files here'
    );
    expect(dropzone.options).not.toHaveProperty('noKeyboard');
  });

  it('draws no overlay with no drag', async () => {
    const host = await render({ overlay: <div data-mine="" /> });

    expect(host.querySelector('.bg-black\\/90')).toBeNull();
    expect(host.querySelector('[data-mine]')).toBeNull();
    expect(host.textContent).toBe('content');
  });

  it('draws the overlay it is given in place of the black one', async () => {
    dropzone.isDragActive = true;
    const host = await render({ overlay: <div data-mine="" /> });

    expect(host.querySelector('[data-mine]')).not.toBeNull();
    expect(host.querySelector('.bg-black\\/90')).toBeNull();
    expect(host.textContent).toBe('content');
  });

  it('hands noKeyboard to the drop zone', async () => {
    await render({ noKeyboard: true });

    expect(dropzone.options?.noKeyboard).toBe(true);
  });

  it('keeps its message for a drop while disabled', async () => {
    const onDrop = jest.fn();
    await render({ disabled: true, onDrop });

    act(() => dropzone.options?.onDrop([]));

    expect(onDrop).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      'Upload current in progress, please wait and then try again.',
      'warning'
    );
  });

  it('hands the files on otherwise', async () => {
    const onDrop = jest.fn();
    await render({ onDrop });
    const files = [new File(['a'], 'a.png', { type: 'image/png' })];

    act(() => dropzone.options?.onDrop(files));

    expect(onDrop).toHaveBeenCalledWith(files);
  });
});
