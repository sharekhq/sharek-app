'use client';

import { useCalendar, ListStateFilter } from '@gitroom/frontend/components/launches/calendar.context';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import i18next from 'i18next';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { NewPost } from '@gitroom/frontend/components/launches/new.post';
import { GeneratorComponent } from '@gitroom/frontend/components/launches/generator/generator';
import { AddProviderButton } from '@gitroom/frontend/components/launches/add.provider.component';
import { PostActionsMenu } from '@gitroom/frontend/components/launches/post.actions.menu';
import { isUsable } from '@gitroom/frontend/components/launches/channel.panel';
import { CheckmarkIcon } from '@gitroom/frontend/components/ui/icons';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';

// Helper function to get start and end dates based on display type
function getDateRange(
  display: 'day' | 'week' | 'month' | 'list',
  referenceDate?: string
) {
  const date = referenceDate ? newDayjs(referenceDate) : newDayjs();

  switch (display) {
    case 'day':
      return {
        startDate: date.format('YYYY-MM-DD'),
        endDate: date.format('YYYY-MM-DD'),
      };
    case 'week':
      return {
        startDate: date.startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: date.endOf('isoWeek').format('YYYY-MM-DD'),
      };
    case 'month':
      return {
        startDate: date.startOf('month').format('YYYY-MM-DD'),
        endDate: date.endOf('month').format('YYYY-MM-DD'),
      };
    case 'list':
      return {
        startDate: date.format('YYYY-MM-DD'),
        endDate: date.format('YYYY-MM-DD'),
      };
  }
}

// A list-state segment. At 1025px and below it takes taps across the whole
// 44px row, and its tinted pill is the span inside it; above, it draws no box
// of its own, and the pill is the segment it has always been.
const segment =
  'mobile:flex mobile:flex-1 mobile:min-w-fit mobile:h-full mobile:items-stretch mobile:py-[4px] cursor-pointer';
// A view in the segmented control, which shows above 1025px; at 1025px and
// below the view button's menu takes its place. Each is as wide as its word,
// as the board draws them.
const viewPill =
  'pt-[6px] pb-[5px] cursor-pointer px-[12px] text-center rounded-[6px] coarse:flex coarse:justify-center coarse:items-center focus-visible:ring-2 focus-visible:ring-brand';
const statePill =
  'pt-[6px] pb-[5px] cursor-pointer min-w-[80px] px-[12px] text-center rounded-[6px] coarse:flex coarse:justify-center coarse:items-center mobile:flex mobile:flex-1 mobile:items-center mobile:justify-center mobile:min-w-fit mobile:py-0 mobile:px-[8px] mobile:whitespace-nowrap';
const selectedPill = 'text-brandText bg-brandSoft font-[600]';
// Today and the arrows: 54px on touch screens above 1025px, 44px at 1025px
// and below.
const control =
  'h-[42px] coarse:h-[54px] mobile:h-[44px] flex items-center justify-center rounded-[8px] bg-newBgColorInner border border-newTableBorder hover:text-textItemFocused hover:bg-boxFocused transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-brand';
const arrow = clsx(
  control,
  'text-textColor rtl:rotate-180 w-[42px] coarse:min-w-[44px] mobile:w-[44px]'
);

