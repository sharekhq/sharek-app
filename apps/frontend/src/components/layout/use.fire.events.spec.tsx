// useFireEvents lives in libraries/helpers, but its spec runs here: the helpers
// jest config transforms .ts only, and this config roots on apps/frontend/src.
//
// Sharek keeps PostHog: upstream's 3dc18da9 strips the capture from this hook
// on lines that merge without a conflict, so this fails if a merge does.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const capture = jest.fn();
const plausible = jest.fn();
let billingEnabled = true;

jest.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture }),
}));
jest.mock('next-plausible', () => ({
  usePlausible: () => plausible,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled }),
}));

import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';

const roots: Array<{ unmount: () => void }> = [];

const fire = (name: string, props?: Record<string, unknown>) => {
  const Probe = (): null => {
    const fireEvents = useFireEvents();
    useEffect(() => {
      fireEvents(name, props);
    }, [fireEvents]);
    return null;
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(<Probe />);
  });
};

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  capture.mockReset();
  plausible.mockReset();
  billingEnabled = true;
});

describe('useFireEvents', () => {
  it('reports the event to PostHog and to Plausible', () => {
    fire('channel_added', { provider: 'x' });

    expect(capture).toHaveBeenCalledWith('channel_added', { provider: 'x' });
    expect(plausible).toHaveBeenCalledWith('channel_added', {
      props: { provider: 'x' },
    });
  });

  it('reports nothing without billing', () => {
    billingEnabled = false;

    fire('channel_added');

    expect(capture).not.toHaveBeenCalled();
    expect(plausible).not.toHaveBeenCalled();
  });
});
