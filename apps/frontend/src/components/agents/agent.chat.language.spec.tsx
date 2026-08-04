import { act } from 'react';
import { createRoot } from 'react-dom/client';

// agent.chat.tsx pulls the whole chat surface in at module scope. Only the
// properties handed to the CopilotKit provider matter here, so the rest is
// stubbed out (same mock set as agent.chat.open.modal.spec).
const capturedProperties: any[] = [];

jest.mock('@copilotkit/react-ui', () => ({ CopilotChat: () => null }));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ properties }: any) => {
    capturedProperties.push(properties);
    return null;
  },
  useCopilotAction: () => {},
  useCopilotMessagesContext: () => ({ setMessages: () => {} }),
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

import i18next from 'i18next';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

const render = () => {
  capturedProperties.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<AgentChat />);
  });
  expect(capturedProperties.length).toBeGreaterThan(0);
  return capturedProperties[capturedProperties.length - 1];
};

// Samy names the interface language in its system prompt rather than inferring
// it, because at zero reasoning the model drifts — asked in English, it refused
// in Spanish. The browser is the only side that knows the language, and this
// property is how it says so; nothing else fails if it stops being sent.
describe('AgentChat properties', () => {
  it('tells the agent which language the interface is in', () => {
    (i18next as any).language = 'ar';
    expect(render().language).toBe('ar');
  });

  it('follows the interface when the user switches language', () => {
    (i18next as any).language = 'fr';
    expect(render().language).toBe('fr');
  });

  it('still sends the selected channels', () => {
    expect(render().integrations).toEqual([]);
  });
});
