'use client';

import { FC, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { mediaPreviewModal } from '@gitroom/frontend/components/media/media.preview';
import { Media } from '@gitroom/frontend/components/launches/ai.video';
import { useCreatePost } from '@gitroom/frontend/components/studio/studio.component';
import {
  findStudioTool,
  useStudioCatalog,
} from '@gitroom/frontend/components/studio/studio.tools';
import {
  ToolSwitcher,
  TopBarSlot,
} from '@gitroom/frontend/components/studio/tool.switcher';

// The page card's row, filled above 1025px; natural height at 1025px and
// below, where the window scrolls, as the frame inside it is.
const ROOT = 'bg-newBgColorInner flex-1 min-w-0 h-full min-h-0 mobile:h-auto';

/**
 * A Studio tool's page, `/studio/<tool>`, from the catalog the Studio page
 * lists (contracts/studio-addresses.md § Resolution). An address with no page
 * (unknown, not offered, or a tool that opens in a window) goes back to
 * Studio, replacing itself so Back does not return to it. No PageScroll: the
 * tool's frame fills the page card above 1025px, and the window scrolls at
 * 1025px and below.
 */
export const StudioToolLayoutComponent: FC<{ tool: string }> = ({ tool }) => {
  const t = useT();
  const router = useRouter();
  const toaster = useToaster();
  const { openModal } = useModals();
  const createPost = useCreatePost();
  const { catalog, loading } = useStudioCatalog();
  const listing = loading ? undefined : findStudioTool(catalog, tool);
  const leaving = !loading && !listing?.entry.workspace;

  useEffect(() => {
    if (leaving) {
      router.replace('/studio');
    }
  }, [leaving, router]);

  // A result the member was no longer there to see. Only the toaster's and the
  // modal manager's module-level emitters and stores, so it still works once
  // the page has gone.
  const notifyReady = (media: Media, kind: 'image' | 'video') => {
    toaster.show(
      kind === 'image'
        ? t('workspace_ready_image', 'Your image is ready')
        : t('workspace_ready_video', 'Your video is ready'),
      'success',
      {
        label: t('workspace_open', 'Open'),
        onClick: () =>
          openModal(
            mediaPreviewModal(
              [
                {
                  id: media.id,
                  path: media.path,
                  name: media.path.split('/').pop(),
                },
              ],
              0
            )
          ),
      }
    );
  };

  if (loading) {
    return (
      <div className={ROOT}>
        <LoadingComponent />
      </div>
    );
  }

  if (!listing?.entry.workspace) {
    return null;
  }

  return (
    <div className={ROOT}>
      {listing.entry.workspace({
        locked: listing.state === 'locked',
        onReady: notifyReady,
        onCreatePost: createPost,
      })}
      <TopBarSlot>
        <ToolSwitcher
          current={listing}
          catalog={catalog}
          className="ms-[12px] phone:ms-0"
        />
      </TopBarSlot>
    </div>
  );
};
