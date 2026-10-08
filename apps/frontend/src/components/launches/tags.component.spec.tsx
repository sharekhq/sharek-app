import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream's tag editing puts a pencil and a delete control on each row of the
// composer's tag list. Both arrived as clickable divs: no name for a screen
// reader, and no way to reach them from the keyboard. Each sits inside the
// row that ticks the tag, so a click on either must not also tick it.
const tags = [
  { id: 't1', name: 'Launch', color: '#B92D43' },
  { id: 't2', name: 'Ramadan', color: '#000000' },
];
const opened: string[] = [];

jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: { tags },
    isLoading: false,
    mutate: async () => ({ tags }),
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
// What the two handlers open; the modal itself is out of scope.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: ({ title }: { title: string }) => opened.push(title),
  }),
}));

import { TagsComponent } from '@gitroom/frontend/components/launches/tags.component';

const mounted: Array<{ unmount: () => void }> = [];

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const openList = async (onChange: jest.Mock) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <TagsComponent name="tags" label="" initial={[]} onChange={onChange} />
    );
  });
  await click(
    Array.from(host.querySelectorAll('div')).find(
      (node) =>
        node.textContent === 'Add New Tag' && node.className.includes('flex-1')
    )!
  );
  return host;
};

const controls = (host: HTMLElement, name: string) =>
  Array.from(host.querySelectorAll('button')).filter(
    (button) => button.getAttribute('aria-label') === name
  );

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  opened.length = 0;
});

describe('the tag list’s edit and delete controls', () => {
  it.each(['Edit Tag', 'Delete Tag'])(
    'are buttons named "%s", with a focus ring and a finger-sized target',
    async (name) => {
      const host = await openList(jest.fn());

      const found = controls(host, name);

      expect(found).toHaveLength(tags.length);
      found.forEach((button) => {
        expect(button.getAttribute('type')).toBe('button');
        expect(button.className.split(' ')).toEqual(
          expect.arrayContaining([
            'focus-visible:ring-2',
            'focus-visible:ring-brand',
            'coarse:w-[44px]',
            'coarse:h-[44px]',
          ])
        );
      });
    }
  );

  it.each(['Edit Tag', 'Delete Tag'])(
    '"%s" runs its handler once and ticks no tag',
    async (name) => {
      const onChange = jest.fn();
      const host = await openList(onChange);

      await click(controls(host, name)[0]);

      expect(opened).toEqual([name]);
      expect(onChange).not.toHaveBeenCalled();
    }
  );
});
