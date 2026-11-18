import { AssistantButton } from '@gitroom/frontend/components/ui/assistant.button';

jest.mock('@copilotkit/react-ui', () => ({ useChatContext: jest.fn() }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));

describe('assistant button', () => {
  it('exports the custom button', () => {
    expect(typeof AssistantButton).toBe('function');
  });
});
