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

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: (props: any) => {
    capturedChatProps.push(props);
    return null;
  },
  // Stands in for CopilotKit's own assistant bubble: the markdown, the copy and
  // retry controls and the loading state are its business, not this test's.
  AssistantMessage: () =>
    require('react').createElement(
      'div',
      { className: 'copilotKitMessage copilotKitAssistantMessage' },
      'reply'
    ),
}));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children }: any) => children,
  useCopilotAction: () => {},
  useCopilotMessagesContext: () => ({ messages: [], setMessages: () => {} }),
}));
jest.mock('@copilotkit/runtime-client-gql', () => ({ TextMessage: class {} }));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  MediaPortal: () => null,
  PropertiesContext: require('react').createContext({ properties: [] }),
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
jest.mock('i18next', () => ({ __esModule: true, default: { language: 'en' } }));

import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';

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
