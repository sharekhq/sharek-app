'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Button } from '@gitroom/react/form/button';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import Loading from '@gitroom/frontend/components/layout/loading';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  Media,
  useAiVideoTypes,
} from '@gitroom/frontend/components/launches/ai.video';
import { EmptyState } from '@gitroom/frontend/components/ui/empty.state';
import {
  CheckmarkIcon,
  CloseIcon,
  LockIcon,
  PlusIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  buildStudioCatalog,
  STUDIO_TOOLS,
  StudioTool,
} from '@gitroom/frontend/components/studio/studio.tools';

const StudioEmptyIllustration = () => (
  <svg
    width="132"
    height="108"
    viewBox="0 0 132 108"
    fill="none"
    className="text-muted"
  >
    <rect
      x="22"
      y="22"
      width="52"
      height="52"
      rx="12"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="40" cy="40" r="5" stroke="currentColor" strokeWidth="2" />
    <path
      d="M24 66 40 50l12 12 8-8 12 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="62"
      y="38"
      width="48"
      height="48"
      rx="12"
      fill="var(--surface)"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M86 52v20M76 62h20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      className="text-brand"
      d="M104 18l2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2z"
      fill="currentColor"
    />
  </svg>
);

const useGoToBilling = () => {
  const router = useRouter();
  return useCallback(() => router.push('/billing'), [router]);
};

/**
 * The Tile card from the approved mockup: a 56px tile above the name and a
 * one-line description. AI tools get the saffron tile with ✦, so the
 * distinction never rests on colour alone.
 */
const StudioCard: FC<{ tool: StudioTool; onSaved: (media: Media) => void }> = ({
  tool,
  onSaved,
}) => {
  const t = useT();
  const goToBilling = useGoToBilling();
  const { entry } = tool;
  const locked = tool.state === 'locked';

  const card = (open: () => void, loading: boolean) => (
    <button
      type="button"
      onClick={open}
      aria-busy={loading || undefined}
      className={clsx(
        'flex flex-col items-start gap-[12px] p-[14px] text-start bg-surface border border-line rounded-[14px] transition-all focus-visible:ring-2 focus-visible:ring-brand',
        !locked && 'hover:-translate-y-[1px] hover:shadow-soft'
      )}
    >
      <span className="w-full flex items-start justify-between gap-[8px]">
        <span
          className={clsx(
            'relative w-[56px] h-[56px] rounded-[14px] flex items-center justify-center shrink-0',
            // Out of reach, the tile drops the accent tint; the spark stays, so
            // the AI mark never rested on colour.
            entry.ai && !locked
              ? 'bg-aiSoft text-aiAccent'
              : 'bg-surface2 text-inkSoft'
          )}
        >
          {loading ? (
            <Loading height={20} width={20} type="spin" color="currentColor" />
          ) : (
            entry.icon
          )}
          {entry.ai && (
            <span
              aria-hidden="true"
              className="absolute top-[5px] end-[7px] text-[11px] leading-none"
            >
              ✦
            </span>
          )}
        </span>
        {locked && (
          <span className="flex items-center gap-[4px] shrink-0 h-[22px] px-[8px] rounded-full bg-brandSoft text-brandText text-[11px] font-[600]">
            <LockIcon size={12} />
            {t('studio_upgrade', 'Upgrade')}
          </span>
        )}
      </span>
      <span className="flex flex-col gap-[4px] min-w-0">
        <span className="text-[14px] font-[600] text-ink">{entry.name(t)}</span>
        <span className="text-[12px] leading-[1.5] text-muted">
          {entry.description(t)}
        </span>
      </span>
    </button>
  );

  // A locked tool is never mounted behind its card: the card leads to billing
  // instead, so there is nothing here that could open (FR-005).
  return locked ? (
    card(goToBilling, false)
  ) : (
    <>{entry.trigger({ onSaved, renderTrigger: card })}</>
  );
};

