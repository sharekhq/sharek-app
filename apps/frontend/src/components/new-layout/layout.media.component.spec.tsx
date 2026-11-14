// The Media page keeps its type filter, sort and search in its address
// (spec 057, R11, FR-025, SC-009), so a refresh, Back or a new tab opens the
// same list. The page reads the address once for MediaBox's starting query
// (initialQuery) and writes each change MediaBox reports (onQueryChange) with
// replaceState, the calendar's way, never a push: Back leaves the page instead
// of stepping through every filter. type is image or video (anything else is
// All), sort=oldest (anything else is Newest first), and defaults are left out
// of the address. The window never reads or writes it (FR-041), which is why
// the address lives here and not in MediaBox.
//
// MediaBox is a stand-in that records its props; the address is happy-dom's,
// read through useSearchParams as calendar.context.spec.tsx does.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

type Query = {
  type?: 'image' | 'image-static' | 'video';
  sort: 'newest' | 'oldest';
  search: string;
};
type BoxProps = {
  standalone?: boolean;
  initialQuery?: Query;
  onQueryChange?: (query: Query) => void;
};
const boxes: BoxProps[] = [];
const box = () => boxes[boxes.length - 1];
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: (props: BoxProps) => {
    boxes.push(props);
    return null;
  },
}));

// The address as the page has it now.
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { MediaLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.media.component';

const mounted: Root[] = [];
let replace: jest.SpyInstance;
let push: jest.SpyInstance;

const mount = async () => {
  boxes.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<MediaLayoutComponent />);
  });
};
// Opens the page at an address; every address write after it is recorded.
const open = async (address: string) => {
  window.history.replaceState(null, '', address);
  replace = jest.spyOn(window.history, 'replaceState');
  push = jest.spyOn(window.history, 'pushState');
  await mount();
};
// MediaBox reports a new query, as it does after the debounced search, a
// filter or a sort.
const change = async (query: Query) => {
  expect(box().onQueryChange).toBeInstanceOf(Function);
  await act(async () => {
    box().onQueryChange!(query);
  });
};

const NEWEST = { sort: 'newest', search: '' };

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  jest.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the Media page reads its address once for the starting query (R11)', () => {
  it('starts on video, oldest first and the search from ?type=video&sort=oldest&search=ramadan', async () => {
    await open('/media?type=video&sort=oldest&search=ramadan');

    expect(box().initialQuery).toEqual({
      type: 'video',
      sort: 'oldest',
      search: 'ramadan',
    });
  });

  it('starts on pictures from ?type=image', async () => {
    await open('/media?type=image');

    expect(box().initialQuery).toEqual({ ...NEWEST, type: 'image' });
  });

  it.each(['/media?type=image-static', '/media?type=gif', '/media'])(
    'starts on All, Newest first and no search from %s',
    async (address) => {
      await open(address);

      expect(box().initialQuery).toEqual(NEWEST);
    }
  );

  it.each(['/media?sort=newest', '/media?sort=desc'])(
    'starts Newest first from %s',
    async (address) => {
      await open(address);

      expect(box().initialQuery).toEqual(NEWEST);
    }
  );

  it('stays the standalone page, not the window', async () => {
    await open('/media?type=video');

    expect(box().standalone).toBe(true);
  });
});

describe('the Media page writes each change with replaceState, defaults left out (R11)', () => {
  it('writes /media?type=video&sort=oldest&search=ramadan', async () => {
    await open('/media');

    await change({ type: 'video', sort: 'oldest', search: 'ramadan' });

    expect(replace).toHaveBeenLastCalledWith(
      null,
      '',
      '/media?type=video&sort=oldest&search=ramadan'
    );
  });

  it.each([
    [{ type: 'image', sort: 'newest', search: '' }, '/media?type=image'],
    [{ sort: 'oldest', search: '' }, '/media?sort=oldest'],
    [{ sort: 'newest', search: 'ramadan' }, '/media?search=ramadan'],
    [{ sort: 'newest', search: '' }, '/media'],
  ] as Array<[Query, string]>)('writes %j as %s', async (query, address) => {
    await open('/media?type=video&sort=oldest&search=ramadan');

    await change(query);

    expect(replace).toHaveBeenLastCalledWith(null, '', address);
  });

  it('never pushes an address, so Back leaves the page', async () => {
    await open('/media');

    await change({ type: 'video', sort: 'newest', search: '' });
    await change({ type: 'video', sort: 'oldest', search: '' });
    await change({ type: 'video', sort: 'oldest', search: 'ramadan' });

    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the same list after a refresh, a search with spaces and & included (SC-009)', async () => {
    const query: Query = {
      type: 'image',
      sort: 'oldest',
      search: 'رمضان & عيد 50%',
    };
    await open('/media');
    await change(query);
    mounted.splice(0).forEach((root) => act(() => root.unmount()));

    await mount();

    expect(window.location.pathname).toBe('/media');
    expect(box().initialQuery).toEqual(query);
  });
});