// The calendar's top bar (R8). The page owns the channel sheet the phone's
// Channels chip opens, and the list refresh Add Channel runs.
export const Filters: FC<{
  onOpenChannels: () => void;
  channelsOpen: boolean;
  update: () => void;
}> = ({ onOpenChannels, channelsOpen, update }) => {
  const calendar = useCalendar();
  const t = useT();
  const user = useUser();
  const { billingEnabled, showUpstreamExtras } = useVariables();

  // Set dayjs locale based on current language
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale();

  // Calculate display date range text, short is the phone version
  const getDisplayText = (short?: boolean) => {
    const startDate = newDayjs(calendar.startDate);
    const endDate = newDayjs(calendar.endDate);

    switch (calendar.display) {
      case 'day':
        // each language words the phone's short day its own way
        return startDate.format(
          short
            ? t('calendar_short_day_format', 'ddd, D MMM')
            : 'dddd, D MMMM YYYY'
        );
      case 'week':
        // the start leaves out what it shares with the end: 9 – 15 November 2026
        return `${startDate.format(
          startDate.year() !== endDate.year()
            ? 'D MMMM YYYY'
            : startDate.month() !== endDate.month()
            ? 'D MMMM'
            : 'D'
        )} – ${endDate.format('D MMMM YYYY')}`;
      case 'month':
        return startDate.format('MMMM YYYY');
      default:
        return '';
    }
  };

  const setToday = useCallback(() => {
    const today = newDayjs();
    const currentRange = getDateRange(
      calendar.display as 'day' | 'week' | 'month'
    );

    // Check if we're already showing today's range
    if (
      calendar.startDate === currentRange.startDate &&
      calendar.endDate === currentRange.endDate
    ) {
      return; // No need to set the same range
    }

    calendar.setFilters({
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
      display: calendar.display as 'day' | 'week' | 'month',
      customer: calendar.customer,
    });
  }, [calendar]);

  const setDay = useCallback(() => {
    // If already in day view and showing today, don't change
    if (calendar.display === 'day') {
      const todayRange = getDateRange('day');
      if (calendar.startDate === todayRange.startDate) {
        return;
      }
    }

    const range = getDateRange('day');
    calendar.setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      display: 'day',
      customer: calendar.customer,
    });
  }, [calendar]);

  const setWeek = useCallback(() => {
    // If already in week view and showing current week, don't change
    if (calendar.display === 'week') {
      const currentWeekRange = getDateRange('week');
      if (calendar.startDate === currentWeekRange.startDate) {
        return;
      }
    }

    const range = getDateRange('week');
    calendar.setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      display: 'week',
      customer: calendar.customer,
    });
  }, [calendar]);

  const setMonth = useCallback(() => {
    // If already in month view and showing current month, don't change
    if (calendar.display === 'month') {
      const currentMonthRange = getDateRange('month');
      if (calendar.startDate === currentMonthRange.startDate) {
        return;
      }
    }

    const range = getDateRange('month');
    calendar.setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      display: 'month',
      customer: calendar.customer,
    });
  }, [calendar]);

  const setList = useCallback(() => {
    if (calendar.display === 'list') {
      return;
    }

    const range = getDateRange('list');
    calendar.setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      display: 'list',
      customer: calendar.customer,
    });
  }, [calendar]);

  const next = useCallback(() => {
    const currentStart = newDayjs(calendar.startDate);
    let nextStart: dayjs.Dayjs;

    switch (calendar.display) {
      case 'day':
        nextStart = currentStart.add(1, 'day');
        break;
      case 'week':
        nextStart = currentStart.add(1, 'week');
        break;
      case 'month':
        nextStart = currentStart.add(1, 'month');
        break;
      default:
        nextStart = currentStart.add(1, 'week');
    }

    const range = getDateRange(
      calendar.display as 'day' | 'week' | 'month',
      nextStart.format('YYYY-MM-DD')
    );
    calendar.setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      display: calendar.display as 'day' | 'week' | 'month',
      customer: calendar.customer,
    });
  }, [calendar]);

  const previous = useCallback(() => {
    const currentStart = newDayjs(calendar.startDate);
    let prevStart: dayjs.Dayjs;

    switch (calendar.display) {
      case 'day':
        prevStart = currentStart.subtract(1, 'day');
        break;
      case 'week':
        prevStart = currentStart.subtract(1, 'week');
        break;
      case 'month':
        prevStart = currentStart.subtract(1, 'month');
        break;
      default:
        prevStart = currentStart.subtract(1, 'week');
    }

    const range = getDateRange(
      calendar.display as 'day' | 'week' | 'month',
      prevStart.format('YYYY-MM-DD')
    );
    calendar.setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      display: calendar.display as 'day' | 'week' | 'month',
      customer: calendar.customer,
    });
  }, [calendar]);

  const setCurrent = useCallback(
    (type: 'day' | 'week' | 'month') => () => {
      if (type === 'day') {
        setDay();
      } else if (type === 'week') {
        setWeek();
      } else if (type === 'month') {
        setMonth();
      }
    },
    [setDay, setWeek, setMonth]
  );

  const isListView = calendar.display === 'list';

  const setListStateFilter = useCallback(
    (next: ListStateFilter) => () => {
      if (calendar.listState === next) return;
      calendar.setListState(next);
    },
    [calendar]
  );

  const listStateOptions: { value: ListStateFilter; label: string }[] = [
    { value: 'all', label: t('all', 'All') },
    { value: 'scheduled', label: t('scheduled', 'Scheduled') },
    { value: 'draft', label: t('draft', 'Draft') },
    { value: 'published', label: t('published', 'Published') },
  ];

  const previousPage = useCallback(() => {
    if (calendar.listPage > 0) {
      calendar.setListPage(calendar.listPage - 1);
    }
  }, [calendar]);

  const nextPage = useCallback(() => {
    if (calendar.listPage < calendar.listTotalPages - 1) {
      calendar.setListPage(calendar.listPage + 1);
    }
  }, [calendar]);

  // The channels that show, as the list counts them: the total minus the
  // usable channels missing from the selection, by the list's own rule (C20).
  // A channel it can't tick always shows (C5), and a deleted channel's id left
  // in the selection counts for none.
  const total = calendar.integrations.length;
  const shown = calendar.selectedChannels
    ? total -
      calendar.integrations.filter(
        (channel) =>
          isUsable(channel, 'calendar') &&
          !calendar.selectedChannels!.includes(channel.id)
      ).length
    : total;
  const hiding = shown < total;
  const shownOfTotal = t(
    'channels_shown_of_total',
    '{{shown}} of {{count}} channels',
    { shown, count: total }
  );

  const views = [
    { value: 'day', label: t('day', 'Day'), select: setDay },
    { value: 'week', label: t('week', 'Week'), select: setWeek },
    { value: 'month', label: t('month', 'Month'), select: setMonth },
    { value: 'list', label: t('list', 'List'), select: setList },
  ];
  const currentView = views.find((view) => view.value === calendar.display);

  // Previous and Next are named for the view they step
  const [previousLabel, nextLabel] =
    calendar.display === 'day'
      ? [t('previous_day', 'Previous day'), t('next_day', 'Next day')]
      : calendar.display === 'month'
      ? [t('previous_month', 'Previous month'), t('next_month', 'Next month')]
      : [t('previous_week', 'Previous week'), t('next_week', 'Next week')];

  // At 1025px and below the views are a menu at the end of the second row,
  // in the List view too, so the list can be left.
  const viewMenu = (
    <PostActionsMenu
      label={t('view_named', 'View: {{view}}', { view: currentView?.label })}
      triggerClassName="hidden mobile:flex mobile:order-1 items-center gap-[6px] h-[44px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newTableBorder text-[14px] font-[500] cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
      trigger={
        <>
          {currentView?.label}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </>
      }
      actions={views.map((view) => ({
        key: view.value,
        icon:
          view.value === calendar.display ? (
            <CheckmarkIcon className="text-brandText" />
          ) : (
            <span className="w-[11px]" />
          ),
        label: view.label,
        onClick: view.select,
      }))}
    />
  );

  return (
    <div className="text-textColor flex flex-row flex-wrap gap-[8px] items-center select-none">
      {/* phones: the Channels chip and Create Post first, then the date or
          list row */}
      {total > 0 ? (
        <button
          type="button"
          onClick={onOpenChannels}
          aria-expanded={channelsOpen}
          aria-label={
            hiding
              ? t(
                  'channels_chip_label',
                  'Channels: {{shown}} of {{count}} shown',
                  { shown, count: total }
                )
              : t('channel_list_with_count', 'Channels: {{count}}', {
                  count: total,
                })
          }
          className="hidden mobile:flex mobile:order-1 cursor-pointer h-[44px] px-[12px] bg-btnSimple text-btnText rounded-[8px] items-center gap-[8px] select-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {/* overlapped from the start edge, the right in Arabic */}
          <span className="flex">
            {calendar.integrations.slice(0, 3).map((integration, index) => (
              <ImageWithFallback
                key={integration.id}
                fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
                src={integration.picture}
                className={clsx(
                  'rounded-full border-2 border-btnSimple',
                  index > 0 && '-ms-[10px]'
                )}
                alt=""
                width={24}
                height={24}
              />
            ))}
          </span>
          <span className="text-[14px] font-[500]">
            {hiding ? `${shown}/${total}` : total}
          </span>
        </button>
      ) : (
        <div className="hidden mobile:flex mobile:flex-col mobile:order-1 mobile:flex-1">
          <AddProviderButton update={update} />
        </div>
      )}
      {!isListView && (
        <div className="flex flex-grow flex-row items-center gap-[8px] mobile:order-3 mobile:basis-full mobile:min-w-0">
          <button
            type="button"
            onClick={setToday}
            className={clsx(control, 'px-[9px] text-[14px] font-[500]')}
          >
            {t('today', 'Today')}
          </button>
          <button
            type="button"
            onClick={previous}
            aria-label={previousLabel}
            className={arrow}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="8"
              height="12"
              viewBox="0 0 8 12"
              fill="none"
            >
              <path
                d="M6.5 11L1.5 6L6.5 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={nextLabel}
            className={arrow}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="8"
              height="12"
              viewBox="0 0 8 12"
              fill="none"
            >
              <path
                d="M1.5 11L6.5 6L1.5 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="ms-[6px] mobile:ms-0 text-[18px] mobile:text-[15px] font-[600] whitespace-nowrap mobile:flex-1 mobile:min-w-0 mobile:truncate">
            <span className="mobile:hidden">{getDisplayText()}</span>
            <span className="hidden mobile:inline">{getDisplayText(true)}</span>
          </div>
          {viewMenu}
        </div>
      )}
      {isListView && (
        <div className="flex flex-grow flex-row flex-wrap items-center gap-[10px] mobile:order-3 mobile:basis-full mobile:min-w-0 mobile:gap-[8px]">
          <div
            className={clsx(
              'border h-[42px] coarse:h-[54px] mobile:h-[44px] border-newTableBorder bg-newTableBorder gap-[1px] flex items-center rounded-[8px] overflow-hidden mobile:order-2 mobile:w-full',
              calendar.listTotalPages <= 1 && 'mobile:hidden'
            )}
          >
            <div
              onClick={previousPage}
              className={clsx(
                'text-textColor rtl:rotate-180 px-[9px] coarse:min-w-[44px] mobile:px-0 mobile:w-[44px] bg-newBgColorInner h-full flex items-center justify-center',
                calendar.listPage > 0
                  ? 'cursor-pointer hover:text-textItemFocused hover:bg-boxFocused'
                  : 'opacity-50 cursor-not-allowed'
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="12"
                viewBox="0 0 8 12"
                fill="none"
              >
                <path
                  d="M6.5 11L1.5 6L6.5 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="min-w-[200px] mobile:min-w-0 mobile:flex-1 text-center bg-newBgColorInner h-full flex items-center justify-center">
              <div className="py-[3px] px-[9px] rounded-[5px] transition-all text-[14px]">
                {t('page', 'Page')} {calendar.listPage + 1} {t('of', 'of')} {Math.max(1, calendar.listTotalPages)}
              </div>
            </div>
            <div
              onClick={nextPage}
              className={clsx(
                'text-textColor rtl:rotate-180 px-[9px] coarse:min-w-[44px] mobile:px-0 mobile:w-[44px] bg-newBgColorInner h-full flex items-center justify-center',
                calendar.listPage < calendar.listTotalPages - 1
                  ? 'cursor-pointer hover:text-textItemFocused hover:bg-boxFocused'
                  : 'opacity-50 cursor-not-allowed'
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="12"
                viewBox="0 0 8 12"
                fill="none"
              >
                <path
                  d="M1.5 11L6.5 6L1.5 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div className="flex flex-row p-[4px] border border-newTableBorder rounded-[8px] text-[14px] font-[500] coarse:min-h-[54px] mobile:order-1 mobile:flex-1 mobile:min-w-0 mobile:overflow-x-auto mobile:py-0 mobile:h-[44px] mobile:min-h-[44px]">
            {listStateOptions.map((option) => (
              <div
                key={option.value}
                onClick={setListStateFilter(option.value)}
                className={clsx('contents', segment)}
              >
                <span
                  className={clsx(
                    statePill,
                    calendar.listState === option.value && selectedPill
                  )}
                >
                  {option.label}
                </span>
              </div>
            ))}
          </div>
          {viewMenu}
          <div className="flex-1 mobile:hidden" />
        </div>
      )}
      {/* The end group, at the end, held on one line: where it doesn't fit
          beside the first it drops under it as a whole, at any width, and
          where it is wider than the bar on its own row the notice's count is
          cut first. At 1025px and below it lets its children be the bar's
          own, so Create Post sits beside the chip. */}
      <div className="flex items-center gap-[8px] ms-auto min-w-0 max-w-full mobile:contents">
        {hiding && (
          <div className="flex items-center gap-[6px] min-w-0 min-h-[32px] px-[12px] rounded-full bg-surface2 text-[13px] text-inkSoft whitespace-nowrap mobile:hidden">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0"
            >
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.4" />
              <path d="M6.4 6.4A16.8 16.8 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 4.6-1.2" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
            <span title={shownOfTotal} className="truncate">
              {shownOfTotal}
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => calendar.setSelectedChannels(null)}
              className="shrink-0 inline-flex items-center coarse:min-h-[44px] rounded-[4px] font-[600] text-brandText hover:underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('show_all', 'Show all')}
            </button>
          </div>
        )}
        <div className="flex flex-row shrink-0 gap-[2px] p-[4px] border border-newTableBorder rounded-[8px] text-[14px] font-[500] coarse:min-h-[54px] mobile:hidden">
          {views.map((view) => (
            <button
              key={view.value}
              type="button"
              aria-pressed={calendar.display === view.value}
              onClick={view.select}
              className={clsx(
                viewPill,
                calendar.display === view.value && selectedPill
              )}
            >
              {view.label}
            </button>
          ))}
        </div>
        {total > 0 && (
          <div className="flex gap-[8px] shrink-0 mobile:order-2 mobile:flex-1">
            <NewPost />
            {user?.tier?.ai && billingEnabled && showUpstreamExtras && (
              <GeneratorComponent />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
