import { act } from 'react';
import { createRoot } from 'react-dom/client';

// agent.chat.tsx pulls the whole chat surface in at module scope. Only the
// properties handed to the CopilotKit provider matter here, so the rest is
// stubbed out (same mock set as agent.chat.open.modal.spec).
const capturedProperties: any[] = [];
const capturedSingleEndpoint: unknown[] = [];
// T047: the chat's own labels, captured the same way its properties are.
const capturedLabels: Record<string, string>[] = [];

jest.mock('@copilotkit/react-ui', () => ({
  CopilotChat: ({ labels }: { labels: Record<string, string> }) => {
    capturedLabels.push(labels);
    return null;
  },
}));
jest.mock('@copilotkit/react-core', () => ({
  // Renders its children now, so the CopilotChat inside it is reached and its own
  // labels can be captured. Everything below that chat is already stubbed.
  CopilotKit: ({ properties, useSingleEndpoint, children }: any) => {
    capturedProperties.push(properties);
    capturedSingleEndpoint.push(useSingleEndpoint);
    return children;
  },
  useCopilotAction: () => {},
  // messages too, now that CopilotKit renders its children and LoadMessages runs.
  useCopilotChatInternal: () => ({
    messages: [],
    setMessages: () => {},
    isAvailable: true,
  }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent.chat.header', () => ({
  ChatHeader: () => null,
  ChannelSummary: () => null,
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
  useT: () => (key: string) => key,
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
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import { ASSISTANT_LABELS } from '@gitroom/frontend/components/ui/assistant.labels';

// brand: the brand chip's choice, which the agent page keeps beside the
// channels: what the chip shows, and what the user picked in it.
const render = (brand?: { shown?: string; picked?: string }) => {
  capturedProperties.length = 0;
  capturedSingleEndpoint.length = 0;
  capturedLabels.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <PropertiesContext.Provider value={{ properties: [], brand }}>
        <AgentChat />
      </PropertiesContext.Provider>
    );
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

  // Samy's image tool reads the user's pick in the chip from the request: no
  // brand, each channel's own, or one brand by its id (spec 053, R14). The
  // server checks it.
  it.each(['none', 'each', 'brand-1'])(
    'sends the brand the user picked in the chip: %s',
    (brand) => {
      expect(render({ shown: brand, picked: brand }).brand).toBe(brand);
    }
  );

  // What the chip shows without a pick is what the server finds from the
  // selected channels, so sending it would only outrank a brand the user
  // names to Samy.
  it.each(['none', 'each', 'brand-1'])(
    'sends no brand while the chip only shows what the channels give: %s',
    (brand) => {
      expect(Object.keys(render({ shown: brand }))).not.toContain('brand');
    }
  );

  // With no choice yet the tool falls back to the selected channels' brand.
  it('sends no brand while the chip waits for one', () => {
    expect(Object.keys(render())).not.toContain('brand');
  });

  // The backend's /copilot/agent is CopilotKit 1.72's single endpoint; the
  // provider's default REST routes do not exist there.
  it('talks to the single endpoint', () => {
    render();
    expect(capturedSingleEndpoint[capturedSingleEndpoint.length - 1]).toBe(
      true
    );
  });
});

// Feature 029-arabic-audit-followup (T047, contracts/checks.md T1).
//
// Samy's window is the same CopilotKit chat the composer opens, and it passes the
// same two of the ten labels — so the placeholder Samy's own custom input reads, the
// error line, and the six controls on every reply are the vendor's English. They are
// asserted here rather than in a file of their own, because this spec already renders
// the surface and already owns the mock set that makes that possible.
describe('AgentChat labels', () => {
  // Samy keeps its own name and welcome; those two are why the shared table holds
  // eight and not ten.
  it('keeps Samy’s own title and welcome', () => {
    render();
    const labels = capturedLabels[capturedLabels.length - 1];

    expect(labels.title).toBe('samy');
    expect(labels.initial).toBe('samy_welcome_message');
  });

  it.each(
    Object.entries(ASSISTANT_LABELS).map(([label, { key }]) => [label, key])
  )('names %s from %s', (label, key) => {
    render();

    expect(capturedLabels[capturedLabels.length - 1][label]).toBe(key);
  });

  // The custom input Samy renders reads labels.placeholder, so a missing label is
  // English in the one control the user types into.
  it('leaves none of the ten to the vendor', () => {
    render();
    const labels = capturedLabels[capturedLabels.length - 1];

    for (const label of ['title', 'initial', ...Object.keys(ASSISTANT_LABELS)]) {
      expect(typeof labels[label]).toBe('string');
    }
  });
});
