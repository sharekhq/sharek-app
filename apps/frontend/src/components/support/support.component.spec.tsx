import { act } from 'react';
import { createRoot } from 'react-dom/client';

const request = jest.fn();
const toast = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, fallback: string, options?: Record<string, any>) =>
      Object.entries(options || {}).reduce(
        (text, [name, value]) =>
          text.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
        fallback
      ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
// The identity strip names the active organisation, which arrives over SWR.
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: [
      { id: 'org-1', name: 'Concepta' },
      { id: 'org-2', name: 'Somewhere Else' },
    ],
  }),
}));

import { UserContext } from '@gitroom/frontend/components/layout/user.context';
import { SupportComponent } from '@gitroom/frontend/components/support/support.component';
import { SUPPORT_APP_VERSION_MAX } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';

const user = {
  id: 'user-1',
  name: 'Moataz Khalifa',
  email: 'mo@concepta.digital',
  orgId: 'org-1',
  role: 'ADMIN',
} as any;

const answer = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const mounted: Array<{ unmount: () => void }> = [];

const render = async (as = user) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <UserContext.Provider value={as}>
        <SupportComponent />
      </UserContext.Provider>
    );
  });

  return host;
};

const chips = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="radio"]')) as HTMLElement[];

const field = (host: HTMLElement, name: string) =>
  host.querySelector(`[name="${name}"]`) as HTMLInputElement &
    HTMLTextAreaElement;

