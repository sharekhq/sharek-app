import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The real `react-dropzone`, because a stand-in is what let this ship: around a child
// that stops a drop and a leave from bubbling, as CopilotKit's chat body does even
// with its attachments off, the zone showed its overlay and then never heard the
// drop, so nothing was added and the overlay stayed over the chat.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));

import { DropFiles } from '@gitroom/frontend/components/layout/drop.files';

const mounted: Root[] = [];
const file = new File(['a'], 'a.png', { type: 'image/png' });

const render = async (capture: boolean, onDrop: (files: File[]) => void) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <DropFiles
        capture={capture}
        onDrop={onDrop}
        overlay={<div data-overlay="" />}
      >
        <div
          data-chat=""
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </DropFiles>
    );
  });
  return host;
};

const fire = async (host: HTMLElement, type: string) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: ['Files'],
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
    },
  });
  await act(async () => {
    host.querySelector('[data-chat]')!.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('DropFiles around a child that stops the drop', () => {
  it('takes the files and drops its overlay when it captures', async () => {
    const onDrop = jest.fn();
    const host = await render(true, onDrop);

    await fire(host, 'dragenter');
    expect(host.querySelector('[data-overlay]')).not.toBeNull();

    await fire(host, 'drop');

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0][0].name).toBe('a.png');
    expect(host.querySelector('[data-overlay]')).toBeNull();
  });

  it('drops its overlay when the drag leaves', async () => {
    const onDrop = jest.fn();
    const host = await render(true, onDrop);

    await fire(host, 'dragenter');
    await fire(host, 'dragleave');

    expect(host.querySelector('[data-overlay]')).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });

  // What the live site did, so this spec can tell the difference.
  it('never hears the drop without capture, and its overlay sticks', async () => {
    const onDrop = jest.fn();
    const host = await render(false, onDrop);

    await fire(host, 'dragenter');
    await fire(host, 'drop');

    expect(onDrop).not.toHaveBeenCalled();
    expect(host.querySelector('[data-overlay]')).not.toBeNull();
  });
});
