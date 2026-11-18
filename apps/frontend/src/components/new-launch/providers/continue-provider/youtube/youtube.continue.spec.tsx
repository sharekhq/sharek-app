import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The subscribers line was a hard-coded English literal in every language
// (spec 062 FR-024). It is a plural key read by its base name with { count }.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string, options?: { count?: number }) =>
    key === 'youtube_continue_subscribers'
      ? `translated:${options?.count}`
      : fallback ?? key,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.custom.provider.function',
  () => ({ useCustomProviderFunction: () => ({ get: async () => [] }) })
);
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

import { YoutubeContinue } from '@gitroom/frontend/components/new-launch/providers/continue-provider/youtube/youtube.continue';

describe('YoutubeContinue', () => {
  it('the subscribers line is translated', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(
        <YoutubeContinue
          onSave={async () => undefined}
          existingId={[]}
          initialData={[{ id: 'a', name: 'Sharek', subscriberCount: '1234' }]}
        />
      );
    });
    expect(host.textContent).toContain('translated:1234');
    expect(host.textContent).not.toContain('subscribers');
  });
});
