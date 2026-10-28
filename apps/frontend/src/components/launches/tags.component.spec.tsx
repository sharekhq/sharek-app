import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream's tag editing puts a pencil and a delete control on each row of the
// composer's tag list. Both arrived as clickable divs: no name for a screen
// reader, and no way to reach them from the keyboard. Each sits inside the
// row that ticks the tag, so a click on either must not also tick it.
const initialTags = [
  { id: 't1', name: 'Launch', color: '#B92D43' },
  { id: 't2', name: 'Ramadan', color: '#000000' },
];
// What the server returns: a tag created in a test is added here.
const tags = [...initialTags];
const opened: string[] = [];
// The modals' contents, to answer the Add New Tag one the way its form does.
type ModalContent = (
  close: () => void
) => ReactElement<{ resolve: (value: string) => void }>;
const contents: ModalContent[] = [];

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
// What the handlers open; the modal itself is out of scope.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: ({
      title,
      children,
    }: {
      title: string;
      children: ModalContent;
    }) => {
      opened.push(title);
      contents.push(children);
    },
  }),
}));

import {
  Check,
  TagsComponent,
} from '@gitroom/frontend/components/launches/tags.component';

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
  contents.length = 0;
  tags.splice(0, tags.length, ...initialTags);
});

describe('the tag list’s edit and delete controls', () => {
  it.each(['Edit Tag', 'Delete Tag'])(
    'are buttons named "%s", with a focus ring and a finger-sized target',
    async (name) => {
      const host = await openList(jest.fn());

      const found = controls(host, name);

      expect(found).toHaveLength(initialTags.length);
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

describe('creating a tag from the list', () => {
  it('keeps the tags picked before it', async () => {
    const onChange = jest.fn();
    const host = await openList(onChange);

    await click(
      Array.from(host.querySelectorAll('span')).find(
        (span) => span.textContent === 'Launch'
      )!
    );
    await click(
      Array.from(host.querySelectorAll('div')).find(
        (node) =>
          node.textContent === 'Add New Tag' &&
          node.className.includes('mt-[12px]')
      )!
    );
    // The form saved the tag, and the server lists it from now on.
    tags.push({ id: 't3', name: 'Eid', color: '#1F6F5C' });
    await act(async () => {
      contents[0](() => {}).props.resolve('Eid');
    });

    expect(opened).toEqual(['Add New Tag']);
    expect(onChange).toHaveBeenLastCalledWith({
      target: {
        name: 'tags',
        value: [
          expect.objectContaining({ name: 'Launch' }),
          expect.objectContaining({ name: 'Eid' }),
        ],
      },
    });
  });
});

// The Add Tag sheet at 1025px and below (spec 044, US3): every tag a row that
// ticks it, and Add New Tag under them.
describe('the tag list', () => {
  const list = async (onChange: jest.Mock, initial: unknown[] = []) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <TagsComponent
          name="tags"
          label=""
          initial={initial}
          onChange={onChange}
          list={true}
        />
      );
    });
    return host;
  };
  const rows = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'));

  it('shows every tag as a 44px checkbox button that says whether it is ticked', async () => {
    const host = await list(jest.fn(), [
      { label: 'Ramadan', value: 'Ramadan' },
    ]);

    expect(rows(host).map((row) => row.textContent)).toEqual([
      'Launch',
      'Ramadan',
    ]);
    expect(rows(host).map((row) => row.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
    ]);
    rows(host).forEach((row) => {
      expect(row.getAttribute('type')).toBe('button');
      expect(row.className.split(' ')).toEqual(
        expect.arrayContaining([
          'min-h-[44px]',
          'focus-visible:ring-brand',
          // greyed while a locked composer's fieldset disables it
          'disabled:opacity-50',
        ])
      );
    });
  });

  it('ticks and unticks a tag on a tap, handing over the names', async () => {
    const onChange = jest.fn();
    const host = await list(onChange);

    await click(rows(host)[1]);
    expect(onChange).toHaveBeenLastCalledWith({
      target: { name: 'tags', value: [{ label: 'Ramadan', value: 'Ramadan' }] },
    });

    await click(rows(host)[1]);
    expect(onChange).toHaveBeenLastCalledWith({
      target: { name: 'tags', value: [] },
    });
  });

  it('opens the tag editor from Add New Tag, a quiet button under the tags', async () => {
    const host = await list(jest.fn());
    const add = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add New Tag'
    )!;

    expect(add.className.split(' ')).toEqual(
      expect.arrayContaining(['bg-quiet', 'h-[44px]', 'rounded-[8px]'])
    );
    await click(add);

    expect(opened).toEqual(['Add New Tag']);
  });
});

// The calendar's sheets (spec 046) reuse the box.
describe('the tick box on its own', () => {
  it('shows its value and hands back the other one', async () => {
    const onChange = jest.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<Check value={true} onChange={onChange} />);
    });
    const box = host.firstElementChild!;

    expect(box.className).toContain('bg-brand');
    await click(box);

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
