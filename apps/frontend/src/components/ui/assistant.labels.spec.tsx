import { AssistantButton } from '@gitroom/frontend/components/ui/assistant.labels';

jest.mock('@copilotkit/react-ui', () => ({ useChatContext: jest.fn() }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));

describe('assistant labels', () => {
  it('exports the custom button', () => {
    expect(typeof AssistantButton).toBe('function');
  });
});
