import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// How often a post repeats. From 1026px up a dropdown in the composer's
// footer; at 1025px and below a list of choices in the Repeat Post sheet
// (spec 044, US3), starting with Do Not Repeat.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the repeat list', () => {
  const radios = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));

  it('starts with Do Not Repeat, then every interval', async () => {
    const host = await render(
      <RepeatComponent repeat={null} onChange={jest.fn()} list={true} />
    );

    expect(radios(host).map((radio) => radio.textContent)).toEqual([
      'Do Not Repeat',
      'Day',
      'Two Days',
      'Three Days',
      'Four Days',
      'Five Days',
      'Six Days',
      'Week',
      'Two Weeks',
      'Month',
    ]);
  });

  it('marks the current choice, Do Not Repeat when there is none', async () => {
    const none = await render(
      <RepeatComponent repeat={null} onChange={jest.fn()} list={true} />
    );
    expect(
      radios(none)
        .filter((radio) => radio.getAttribute('aria-checked') === 'true')
        .map((radio) => radio.textContent)
    ).toEqual(['Do Not Repeat']);

    const week = await render(
      <RepeatComponent repeat={7} onChange={jest.fn()} list={true} />
    );
    expect(
      radios(week)
        .filter((radio) => radio.getAttribute('aria-checked') === 'true')
        .map((radio) => radio.textContent)
    ).toEqual(['Week']);
  });

  it('draws each choice as a 44px button with a focus ring', async () => {
    const host = await render(
      <RepeatComponent repeat={null} onChange={jest.fn()} list={true} />
    );

    expect(radios(host)).toHaveLength(10);
    radios(host).forEach((radio) => {
      expect(radio.getAttribute('type')).toBe('button');
      expect(radio.className.split(' ')).toEqual(
        expect.arrayContaining([
          'min-h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
  });

  it('sets the interval tapped, and none for Do Not Repeat', async () => {
    const onChange = jest.fn();
    const host = await render(
      <RepeatComponent repeat={7} onChange={onChange} list={true} />
    );

    await click(radios(host)[2]);
    expect(onChange).toHaveBeenLastCalledWith(2);

    await click(radios(host)[0]);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});

describe('the repeat dropdown', () => {
  const row = (host: HTMLElement) => host.firstElementChild!.firstElementChild!;
  const option = (host: HTMLElement, label: string) =>
    Array.from(host.querySelectorAll('div')).find(
      (node) => node.childElementCount === 0 && node.textContent === label
    )!;

  it('says what it repeats every', async () => {
    const none = await render(
      <RepeatComponent repeat={null} onChange={jest.fn()} />
    );
    expect(none.textContent).toBe('Repeat Post Every...');

    const week = await render(
      <RepeatComponent repeat={7} onChange={jest.fn()} />
    );
    expect(week.textContent).toBe('Repeat Post Every Week');
  });

  it('opens its list, sets the interval picked and closes', async () => {
    const onChange = jest.fn();
    const host = await render(
      <RepeatComponent repeat={null} onChange={onChange} />
    );

    await click(row(host));
    await click(option(host, 'Two Weeks'));

    expect(onChange).toHaveBeenCalledWith(14);
    expect(option(host, 'Two Weeks')).toBeUndefined();
  });
});
