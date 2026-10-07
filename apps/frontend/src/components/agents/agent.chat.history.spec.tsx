import { act, ReactNode } from 'react';
import { StoredAgentMessage } from '@gitroom/helpers/utils/extract.agent.message.text';
import { createRoot, Root } from 'react-dom/client';

// Reopening a thread from the history panel. CopilotKit 1.72 keeps the chat's
// messages in its agent and matches them by id, in the client, the runner and
// the Mastra bridge alike: a thread written without ids shows every stored
// message twice once the next reply arrives, and one written before the agent
// connects is emptied again by the connect. Module shells as in
// agent.chat.language.spec; the chat hook is a stand-in each case drives.
const chat = {
  isAvailable: true,
  messages: [] as { id: string; role: string; content: string }[],
  setMessages: jest.fn(),
};
const params = { id: 'thread-1' };
type Row = StoredAgentMessage & { id: string };
const fetched: Record<string, Array<(rows: Row[]) => void>> = {};

jest.mock('@copilotkit/react-ui', () => ({ CopilotChat: () => null }));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: { children: ReactNode }) => children,
  useCopilotAction: () => {},
  useCopilotChatInternal: () => chat,
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
jest.mock('next/navigation', () => ({ useParams: () => params }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
// Each list request waits until the case answers it, so a case can hold one
// thread's answer back while the user moves to another.
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async (url: string) => {
    const id = url.split('/')[2];
    const rows = await new Promise<Row[]>((resolve) => {
      (fetched[id] = fetched[id] || []).push(resolve);
    });
    return { json: async () => ({ messages: rows }) };
  },
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('i18next', () => ({ __esModule: true, default: { language: 'en' } }));

import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

const stored = [
  { id: 'm1', role: 'user', content: 'hello' },
  {
    id: 'm2',
    role: 'assistant',
    content: { format: 2, parts: [{ type: 'text', text: 'hi' }] },
  },
];
const shown = [
  { id: 'm1', role: 'user', content: 'hello' },
  { id: 'm2', role: 'assistant', content: 'hi' },
];

let root: Root;

const render = async () => {
  await act(async () => {
    root.render(<AgentChat />);
  });
};

const answer = async (id: string, rows: Row[]) => {
  await act(async () => {
    (fetched[id] || []).forEach((resolve) => resolve(rows));
    fetched[id] = [];
  });
};

beforeEach(() => {
  chat.isAvailable = true;
  chat.messages = [];
  chat.setMessages.mockReset();
  params.id = 'thread-1';
  Object.keys(fetched).forEach((id) => delete fetched[id]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe('AgentChat reopened thread', () => {
  it('writes nothing while the agent is not available', async () => {
    chat.isAvailable = false;
    await render();
    await answer('thread-1', stored);

    expect(chat.setMessages).not.toHaveBeenCalled();
  });

  it('writes the stored messages once the agent is available, with their ids, once each and in order', async () => {
    chat.isAvailable = false;
    await render();
    await answer('thread-1', stored);

    chat.isAvailable = true;
    await render();

    expect(chat.setMessages).toHaveBeenCalledTimes(1);
    expect(chat.setMessages).toHaveBeenCalledWith(shown);
  });

  it('strips a stored integrations block', async () => {
    await render();
    await answer('thread-1', [
      {
        id: 'm1',
        role: 'user',
        content:
          'post this\n[--integrations--]\nUse the following social media platforms: []\n[--integrations--]',
      },
    ]);

    expect(chat.setMessages).toHaveBeenLastCalledWith([
      { id: 'm1', role: 'user', content: 'post this' },
    ]);
  });

  // The vendor's connectAgent empties the messages when the thread opens, and
  // it can land after the stored list does.
  it('writes the list again if the messages are emptied afterwards', async () => {
    await render();
    await answer('thread-1', stored);
    chat.messages = shown;
    await render();
    expect(chat.setMessages).toHaveBeenCalledTimes(1);

    chat.messages = [];
    await render();

    expect(chat.setMessages).toHaveBeenCalledTimes(2);
    expect(chat.setMessages).toHaveBeenLastCalledWith(shown);
  });

  it('starts a new thread empty', async () => {
    params.id = 'new';
    await render();

    expect(chat.setMessages).toHaveBeenCalledWith([]);
  });

  it('never writes a thread the user has already left', async () => {
    await render();
    params.id = 'thread-2';
    await render();

    await answer('thread-1', stored);
    expect(chat.setMessages).not.toHaveBeenCalled();

    await answer('thread-2', [{ id: 'm9', role: 'user', content: 'other' }]);
    expect(chat.setMessages).toHaveBeenCalledTimes(1);
    expect(chat.setMessages).toHaveBeenCalledWith([
      { id: 'm9', role: 'user', content: 'other' },
    ]);
  });

  // The list from the first visit is out of date by the time the user comes
  // back: the exchanges since then are only in the fresh one.
  it('shows the fresh list when the user returns to a thread they left', async () => {
    await render();
    await answer('thread-1', stored);
    params.id = 'new';
    await render();
    const before = chat.setMessages.mock.calls.length;

    params.id = 'thread-1';
    await render();
    expect(chat.setMessages).toHaveBeenCalledTimes(before);

    await answer('thread-1', [
      ...stored,
      { id: 'm3', role: 'user', content: 'and again' },
    ]);
    expect(chat.setMessages).toHaveBeenLastCalledWith([
      ...shown,
      { id: 'm3', role: 'user', content: 'and again' },
    ]);
  });

  it('keeps the thread the user moved to when the one they left answers last', async () => {
    await render();
    params.id = 'thread-2';
    await render();

    await answer('thread-2', [{ id: 'm9', role: 'user', content: 'other' }]);
    await answer('thread-1', stored);
    chat.messages = [];
    await render();

    expect(chat.setMessages).toHaveBeenCalledTimes(2);
    expect(chat.setMessages).toHaveBeenLastCalledWith([
      { id: 'm9', role: 'user', content: 'other' },
    ]);
  });
});
