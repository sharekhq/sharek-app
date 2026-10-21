import { act, FC } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The user's own bubble in Samy's chat. Threads belong to the organization, so
// a teammate who opens one sees these messages too. Module shells as in
// agent.chat.language.spec; the chat shell renders the bubble slot with the
// message each case sets. The real sanitizer runs: jest.config.ts maps
// isomorphic-dompurify to its browser build on happy-dom's window.
let message: { id: string; role: string; content: string };

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: ({ UserMessage }: { UserMessage: FC<{ message: unknown }> }) => (
    <UserMessage message={message} />
  ),
  AssistantMessage: () => null,
}));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: any) => children,
  useCopilotAction: () => {},
  useCopilotChatInternal: () => ({
    messages: [],
    setMessages: () => {},
    isAvailable: true,
  }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  MediaPortal: () => null,
  PropertiesContext: jest
    .requireActual('react')
    .createContext({ properties: [] }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'new' }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
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

const showMessage = async (content: string) => {
  message = { id: 'm1', role: 'user', content };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<AgentChat />);
  });
  return host.querySelector('.copilotKitUserMessage') as HTMLElement;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe("the user's message in Samy's chat", () => {
  it('does not turn markup typed into it into elements', async () => {
    const bubble = await showMessage(
      'Make a post about <img src=x onerror="document.title=1"> coffee'
    );

    expect(bubble.querySelector('[onerror]')).toBeNull();
    expect(bubble.querySelector('img[src="x"]')).toBeNull();
  });

  it('drops an attribute a picture address breaks out into', async () => {
    const bubble = await showMessage(
      'Image: https://media.sharek.app/a.png" onerror="document.title=1\nUse this one'
    );

    expect(bubble.querySelector('[onerror]')).toBeNull();
    expect(bubble.querySelector('img')?.getAttribute('src')).toBe(
      'https://media.sharek.app/a.png'
    );
  });

  it('still shows the pictures and videos it attaches', async () => {
    const bubble = await showMessage(
      '[--Media--]Image: https://media.sharek.app/a.png\nVideo: https://media.sharek.app/b.mp4\n[--Media--]'
    );

    expect(bubble.querySelector('img')?.getAttribute('src')).toBe(
      'https://media.sharek.app/a.png'
    );
    const source = bubble.querySelector('video[controls] source');
    expect(source?.getAttribute('src')).toBe('https://media.sharek.app/b.mp4');
    expect(source?.getAttribute('type')).toBe('video/mp4');
  });

  // The app's tooltip renders data-tooltip-html as HTML on hover.
  it('does not let the text bring its own tooltip markup', async () => {
    const bubble = await showMessage(
      '<span data-tooltip-id="tooltip" data-tooltip-html="<img src=x onerror=document.title=1>">hover</span>'
    );

    expect(bubble.querySelector('[data-tooltip-html]')).toBeNull();
  });
});