const type = async (element: HTMLElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value'
    )!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const press = async (element: HTMLElement, key: string) => {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

const submit = async (host: HTMLElement) => {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

const fillCompletely = async (host: HTMLElement) => {
  await click(chips(host)[0]);
  await type(field(host, 'subject'), 'Instagram stopped posting');
  await type(field(host, 'message'), 'Since Tuesday my scheduled posts fail.');
};

beforeEach(() => {
  request.mockReset();
  toast.mockReset();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the category control', () => {
  // A required choice with no default is a radio group. aria-pressed would
  // announce four independent on/off controls and let a screen-reader user
  // submit having "pressed" none without understanding one was required (R9).
  it('is a radiogroup, not a row of toggle buttons', async () => {
    const host = await render();

    expect(host.querySelector('[role="radiogroup"]')).toBeTruthy();
    expect(chips(host)).toHaveLength(4);
    chips(host).forEach((chip) => {
      expect(chip.getAttribute('aria-checked')).toBeTruthy();
      expect(chip.hasAttribute('aria-pressed')).toBe(false);
    });
  });

  it('pre-selects nothing', async () => {
    const host = await render();

    expect(
      chips(host).filter((chip) => chip.getAttribute('aria-checked') === 'true')
    ).toHaveLength(0);
  });

  // A roving tabindex: the group is one tab stop, and arrow keys move within it.
  it('offers exactly one tab stop before anything is chosen', async () => {
    const host = await render();

    expect(chips(host).filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
  });

  it('moves the tab stop onto the chosen chip', async () => {
    const host = await render();

    await click(chips(host)[2]);

    expect(chips(host)[2].getAttribute('aria-checked')).toBe('true');
    expect(chips(host).filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    expect(chips(host)[2].tabIndex).toBe(0);
  });

  it('selects only one at a time', async () => {
    const host = await render();

    await click(chips(host)[1]);
    await click(chips(host)[3]);

    expect(
      chips(host).filter((chip) => chip.getAttribute('aria-checked') === 'true')
    ).toHaveLength(1);
    expect(chips(host)[3].getAttribute('aria-checked')).toBe('true');
  });

  // The other half of a roving tabindex: one tab stop is only useful if the
  // arrow keys move both the selection and the focus once you are inside it.
  it('moves selection and focus with the arrow keys', async () => {
    const host = await render();

    await press(chips(host)[0], 'ArrowRight');

    expect(chips(host)[1].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(chips(host)[1]);
  });

  it('wraps around at the ends', async () => {
    const host = await render();

    await press(chips(host)[0], 'ArrowLeft');

    expect(chips(host)[3].getAttribute('aria-checked')).toBe('true');
  });

  // In Arabic the chips run right to left, so an arrow that always moves
  // forward moves the opposite way from the one the customer pressed.
  describe('right to left', () => {
    beforeEach(() => {
      document.dir = 'rtl';
    });

    afterEach(() => {
      document.dir = 'ltr';
    });

    it('follows the direction on screen, not the array order', async () => {
      const host = await render();

      await press(chips(host)[0], 'ArrowRight');

      expect(chips(host)[3].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(chips(host)[3]);
    });

    it('moves the other way on the left arrow', async () => {
      const host = await render();

      await press(chips(host)[0], 'ArrowLeft');

      expect(chips(host)[1].getAttribute('aria-checked')).toBe('true');
    });

    // Down is "next" in every direction — only the horizontal pair mirrors.
    it('leaves the vertical arrows alone', async () => {
      const host = await render();

      await press(chips(host)[0], 'ArrowDown');

      expect(chips(host)[1].getAttribute('aria-checked')).toBe('true');
    });
  });
});

describe('validation', () => {
  it('names the missing category', async () => {
    const host = await render();

    await type(field(host, 'subject'), 'Instagram stopped posting');
    await type(field(host, 'message'), 'Since Tuesday my posts fail.');
    await submit(host);

    expect(host.textContent).toContain('Choose what your enquiry is about');
    expect(request).not.toHaveBeenCalled();
  });

  it('names the missing subject', async () => {
    const host = await render();

    await click(chips(host)[0]);
    await type(field(host, 'message'), 'Since Tuesday my posts fail.');
    await submit(host);

    expect(host.textContent).toContain('Add a subject');
    expect(request).not.toHaveBeenCalled();
  });

  it('names the missing message', async () => {
    const host = await render();

    await click(chips(host)[0]);
    await type(field(host, 'subject'), 'Instagram stopped posting');
    await submit(host);

    expect(host.textContent).toContain('Describe what happened');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('the message counter', () => {
  it('starts at zero against the 2000 the server enforces', async () => {
    const host = await render();

    expect(host.textContent).toContain('0/2000');
  });

  it('tracks what has been typed', async () => {
    const host = await render();

    await type(field(host, 'message'), 'x'.repeat(42));

    expect(host.textContent).toContain('42/2000');
  });
});

describe('the identity strip', () => {
  // The sender cannot edit who the enquiry comes from, so it has to be visible:
  // a reply going to an address they did not expect is the failure this prevents.
  it('names who is asking, where the reply goes, and from which workspace', async () => {
    const host = await render();

    expect(host.textContent).toContain('Moataz Khalifa');
    expect(host.textContent).toContain('mo@concepta.digital');
    expect(host.textContent).toContain('Concepta');
    expect(host.textContent).not.toContain('Somewhere Else');
  });

  // `User.name` is null for every self-registered account — the signup path
  // never writes one — so a label with nothing after it is what nearly every
  // customer sees, not an edge case. The workspace row already guards itself.
  it('drops the sender row rather than labelling a blank', async () => {
    const host = await render({ ...user, name: null });

    expect(host.textContent).not.toMatch(/\bFrom\b/);
    // Falling back to the email would print the same address twice, one line
    // above "Reply to", which reads as a rendering fault. The reply address is
    // the part that has to be visible, and it still is.
    expect(host.textContent).toContain('mo@concepta.digital');
    expect(host.textContent).toContain('Concepta');
  });
});

// The enquiry carries plan, role, channel health and browser details the sender
// never typed. Saying so is the difference between helpful and surprising, and
// the aside is the one place it can be said in full without crowding the form —
// so it is read rather than collapsed behind a toggle nobody opens.
describe('the disclosure', () => {
  const aside = (host: HTMLElement) => host.querySelector('aside')!;

  it('sits beside the form rather than behind a toggle', async () => {
    const host = await render();

    expect(aside(host)).toBeTruthy();
    expect(host.querySelector('details')).toBeNull();
  });

  // Beside the form it is read on the way past. Stacked in source order it
  // would sit under the send button, which is the one place a disclosure about
  // what the enquiry carries is no use (FR-011), so the order reverses.
  it('leads the form once the pair stacks', async () => {
    const host = await render();

    expect(aside(host).className).toContain('mobile:order-1');
    expect(host.querySelector('form')!.className).toContain('mobile:order-2');
  });

  it('names what travels with the enquiry', async () => {
    const host = await render();
    const text = aside(host).textContent || '';

    expect(text).toMatch(/plan/i);
    expect(text).toMatch(/role/i);
    expect(text).toMatch(/channel/i);
    expect(text).toMatch(/browser/i);
  });

  it('ends on what is not sent', async () => {
    const host = await render();
    const text = aside(host).textContent || '';

    expect(text).toMatch(/never send/i);
    expect(text).toMatch(/password|credential/i);
    expect(text).toMatch(/content of your posts|post content/i);
  });
});

describe('submitting', () => {
  it('sends what was typed, and nothing about identity', async () => {
    request.mockResolvedValue(answer(201, { ticketNumber: '1042' }));
    const host = await render();

    await fillCompletely(host);
    await submit(host);

    const [url, init] = request.mock.calls[0];
    expect(url).toBe('/support');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      category: 'channels',
      subject: 'Instagram stopped posting',
      message: 'Since Tuesday my scheduled posts fail.',
    });
    expect(body.locale).toBeTruthy();
    // Plan, role, organisation and identity are read server-side from the
    // session; a client that sends them is ignored, not trusted.
    expect(body.email).toBeUndefined();
    expect(body.role).toBeUndefined();
    expect(body.tier).toBeUndefined();
  });

  it('replaces the form with the reference the help desk issued', async () => {
    request.mockResolvedValue(answer(201, { ticketNumber: '1042' }));
    const host = await render();

    await fillCompletely(host);
    await submit(host);

    expect(host.textContent).toContain('1042');
    expect(host.querySelector('form')).toBeNull();
  });

  // The number is what the customer quotes back to us, so it is labelled with
  // the name the help desk uses for it rather than a phrase of our own.
  it('calls the number a ticket id', async () => {
    request.mockResolvedValue(answer(201, { ticketNumber: '1042' }));
    const host = await render();

    await fillCompletely(host);
    await submit(host);

    expect(host.textContent).toContain('Ticket ID');
  });
});

// A failure names a route out and never costs the customer what they typed.
describe('when the send fails', () => {
  const failWith = async (status: number) => {
    request.mockResolvedValue(
      answer(status, { statusCode: status, message: 'Service Unavailable' })
    );
    const host = await render();

    await fillCompletely(host);
    await submit(host);

    return host;
  };

  // FR-014. Re-typing a paragraph of detail after a failure is how a customer
  // gives up instead of asking again.
  it('leaves everything typed exactly where it was', async () => {
    const host = await failWith(503);

    expect(chips(host)[0].getAttribute('aria-checked')).toBe('true');
    expect(field(host, 'subject').value).toBe('Instagram stopped posting');
    expect(field(host, 'message').value).toBe(
      'Since Tuesday my scheduled posts fail.'
    );
  });

  it('keeps the form rather than announcing a reference it never got', async () => {
    const host = await failWith(503);

    expect(host.querySelector('form')).toBeTruthy();
    expect(host.textContent).not.toContain('Ticket ID');
  });

  // Trying again is one route out; the direct address is the other, and it is
  // the only one that still works when the help desk itself is the problem.
  it('names the address that reaches us anyway', async () => {
    const host = await failWith(503);

    expect(host.textContent).toContain('support@sharek.app');
  });

  it('says the same thing when the rate limit refuses the send', async () => {
    const host = await failWith(429);

    expect(host.textContent).toContain('support@sharek.app');
  });

  it('says the same thing when the request never lands at all', async () => {
    request.mockRejectedValue(new Error('Failed to fetch'));
    const host = await render();

    await fillCompletely(host);
    await submit(host);

    expect(host.textContent).toContain('support@sharek.app');
    expect(field(host, 'message').value).toBe(
      'Since Tuesday my scheduled posts fail.'
    );
  });

  // Colour is not a signal every customer receives, so it is never the only one.
  it('pairs the banner with an icon', async () => {
    const host = await failWith(503);
    const banner = host.querySelector('[role="alert"]');

    expect(banner).toBeTruthy();
    expect(banner!.querySelector('svg')).toBeTruthy();
  });

  it('stays quiet until something has actually failed', async () => {
    const host = await render();

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain('support@sharek.app');
  });
});

// The app shell drops each page straight into `flex flex-1` over the line
// colour (new-layout/layout.component.tsx), so a page that does not claim that
// row is sized by its own content and leaves the grey showing beside it. Every
// sibling page — billing, settings, plugs — supplies this surface itself.
describe('the page surface', () => {
  const surface = (host: HTMLElement) => host.firstElementChild!.className;

  it('claims the row the shell gives it', async () => {
    const host = await render();

    expect(surface(host)).toContain('flex-1');
    expect(surface(host)).toContain('bg-newBgColorInner');
  });

  it('claims it once the enquiry is sent too', async () => {
    request.mockResolvedValue(answer(201, { ticketNumber: '1042' }));
    const host = await render();

    await fillCompletely(host);
    await submit(host);

    expect(surface(host)).toContain('flex-1');
    expect(surface(host)).toContain('bg-newBgColorInner');
  });
});

// global.scss sets `body * { outline: none !important }`, so anything without an
// explicit focus-visible ring has none at all — a missing one is a bug here, not
// a browser quirk.
describe('keyboard visibility', () => {
  it('rings every button and chip', async () => {
    const host = await render();
    const interactive = Array.from(host.querySelectorAll('button'));

    expect(interactive.length).toBeGreaterThan(0);
    interactive.forEach((element) => {
      expect(element.className).toContain('focus-visible:ring-2');
      expect(element.className).toContain('focus-visible:ring-brand');
    });
  });

  it('rings the message field', async () => {
    const host = await render();

    expect(field(host, 'message').className).toContain('focus-visible:ring-2');
    expect(field(host, 'message').className).toContain(
      'focus-visible:ring-brand'
    );
  });

  // The shared Input puts its className on the wrapper rather than on the
  // control, so the ring belongs on the box and has to key off focus-within.
  it('rings the subject field around its box', async () => {
    const host = await render();
    const box = field(host, 'subject').parentElement!;

    expect(box.className).toContain('focus-within:ring-2');
    expect(box.className).toContain('focus-within:ring-brand');
  });
});

// A real build sets NEXT_PUBLIC_VERSION to the commit SHA — 40 characters,
// where the DTO bounds the field. Sent unbounded it fails validation and the
// whole submission is refused, and nothing catches it here, because the
// variable is unset locally and the key never reaches the payload at all.
describe('the build identifier it attaches', () => {
  const version = process.env.NEXT_PUBLIC_VERSION;

  afterEach(() => {
    process.env.NEXT_PUBLIC_VERSION = version;
  });

  const bodyOf = async (value: string) => {
    process.env.NEXT_PUBLIC_VERSION = value;
    request.mockResolvedValue(answer(201, { ticketNumber: '113' }));

    const host = await render();
    await fillCompletely(host);
    await submit(host);

    return JSON.parse(request.mock.calls[0][1].body);
  };

  it('stays inside the length the server accepts', async () => {
    const body = await bodyOf('a'.repeat(40));

    expect(body.appVersion.length).toBeLessThanOrEqual(SUPPORT_APP_VERSION_MAX);
  });

  it('carries a full commit SHA rather than a truncated one', async () => {
    const sha = 'e'.repeat(40);

    expect((await bodyOf(sha)).appVersion).toBe(sha);
  });
});
