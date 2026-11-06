import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Samy shows three runs of text whose language the interface cannot know: the
// user's own message, Samy's reply, and what is being typed. Two of the three
// are ours; the reply is CopilotKit's, reached through the AssistantMessage
// slot beside the UserMessage and Input slots the screen already overrides.
//
// Only the props handed to CopilotChat matter here, so the rest of the chat
// surface is stubbed out (same mock set as agent.chat.language.spec).
const capturedChatProps: any[] = [];
const capturedReplyProps: any[] = [];
const language = { dir: 'ltr' };

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: (props: any) => {
    capturedChatProps.push(props);
    return null;
  },
  // Stands in for CopilotKit's own assistant bubble: the markdown, the copy and
  // retry controls and the loading state are its business, not this test's.
  AssistantMessage: (props: any) => {
    capturedReplyProps.push(props);
    return require('react').createElement(
      'div',
      { className: 'copilotKitMessage copilotKitAssistantMessage' },
      'reply'
    );
  },
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
  PropertiesContext: require('react').createContext({ properties: [] }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.attachments', () => ({
  AttachmentsProvider: ({ children }: any) => children,
  AttachmentsTray: () => null,
  AttachmentTools: () => null,
  AttachmentsDropOverlay: () => null,
  PlayBadge: () => null,
  useAttachments: () => ({
    tiles: [],
    attached: [],
    uploading: false,
    addFiles: () => {},
    addMedia: () => {},
    remove: () => {},
    clear: () => {},
  }),
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: any) => children,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'new' }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ messages: [] }) }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('i18next', () => ({
  __esModule: true,
  default: { language: 'en', dir: () => language.dir },
}));

import { useContext } from 'react';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';
import {
  CardMayWaitContext,
  ChatRunContext,
} from '@gitroom/frontend/components/agents/agent.created.media';

const mount = (element: any) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
};

const chatSlots = () => {
  capturedChatProps.length = 0;
  mount(<AgentChat />);
  expect(capturedChatProps.length).toBeGreaterThan(0);
  return capturedChatProps[capturedChatProps.length - 1];
};

// An Arabic account writing English, or an English account reading an Arabic
// reply, gets the text pushed to the wrong edge with its punctuation adrift at
// the far end. dir="auto" takes the direction from the first strong character
// of the text itself, which is the only side that knows.
describe('Samy reads each run of text in its own direction', () => {
  it("gives the user's own message its own direction", () => {
    const { UserMessage } = chatSlots();
    const container = mount(
      <UserMessage message={{ content: 'مرحبا' } as any} />
    );
    expect(container.firstElementChild?.getAttribute('dir')).toBe('auto');
  });

  it("gives Samy's reply its own direction", () => {
    const { AssistantMessage } = chatSlots();
    const container = mount(<AssistantMessage {...({} as any)} />);
    expect(container.querySelector('[dir="auto"]')).not.toBeNull();
  });

  it("keeps CopilotKit's own reply bubble rather than replacing it", () => {
    const { AssistantMessage } = chatSlots();
    const container = mount(<AssistantMessage {...({} as any)} />);
    expect(
      container.querySelector('.copilotKitAssistantMessage')
    ).not.toBeNull();
  });
});

// What Samy made follows the interface, so it lines up the same way whatever
// language Samy's words are in, or when there are no words to take a side from.
describe('what Samy made sits above its words', () => {
  const card = <span data-card="">made</span>;

  afterEach(() => {
    language.dir = 'ltr';
    capturedReplyProps.length = 0;
  });

  it('comes before the words, in a row that goes when it holds nothing', () => {
    const { AssistantMessage } = chatSlots();
    const container = mount(<AssistantMessage subComponent={card} />);

    const row = container.firstElementChild as HTMLElement;
    expect(row.querySelector('[data-card]')).not.toBeNull();
    expect(row.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap', 'empty:hidden'])
    );
    expect(row.nextElementSibling?.getAttribute('dir')).toBe('auto');
    expect(
      row.nextElementSibling?.querySelector('.copilotKitAssistantMessage')
    ).not.toBeNull();
  });

  it('stays in the interface’s direction while English words read their own way', () => {
    language.dir = 'rtl';
    const { AssistantMessage } = chatSlots();
    const container = mount(<AssistantMessage subComponent={card} />);

    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute('dir')).toBe('rtl');
    expect(row.nextElementSibling?.getAttribute('dir')).toBe('auto');
  });

  // CopilotKit's bubble reads `message.generativeUI?.() ?? subComponent`, so
  // handing it either would draw the card a second time, under the words.
  it('leaves CopilotKit’s bubble nothing to draw again', () => {
    const { AssistantMessage } = chatSlots();
    mount(
      <AssistantMessage
        subComponent={card}
        message={{
          id: 'a1',
          role: 'assistant',
          content: 'words',
          generativeUI: () => card,
          generativeUIPosition: 'before',
        }}
      />
    );

    const reply = capturedReplyProps[capturedReplyProps.length - 1];
    expect(reply.subComponent).toBeUndefined();
    expect(reply.message).toEqual({
      id: 'a1',
      role: 'assistant',
      content: 'words',
    });
  });

  // A stopped call stays in the chat's messages with no result, so a run alone
  // would bring its card back on the old message when the next message runs.
  describe('and may wait', () => {
    const messages = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant' },
      { id: 'u2', role: 'user' },
      { id: 'a2', role: 'assistant' },
    ];
    let seen: boolean | undefined;
    const Card = () => {
      seen = useContext(CardMayWaitContext);
      return null;
    };
    const mayWait = (running: boolean, id: string) => {
      const { AssistantMessage } = chatSlots();
      seen = undefined;
      mount(
        <ChatRunContext.Provider value={{ running, setRunning: () => {} }}>
          <AssistantMessage
            subComponent={<Card />}
            message={{ id, role: 'assistant' }}
            messages={messages}
          />
        </ChatRunContext.Provider>
      );
      return seen;
    };

    it('during a run, after the latest user message', () => {
      expect(mayWait(true, 'a2')).toBe(true);
    });

    it('not during a run, on a message before it', () => {
      expect(mayWait(true, 'a1')).toBe(false);
    });

    it('not with no run at all', () => {
      expect(mayWait(false, 'a2')).toBe(false);
      expect(mayWait(false, 'a1')).toBe(false);
    });
  });
});

// The input is the one surface where dir="auto" cannot simply be set: an empty
// field has no strong character, so it resolves to LTR and would move every
// Arabic placeholder in the composer to the wrong side.
describe('Samy takes the typing direction from what has been typed', () => {
  it('reads a field with text in that text’s direction', () => {
    const container = mount(
      <AutoResizingTextarea value="مرحبا" onChange={() => {}} />
    );
    expect(
      container.querySelector('textarea')?.getAttribute('dir')
    ).toBe('auto');
  });

  it('leaves an empty field alone, so the placeholder keeps its side', () => {
    const container = mount(
      <AutoResizingTextarea value="" onChange={() => {}} />
    );
    expect(container.querySelector('textarea')?.hasAttribute('dir')).toBe(
      false
    );
  });
});
