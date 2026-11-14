'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { MediaLibraryQuery } from '@gitroom/frontend/components/media/use.media.library';

export const MediaLayoutComponent = () => {
  const searchParams = useSearchParams();
  // The page's filter, sort and search live in its address (research R11):
  // read once for the list's starting query, so a refresh, Back or a new tab
  // opens the same list. Anything but image or video is All, anything but
  // oldest is Newest first.
  const [initialQuery] = useState<MediaLibraryQuery>(() => {
    const type = searchParams.get('type');
    return {
      type: type === 'image' || type === 'video' ? type : undefined,
      sort: searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest',
      search: searchParams.get('search') || '',
    };
  });
  // Each change replaces the address, as the calendar does, never pushes it,
  // so Back leaves the page; the defaults are left out.
  const changeQuery = useCallback((query: MediaLibraryQuery) => {
    const params = new URLSearchParams();
    if (query.type) {
      params.set('type', query.type);
    }
    if (query.sort === 'oldest') {
      params.set('sort', 'oldest');
    }
    if (query.search) {
      params.set('search', query.search);
    }
    const address = params.toString();
    window.history.replaceState(
      null,
      '',
      address ? `/media?${address}` : '/media'
    );
  }, []);
  // min-w-0: this root is a flex item of layout.component.tsx:222, a row
  // container, so min-width:auto floors it at its content's min-content. The
  // floor then propagates up and the shell's overflow-hidden cuts the grid,
  // the search field and all. The three sibling page roots took this in 019;
  // this one was missed.
  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 min-w-0 flex-col gap-[15px] transition-all">
      <MediaBox
        setMedia={() => {}}
        closeModal={() => {}}
        standalone={true}
        initialQuery={initialQuery}
        onQueryChange={changeQuery}
      />
    </div>
  );
};
