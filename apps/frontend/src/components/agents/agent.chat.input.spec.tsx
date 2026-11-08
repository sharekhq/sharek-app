import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// How the chat wires up what's attached to a message. CopilotChat renders its
// Input slot and the real provider runs, so an image reaches the message the way
// it will in the app: through AI Image's `onChange`, here read off a stub.
const sent = jest.fn();
const inputProps: Array<Record<string, any>> = [];
const dropProps: Array<Record<string, any>> = [];
const aiImageProps: Array<Record<string, any>> = [];
const params = { id: 'thread-1' };

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: ({ Input }: { Input: any }) => (
    <Input inProgress={false} onSend={sent} />
  ),
  AssistantMessage: () => null,
}));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: { children: ReactNode }) => children,
  useCopilotAction: () => {},
  useCopilotChatInternal: () => ({
    messages: [],
    setMessages: () => {},
    isAvailable: true,
  }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: (props: { attachments: ReactNode; tools: ReactNode }) => {
    inputProps.push(props);
    return (
      <div>
        <div data-attachments="">{props.attachments}</div>
        <div data-tools="">{props.tools}</div>
      </div>
    );
  },
}));
jest.mock('@gitroom/frontend/components/agents/agent.chat.header', () => ({
  ChatHeader: () => null,
  ChannelSummary: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: (props: { children: ReactNode }) => {
    dropProps.push(props);
    return <div data-drop="">{props.children}</div>;
  },
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  PropertiesContext: jest
    .requireActual('react')
    .createContext({ properties: [] }),
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    addFile: () => {},
    destroy: () => {},
    on: () => {},
    off: () => {},
    getState: () => ({ currentUploads: {} }),
  }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MAX_UPLOAD_SIZE: 1000,
  mediaLibrarySize: () => '',
  MediaBox: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: {
    renderTrigger: (open: () => void, loading: boolean) => ReactNode;
  }) => {
    aiImageProps.push(props);
    return <>{props.renderTrigger(() => undefined, false)}</>;
  },
}));
jest.mock('@gitroom/react/helpers/video.frame', () => ({
  VideoFrame: () => <video />,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true } }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('next/navigation', () => ({ useParams: () => params }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ messages: [] }) }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('i18next', () => ({ __esModule: true, default: { language: 'en' } }));

import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

const mounted: Root[] = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<AgentChat />);
  });
  return { host, root };
};

const input = () => inputProps[inputProps.length - 1];
const attach = async (id: string, ext: string) => {
  await act(async () =>
    aiImageProps[aiImageProps.length - 1].onChange({
      id,
      path: `https://media/${id}.${ext}`,
    })
  );
};
const send = async (text: string) => {
  await act(async () => {
    input().onSend(text);
  });
};

beforeEach(() => {
  params.id = 'thread-1';
  (URL as any).createObjectURL = jest.fn(() => 'blob:x');
  (URL as any).revokeObjectURL = jest.fn();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  inputProps.length = 0;
  dropProps.length = 0;
  aiImageProps.length = 0;
  sent.mockClear();
});

describe('what a sent message carries', () => {
  // This exact text is stored, and old threads and the model read the same format.
  it('writes attachments in the stored format, byte for byte', async () => {
    await mount();
    await attach('a', 'png');
    await attach('b', 'mp4');

    await send('hello');

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(
      'hello\n[--Media--]Image: https://media/a.png\nVideo: https://media/b.mp4\n[--Media--]'
    );
  });

  it('sends the text alone when nothing is attached', async () => {
    await mount();

    await send('hello');

    expect(sent).toHaveBeenCalledWith('hello');
  });

  it('starts the next message with nothing attached', async () => {
    const { host } = await mount();
    await attach('a', 'png');

    await send('hello');

    expect(
      host.querySelector('[data-attachments]')!.querySelectorAll('img')
    ).toHaveLength(0);

    await send('again');

    expect(sent).toHaveBeenLastCalledWith('again');
  });
});

describe('the box', () => {
  it('gets the upload state and the way to add pasted files', async () => {
    await mount();

    expect(input().uploading).toBe(false);

    await act(async () =>
      input().onPasteFiles([new File(['a'], 'a.png', { type: 'image/png' })])
    );

    expect(input().uploading).toBe(true);
  });

  it('gets the two buttons in its tools slot, and the tiles above the text', async () => {
    const { host } = await mount();
    await attach('a', 'png');

    expect(
      Array.from(host.querySelectorAll('[data-tools] button')).map(
        (button) => button.textContent
      )
    ).toEqual(['Insert Media', 'AI Image']);
    expect(
      host.querySelector('[data-attachments] img')?.getAttribute('src')
    ).toBe('https://media/a.png');
  });

  it('hands AI Image what has been typed', async () => {
    await mount();

    await act(async () => input().onChange('a poster'));

    expect(aiImageProps[aiImageProps.length - 1].value).toBe('a poster');
  });

  it('leaves unsent attachments behind on another thread', async () => {
    const { host, root } = await mount();
    await attach('a', 'png');

    params.id = 'thread-2';
    await act(async () => {
      root.render(<AgentChat />);
    });

    expect(host.querySelector('[data-attachments] img')).toBeNull();

    await send('hello');

    expect(sent).toHaveBeenLastCalledWith('hello');
  });
});

describe('dropping on the chat', () => {
  it('wraps the chat, with its own overlay and no tab stop', async () => {
    const { host } = await mount();
    const props = dropProps[dropProps.length - 1];

    expect(props.noKeyboard).toBe(true);
    // CopilotKit's chat body stops a drop and a leave from bubbling to the zone.
    expect(props.capture).toBe(true);
    expect(props.overlay).toBeTruthy();
    expect(props.className).toBe('w-full h-full');
    expect(host.querySelector('[data-drop] [data-tools]')).not.toBeNull();
  });

  it('adds what is dropped, and takes no part in holding it back', async () => {
    await mount();
    const props = dropProps[dropProps.length - 1];

    expect(props).not.toHaveProperty('disabled');

    await act(async () =>
      props.onDrop([new File(['a'], 'a.png', { type: 'image/png' })])
    );

    expect(input().uploading).toBe(true);
  });
});
