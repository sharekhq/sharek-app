import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Samy's message box: the slot its attached images sit in, the rule that holds
// Send while one is still uploading, and what a paste does. CopilotKit's context
// is scenery here; the real textarea runs, because paste goes through it.
jest.mock('@copilotkit/react-ui', () => ({
  useChatContext: () => ({
    icons: { sendIcon: 'send', stopIcon: 'stop', uploadIcon: 'upload' },
    labels: { placeholder: 'Type a message...' },
  }),
}));
jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ copilotApiConfig: {} }),
  useCopilotChatInternal: () => ({ interrupt: undefined }),
  useCopilotReadable: () => {},
}));

import { Input } from '@gitroom/frontend/components/agents/agent.input';

const mounted: Root[] = [];

const render = async (props: Record<string, unknown> = {}) => {
  const onSend = jest.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <Input
        inProgress={false}
        onSend={onSend}
        onChange={() => {}}
        {...(props as object)}
      />
    );
  });
  return { host, onSend };
};

const textarea = (host: HTMLElement) => host.querySelector('textarea')!;
const sendButton = (host: HTMLElement) =>
  host.querySelector('[data-test-id="copilot-chat-ready"]') as HTMLButtonElement;

const type = async (host: HTMLElement, text: string) => {
  const field = textarea(host);
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(field),
    'value'
  )!.set!;
  await act(async () => {
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const pressEnter = async (host: HTMLElement) => {
  await act(async () => {
    textarea(host).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
  });
};

const paste = async (
  host: HTMLElement,
  clipboard: { files: File[]; text: string }
) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: clipboard.files,
      getData: (type: string) => (type === 'text/plain' ? clipboard.text : ''),
    },
  });
  await act(async () => {
    textarea(host).dispatchEvent(event);
  });
  return event;
};

const picture = new File(['a'], 'a.png', { type: 'image/png' });

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe("the attached images' slot", () => {
  it('sits inside the box, before the text', async () => {
    const { host } = await render({ attachments: <div data-tray="" /> });
    const box = host.querySelector('.copilotKitInput')!;

    expect(box.firstElementChild).toBe(box.querySelector('[data-tray]'));
    expect(box.querySelector('[data-tray]')!.nextElementSibling).toBe(
      textarea(host)
    );
  });
});

describe('Send', () => {
  it('waits for an upload, and so does Enter', async () => {
    const { host, onSend } = await render({ uploading: true });
    await type(host, 'hello');

    expect(sendButton(host).disabled).toBe(true);

    await pressEnter(host);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('goes once the upload ends', async () => {
    const { host, onSend } = await render({ uploading: false });
    await type(host, 'hello');

    expect(sendButton(host).disabled).toBe(false);

    await pressEnter(host);

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  // FR-012: an attachment isn't a message.
  it('still needs some text when images are attached', async () => {
    const { host, onSend } = await render({
      attachments: <div data-tray="" />,
    });

    expect(sendButton(host).disabled).toBe(true);

    await pressEnter(host);

    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('pasting', () => {
  it('adds pasted files with no text, and pastes nothing into the field', async () => {
    const onPasteFiles = jest.fn();
    const { host } = await render({ onPasteFiles });

    const event = await paste(host, { files: [picture], text: '' });

    expect(event.defaultPrevented).toBe(true);
    expect(onPasteFiles).toHaveBeenCalledWith([picture]);
  });

  // A copy from Word carries a picture of the text as well as the text.
  it('leaves files that come with text as a paste of that text', async () => {
    const onPasteFiles = jest.fn();
    const { host } = await render({ onPasteFiles });

    const event = await paste(host, { files: [picture], text: 'from Word' });

    expect(event.defaultPrevented).toBe(false);
    expect(onPasteFiles).not.toHaveBeenCalled();
  });

  it('leaves plain text alone', async () => {
    const onPasteFiles = jest.fn();
    const { host } = await render({ onPasteFiles });

    const event = await paste(host, { files: [], text: 'words' });

    expect(event.defaultPrevented).toBe(false);
    expect(onPasteFiles).not.toHaveBeenCalled();
  });
});