export const StudioComponent: FC = () => {
  const t = useT();
  const user = useUser();
  const goToBilling = useGoToBilling();
  const { billingEnabled } = useVariables();
  const modals = useModals();
  const toaster = useToaster();
  const { data: videoOptions } = useAiVideoTypes();
  const { data: integrations } = useIntegrationList();
  const [lastSaved, setLastSaved] = useState<Media | null>(null);

  const catalog = useMemo(
    () =>
      buildStudioCatalog({
        tools: STUDIO_TOOLS,
        videoOptions,
        user,
        billingEnabled,
      }),
    [videoOptions, user, billingEnabled]
  );

  // The tool has already put its output in the Media library; here it is only
  // confirmed and offered onward. Nothing opens by itself (FR-009).
  const saved = useCallback(
    (media: Media) => {
      toaster.show(
        t('studio_saved_to_media', 'Saved to your Media library'),
        'success'
      );
      setLastSaved(media);
    },
    [t, toaster]
  );

  // Opens the editor the way Samy's manualPosting does, with the result
  // already attached.
  const createPost = useCallback(() => {
    if (!lastSaved) {
      return;
    }
    modals.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      children: (
        <AddEditModal
          allIntegrations={integrations}
          integrations={integrations}
          date={newDayjs()}
          onlyValues={[{ content: '', id: makeId(10), image: [lastSaved] }]}
          reopenModal={() => {}}
          mutate={() => setLastSaved(null)}
        />
      ),
      size: '80%',
    });
  }, [integrations, lastSaved, modals]);

  if (catalog.empty) {
    return (
      <EmptyState
        illustration={<StudioEmptyIllustration />}
        title={t('studio_empty_title', 'No creative tools yet')}
        description={t(
          'studio_empty_body',
          'Tools appear here as they become available on the platform.'
        )}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[24px]">
      <p className="text-[13px] text-muted max-w-[72ch]">
        {t(
          'studio_intro',
          'Create designs, images and videos for your posts. Everything you make is saved to your Media library.'
        )}
      </p>

      {/* One banner for the whole page, and the only solid-brand action on it. */}
      {catalog.hasLockedTools && (
        <div className="flex items-center gap-[14px] flex-wrap bg-panel border border-line rounded-[12px] p-[16px]">
          <span
            aria-hidden="true"
            className="w-[36px] h-[36px] rounded-[10px] bg-aiSoft text-aiAccent flex items-center justify-center shrink-0 text-[15px]"
          >
            ✦
          </span>
          <span className="flex-1 min-w-[220px] flex flex-col gap-[2px]">
            <span className="text-[14px] font-[600] text-ink">
              {t('studio_upsell_title', 'Unlock AI images and video')}
            </span>
            <span className="text-[13px] leading-[1.5] text-muted">
              {t(
                'studio_upsell_body',
                'Upgrade your plan to generate images and videos with AI.'
              )}
            </span>
          </span>
          <Button onClick={goToBilling}>{t('studio_upgrade', 'Upgrade')}</Button>
        </div>
      )}

      {lastSaved && (
        <div
          role="status"
          className="flex items-center gap-[14px] flex-wrap bg-panel border border-line rounded-[12px] ps-[16px] pe-[8px] py-[8px]"
        >
          <span
            aria-hidden="true"
            className="w-[36px] h-[36px] rounded-[10px] bg-surface2 text-success flex items-center justify-center shrink-0"
          >
            <CheckmarkIcon width={15} height={11} />
          </span>
          <span className="flex-1 min-w-[200px] text-[14px] font-[600] text-ink">
            {t('studio_saved_to_media', 'Saved to your Media library')}
          </span>
          {/* The editor renders nothing without a channel, and it opens with
              no close button — so the offer waits for one. */}
          {!!integrations?.length && (
            <Button
              variant="quiet"
              onClick={createPost}
              innerClassName="gap-[8px]"
            >
              <PlusIcon />
              {t('studio_create_post', 'Create a post')}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setLastSaved(null)}
            aria-label={t('close', 'Close')}
            className="w-[32px] h-[32px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] flex items-center justify-center text-muted hover:text-ink hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-brand"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {catalog.categories.map((category) => (
        <section key={category.id} className="flex flex-col gap-[12px]">
          <h2 className="text-[15px] font-[600] text-ink">{category.label(t)}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] mobile:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[12px]">
            {category.tools.map((tool) => (
              <StudioCard key={tool.entry.id} tool={tool} onSaved={saved} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
