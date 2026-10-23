// HubSpot arrives switched off (HUBSPOT_* unset, so its install never completes
// and nothing links here), but the notice ships and its address works.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

let mockParams = new URLSearchParams();
const mockReplace = jest.fn();
const mockOpen = jest.fn(async () => true);

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: mockOpen }),
}));
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

  it('drops the parameter once closed, so a reload of the calendar does not show it again', async () => {
    mockParams = new URLSearchParams('hubspot=installed');
    await notice();

    expect(mockReplace).toHaveBeenCalledWith('/launches');
  });
});
