// HubSpot arrives switched off (HUBSPOT_* unset, so its install never completes
// and nothing links here), but the notice ships and its address works.
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

let mockParams = new URLSearchParams();
const mockReplace = jest.fn();
const mockOpen = jest.fn<
  Promise<boolean>,
  [{ title: string; description: string }]
>(async () => true);

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: mockOpen }),
}));
// The English default comes back, so the wording case reads what an English
// reader would see if the key were missing.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));

import { HubspotInstalled } from '@gitroom/frontend/components/launches/hubspot.installed';

const mounted: Root[] = [];

const notice = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<HubspotInstalled />);
  });
};

const locale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  ) as Record<string, string>;

beforeEach(() => {
  mockParams = new URLSearchParams();
  mockReplace.mockClear();
  mockOpen.mockClear();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the HubSpot installed notice', () => {
  it('opens only on the address the HubSpot install returns to', async () => {
    await notice();
    expect(mockOpen).not.toHaveBeenCalled();

    mockParams = new URLSearchParams('hubspot=installed');
    await notice();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('names Sharek and the Sharek MCP server, in the code and in both locales', async () => {
    mockParams = new URLSearchParams('hubspot=installed');
    await notice();
    const [{ title, description }] = mockOpen.mock.calls[0];
    const en = locale('en');
    const ar = locale('ar');

    for (const text of [
      title,
      description,
      en.hubspot_installed,
      en.hubspot_installed_description,
    ]) {
      expect(text).not.toMatch(/postiz/i);
    }
    expect(title).toContain('Sharek');
    expect(description).toContain('Sharek MCP');
    expect(en.hubspot_installed_description).toContain('Sharek MCP');
    for (const text of [
      ar.hubspot_installed,
      ar.hubspot_installed_description,
    ]) {
      expect(text).not.toMatch(/postiz|بوستيز/i);
    }
    // The server keeps its Latin name inside the Arabic sentence.
    expect(ar.hubspot_installed_description).toContain('Sharek MCP');
  });

  it('drops the parameter once closed, so a reload of the calendar does not show it again', async () => {
    mockParams = new URLSearchParams('hubspot=installed');
    await notice();

    expect(mockReplace).toHaveBeenCalledWith('/launches');
  });
});
