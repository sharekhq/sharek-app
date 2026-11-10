'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
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
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { PlayBadge } from '@gitroom/frontend/components/agents/agent.attachments';
import {
  Media,
  useAiVideoTypes,
} from '@gitroom/frontend/components/launches/ai.video';
import {
  FOCUS_RING,
  onRadioGroupKeyDown,
  SearchField,
} from '@gitroom/frontend/components/launches/channel.panel';
import { EmptyState } from '@gitroom/frontend/components/ui/empty.state';
import {
  CheckmarkIcon,
  CloseIcon,
  LockIcon,
  PlusIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  buildStudioCatalog,
  filterStudio,
  STUDIO_TOOLS,
  StudioChip,
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
 * A listing's sample picture in a 16:10 frame, then its text: a tool's
 * category, name and description; a model's name, maker, description and
 * facts. On a phone, a row with the picture on the start side.
 */
const StudioCard: FC<{
  tool: StudioTool;
  /** The chip of the listing's category, which names it. */
  category: StudioChip | undefined;
  onSaved: (media: Media) => void;
}> = ({ tool, category, onSaved }) => {
  const t = useT();
  const goToBilling = useGoToBilling();
  const { entry } = tool;
  const { maker } = entry;
  const locked = tool.state === 'locked';
  const video = entry.kind === 'model' && entry.category === 'video';
  // A picture that does not load gives way to the placeholder, and a logo
  // that does not takes its plate with it (FR-017, research R6).
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const facts = entry.facts?.(t);

  const card = (open: () => void, loading: boolean) => (
    <button
      type="button"
      onClick={open}
      aria-busy={loading || undefined}
      className={clsx(
        'flex flex-col phone:flex-row text-start bg-surface border border-line rounded-[14px] overflow-hidden transition-all focus-visible:ring-2 focus-visible:ring-brand',
        !locked && 'hover:shadow-card motion-safe:hover:-translate-y-[2px]'
      )}
    >
      <span className="relative block shrink-0 aspect-[16/10] overflow-hidden bg-surface2 phone:w-[128px] phone:aspect-auto phone:min-h-[100px]">
        {entry.cover && !coverFailed ? (
          <img
            src={entry.cover}
            width="640"
            height="400"
            loading="lazy"
            decoding="async"
            alt=""
            onError={() => setCoverFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          // a video's play mark stands where the glyph would
          !video && (
            <span className="absolute inset-0 flex items-center justify-center text-muted">
              {entry.icon}
            </span>
          )
        )}
        {loading ? (
          <span className="absolute inset-0 m-auto w-[32px] h-[32px] rounded-full bg-black/70 text-white flex items-center justify-center">
            <Loading height={20} width={20} type="spin" color="currentColor" />
          </span>
        ) : (
          video && <PlayBadge />
        )}
        {maker?.logo && !logoFailed && (
          <span className="absolute bottom-[10px] start-[10px] w-[30px] h-[30px] rounded-[8px] bg-white shadow-soft flex items-center justify-center">
            <img
              src={maker.logo}
              width="18"
              height="18"
              alt=""
              onError={() => setLogoFailed(true)}
            />
          </span>
        )}
        {/* the length times the sample, so the placeholder has none */}
        {entry.sampleLength && entry.cover && !coverFailed && (
          <span
            dir="ltr"
            className="absolute bottom-[10px] end-[10px] h-[22px] px-[6px] rounded-[6px] bg-black/70 text-white text-[12px] font-[600] tabular-nums flex items-center"
          >
            {entry.sampleLength}
          </span>
        )}
        {locked && (
          <span className="absolute top-[10px] start-[10px] h-[26px] px-[8px] rounded-full bg-black/70 text-white text-[12px] font-[600] flex items-center gap-[5px]">
            <LockIcon size={12} />
            {t('studio_upgrade', 'Upgrade')}
          </span>
        )}
      </span>
      <span className="flex-1 flex flex-col gap-[4px] min-w-0 pt-[12px] px-[14px] pb-[14px] phone:py-[10px] phone:px-[12px] phone:justify-center">
        {/* A model with a maker names the category in its maker line. */}
        {!maker && (
          <span className="text-[12px] font-[600] text-muted phone:hidden">
            {category?.label(t)}
          </span>
        )}
        <span className="text-[15px] leading-[20px] font-[600] text-ink line-clamp-2">
          {entry.name(t)}
        </span>
        {maker && (
          <span className="text-[12px] text-muted">
            {t('studio_model_by', 'by {{maker}} · {{category}}', {
              maker: isolate(maker.name),
              category: category?.label(t),
              // React escapes the line, so i18next mustn't first
              interpolation: { escapeValue: false },
            })}
          </span>
        )}
        <span className="text-[13px] leading-[1.5] text-muted line-clamp-2 min-h-[3em] phone:min-h-0">
          {entry.description(t)}
        </span>
        {!!facts?.length && (
          <span className="flex flex-wrap gap-[6px] mt-[6px] phone:hidden">
            {facts.map((fact) => (
              <span
                key={fact}
                className="h-[22px] px-[8px] rounded-[6px] bg-panel text-inkSoft text-[12px] inline-flex items-center whitespace-nowrap"
              >
                {fact}
              </span>
            ))}
          </span>
        )}
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

/** Tools or Models: a heading with its subtitle beside it, then the cards. */
const StudioSection: FC<{
  title: string;
  subtitle: string;
  tools: StudioTool[];
  chips: StudioChip[];
  onSaved: (media: Media) => void;
}> = ({ title, subtitle, tools, chips, onSaved }) => (
  <section className="flex flex-col gap-[14px]">
    <div className="flex items-baseline flex-wrap gap-x-[12px] gap-y-[4px]">
      <h2 className="text-[18px] font-[600] text-ink">{title}</h2>
      <p className="text-[13px] text-muted">{subtitle}</p>
    </div>
    {/* Four across at 1440px, auto-fill so a short row keeps its widths; one
        column of rows on a phone (FR-015, research R7). */}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[16px] phone:grid-cols-1 phone:gap-[10px]">
      {tools.map((tool) => (
        <StudioCard
          key={tool.entry.id}
          tool={tool}
          category={chips.find((item) => item.id === tool.entry.category)}
          onSaved={onSaved}
        />
      ))}
    </div>
  </section>
);

// The search field's own magnifier, drawn larger.
const NoMatchIllustration = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    className="text-muted"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const StudioComponent: FC = () => {
  const t = useT();
  const user = useUser();
  const goToBilling = useGoToBilling();
  const { billingEnabled, showImageEditor } = useVariables();
  const modals = useModals();
  const toaster = useToaster();
  const { data: videoOptions } = useAiVideoTypes();
  const { data: integrations } = useIntegrationList();
  const [lastSaved, setLastSaved] = useState<Media | null>(null);
  const [chip, setChip] = useState<StudioChip['id']>('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(
    () =>
      buildStudioCatalog({
        tools: STUDIO_TOOLS,
        videoOptions,
        user,
        billingEnabled,
        showImageEditor,
      }),
    [videoOptions, user, billingEnabled, showImageEditor]
  );
  const sections = useMemo(
    () => filterStudio(catalog, chip, query, t),
    [catalog, chip, query, t]
  );

  // Clear search starts over: no text, and every category (FR-007). The
  // button leaves with the no-match block, so the focus goes to the field,
  // ready for another word, rather than falling to the page.
  const clearSearch = useCallback(() => {
    setQuery('');
    setChip('all');
    searchRef.current?.focus();
  }, []);

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
      {/* One banner for the whole page, at its top, and the only solid-brand
          action on it. */}
      {catalog.hasLockedTools && (
        <div className="flex items-center gap-[14px] flex-wrap bg-panel border border-line rounded-[12px] p-[16px]">
          <span className="flex-1 min-w-[220px] flex flex-col gap-[2px]">
            <span className="text-[15px] font-[600] text-ink">
              {t('studio_upsell_title', 'Unlock AI images and video')}
            </span>
            <span className="text-[14px] leading-[1.5] text-muted">
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
          <span className="flex-1 min-w-[200px] text-[15px] font-[600] text-ink">
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

      {/* The intro and the search share a row; on a phone they stack and
          the search spans the width (FR-001, FR-016). */}
      <div className="flex items-center gap-[16px] phone:flex-col phone:items-stretch phone:gap-[12px]">
        <p className="flex-1 min-w-0 text-[14px] text-muted">
          {t(
            'studio_intro',
            'Create designs, images and videos for your posts. Everything you make is saved to your Media library.'
          )}
        </p>
        <div className="w-[340px] shrink-0 phone:w-full">
          <SearchField
            ref={searchRef}
            label={t('studio_search', 'Search tools and models')}
            value={query}
            onChange={setQuery}
          />
        </div>
      </div>

      {/* Exactly one chip is chosen, so the chips are radios: one Tab stop,
          with arrow keys, as Analytics' Period. On a phone they keep one row
          that scrolls sideways with no scrollbar, as Samy's attachment row,
          padded so the scroll does not clip a focus ring. */}
      <div
        role="radiogroup"
        aria-label={t('studio_chips_label', 'Filter by category')}
        onKeyDown={onRadioGroupKeyDown}
        className="flex flex-wrap gap-[8px] phone:flex-nowrap phone:overflow-x-auto phone:p-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {catalog.chips.map((item) => {
          // the chip in force, which is All once the chosen one's category is
          // gone
          const checked = item.id === sections.chip;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setChip(item.id)}
              className={clsx(
                'inline-flex items-center gap-[8px] h-[36px] coarse:h-[44px] ps-[14px] pe-[8px] rounded-full border text-[14px] font-[600] whitespace-nowrap cursor-pointer transition-colors',
                FOCUS_RING,
                checked
                  ? 'bg-selectedBg text-selectedText border-transparent'
                  : 'bg-surface text-inkSoft border-line hover:bg-panel'
              )}
            >
              <span>{item.label(t)}</span>
              <span
                className={clsx(
                  'min-w-[22px] h-[22px] px-[6px] rounded-full inline-flex items-center justify-center text-[12px] tabular-nums',
                  checked ? 'bg-surface' : 'bg-panel text-muted'
                )}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {!!sections.tools.length && (
        <StudioSection
          title={t('studio_section_tools', 'Tools')}
          subtitle={t(
            'studio_section_tools_sub',
            'Made for one job, like an image or a slideshow.'
          )}
          tools={sections.tools}
          chips={catalog.chips}
          onSaved={saved}
        />
      )}
      {!!sections.models.length && (
        <StudioSection
          title={t('studio_section_models', 'Models')}
          subtitle={t(
            'studio_section_models_sub',
            'Choose the exact AI model when you want full control over the result.'
          )}
          tools={sections.models}
          chips={catalog.chips}
          onSaved={saved}
        />
      )}
      {!sections.tools.length && !sections.models.length && (
        <EmptyState
          className="border border-dashed border-line rounded-[14px]"
          illustration={<NoMatchIllustration />}
          title={t('studio_no_match_title', 'Nothing matches “{{query}}”', {
            query: isolate(query.trim()),
            // React escapes the title, so i18next mustn't first
            interpolation: { escapeValue: false },
          })}
          description={t(
            'studio_no_match_body',
            'Try another word, or clear the search to see every tool.'
          )}
          actions={
            <Button variant="quiet" onClick={clearSearch}>
              {t('studio_clear_search', 'Clear search')}
            </Button>
          }
        />
      )}
    </div>
  );
};
