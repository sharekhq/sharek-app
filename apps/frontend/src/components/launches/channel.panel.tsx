'use client';

import {
  ComponentProps,
  FC,
  ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import { groupBy } from 'lodash';
import { useRouter } from 'next/navigation';
import { useDrag, useDrop } from 'react-dnd';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  CustomVariables,
  useAddProvider,
} from '@gitroom/frontend/components/launches/add.provider.component';
import { PostActionsMenu } from '@gitroom/frontend/components/launches/post.actions.menu';
import { Check } from '@gitroom/frontend/components/launches/tags.component';
import {
  CheckmarkIcon,
  PencilIcon,
} from '@gitroom/frontend/components/ui/icons';
import { customerHue } from '@gitroom/frontend/components/launches/helpers/customer-hue';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { NoChannelsIllustration } from '@gitroom/frontend/components/launches/no-channels.illustration';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';

// A channel as GET /integrations/list gives it: the fields the list reads
// (data-model.md).
interface Channel {
  id: string;
  internalId: string;
  name: string;
  identifier: string;
  picture?: string | null;
  type: string;
  disabled?: boolean;
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
  isCustomFields?: boolean;
  customFields?: ComponentProps<typeof CustomVariables>['variables'];
  customer?: { id?: string; name?: string } | null;
}

// What a tick means on the page the list is on (contracts/channel-panel.md):
// on the calendar, that the channel's posts show.
type PanelMode = 'calendar';

// Code-unit order, as lodash's orderBy compares, so the calendar keeps
// today's order wherever today's had no tie (C14).
const byValue = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// One collation whatever the page's language, so English and Arabic pages
// agree: case-blind, with numbers by value, "Client 2" before "Client 10" (R2).
const collate = (a: string, b: string) =>
  a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

// Social before article, enabled before disabled, then platform, name and id,
// so no two channels tie and two loads never swap them (R2, C14).
export const compareChannels = (a: Channel, b: Channel) =>
  byValue(b.type, a.type) ||
  Number(!!a.disabled) - Number(!!b.disabled) ||
  byValue(a.identifier, b.identifier) ||
  collate(a.name, b.name) ||
  byValue(a.id, b.id);

// The list's groups: the channels with no customer first, then each customer
// A to Z, each group's channels in compareChannels order (R2). A customer
// with no channel has no group.
export const orderChannels = (list: Channel[]) =>
  Object.values(groupBy(list, (channel) => channel.customer?.id || ''))
    .map((channels) => {
      const { customer } = channels[0];
      return {
        customer: customer?.id
          ? { id: customer.id, name: customer.name || '' }
          : null,
        channels: [...channels].sort(compareChannels),
      };
    })
    .sort((a, b) =>
      !a.customer
        ? -1
        : !b.customer
        ? 1
        : collate(a.customer.name, b.customer.name) ||
          byValue(a.customer.id, b.customer.id)
    );

// data-model.md's usable table, one rule per page (C20): whether a row can be
// ticked or picked.
const USABLE: Record<PanelMode, (channel: Channel) => boolean> = {
  // a disabled channel's posts always show, so it can't be hidden (C5)
  calendar: (channel) => !channel.disabled,
};

export const isUsable = (channel: Channel, mode: PanelMode) =>
  USABLE[mode](channel);

// Reconnect from any page (R4): the calendar's refreshChannel, moved here so
// its ⋯ menu and every page's rows share it. A channel in, a handler out.
export const useReconnectChannel = () => {
  const fetch = useFetch();
  const router = useRouter();
  const modal = useModals();
  const t = useT();
  return useCallback(
    (
        integration: Pick<
          Channel,
          'identifier' | 'internalId' | 'isCustomFields' | 'customFields'
        >
      ) =>
      async () => {
        // Custom-fields providers (Bluesky, etc.) have no OAuth URL to redirect
        // to: reconnect by re-entering the credentials, like the menu does.
        if (integration.isCustomFields) {
          modal.openModal({
            title: t('custom_url', 'Custom URL'),
            withCloseButton: false,
            children: (
              <CustomVariables
                identifier={integration.identifier}
                gotoUrl={(url: string) => router.push(url)}
                variables={integration.customFields || []}
              />
            ),
          });
          return;
        }

        const { url } = await (
          await fetch(
            `/integrations/social/${integration.identifier}?refresh=${integration.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    []
  );
};

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-brand';
const ICON_BUTTON = clsx(
  'flex items-center justify-center w-[36px] h-[36px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] text-muted hover:bg-surface2 hover:text-ink transition-colors cursor-pointer',
  FOCUS_RING
);
// Reconnect and Finish setup, beside a row's main button and never inside it
const ROW_ACTION = clsx(
  'shrink-0 flex items-center min-h-[28px] coarse:min-h-[44px] px-[6px] rounded-[6px] text-[12px] font-[600] text-error underline underline-offset-2 whitespace-nowrap',
  FOCUS_RING
);

// The channel's picture with its platform's badge, moved from the calendar's
// MenuComponent with its YouTube branch, at the list's 16px (C13).
const ChannelPicture: FC<{ channel: Channel; className?: string }> = ({
  channel,
  className,
}) => (
  <span
    className={clsx(
      'relative gap-[6px] flex justify-center items-center flex-none',
      className
    )}
  >
    <ImageWithFallback
      fallbackSrc={'/no-picture.jpg'}
      src={channel.picture || '/no-picture.jpg'}
      className="rounded-[8px] min-w-[36px] min-h-[36px]"
      alt={channel.identifier}
      width={36}
      height={36}
    />
    {channel.identifier === 'youtube' ? (
      <img
        src="/icons/platforms/youtube.svg"
        className="absolute z-10 bottom-[5px] -end-[5px]"
        width={16}
      />
    ) : (
      <SafeImage
        src={`/icons/platforms/${channel.identifier}.png`}
        className="rounded-[8px] absolute z-10 bottom-[5px] -end-[5px] border border-fifth"
        alt={channel.identifier}
        width={16}
        height={16}
      />
    )}
  </span>
);

// A row: the picture, the name in its own direction, and a second line with
// the first state that applies, else the platform (data-model.md). Collapsed,
// the picture alone, named by the channel.
//
// The main button is the row's checkbox, checked while the channel's posts
// show. A hidden row greys only its picture and sets its name in text-muted,
// so its text keeps AA; a row that can't change keeps today's opacity-50 on
// its picture, its name and its Check (C25).
const ChannelRow: FC<{
  channel: Channel;
  collapsed: boolean;
  checked: boolean;
  usable: boolean;
  /** the enabled channels fill the plan, MenuComponent's tooltip condition */
  atPlanLimit: boolean;
  onToggle: () => void;
  /** the ⋯ menu, between the row's actions and its Check */
  menu?: ReactNode;
}> = ({ channel, collapsed, checked, usable, atPlanLimit, onToggle, menu }) => {
  const t = useT();
  const router = useRouter();
  const reconnect = useReconnectChannel();
  const disconnected = !channel.disabled && !!channel.refreshNeeded;
  const needsSetup =
    !channel.disabled && !channel.refreshNeeded && !!channel.inBetweenSteps;
  const overPlan = !!channel.disabled && atPlanLimit;
  const toggle = () => usable && onToggle();

  return (
    <div
      className={clsx(
        'flex items-center gap-[6px] min-h-[52px] mobile:min-h-[56px] rounded-[10px] hover:bg-boxHover transition-colors',
        collapsed ? 'justify-center' : 'px-[8px]'
      )}
    >
      {/* aria-disabled, not disabled, keeps a disabled row in the Tab order,
          so its reason can be reached */}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={!usable}
        onClick={toggle}
        {...(collapsed
          ? {
              'aria-label': channel.name,
              'data-tooltip-id': 'tooltip',
              'data-tooltip-content': channel.name,
            }
          : overPlan
          ? {
              'data-tooltip-id': 'tooltip',
              'data-tooltip-content': t(
                'channel_disabled_upgrade_plan',
                'This channel is disabled, please upgrade your plan to enable it.'
              ),
            }
          : {})}
        className={clsx(
          'flex items-center gap-[12px] py-[8px] rounded-[8px] text-start coarse:min-h-[44px] coarse:min-w-[44px]',
          !collapsed && 'flex-1 min-w-0',
          FOCUS_RING
        )}
      >
        <ChannelPicture
          channel={channel}
          className={clsx(!checked && 'grayscale', !usable && 'opacity-50')}
        />
        {!collapsed && (
          <span className="flex-1 min-w-0 flex flex-col gap-[1px]">
            <bdi
              className={clsx(
                'text-[14px] font-[500] truncate',
                checked ? 'text-ink' : 'text-muted',
                !usable && 'opacity-50'
              )}
            >
              {channel.name}
            </bdi>
            <span
              className={clsx(
                'text-[12px] truncate',
                disconnected || needsSetup ? 'text-error' : 'text-muted'
              )}
            >
              {/* over the plan only at its limit; under it, the channel was
                  disabled by hand from its ⋯ menu */}
              {overPlan
                ? t('channel_disabled_over_plan', 'Disabled · over your plan')
                : channel.disabled
                ? t('channel_disabled', 'Channel Disabled')
                : disconnected
                ? t('channel_disconnected', 'Disconnected')
                : needsSetup
                ? t('channel_needs_setup', 'Needs setup')
                : platformLabel(channel.identifier)}
            </span>
          </span>
        )}
      </button>
      {!collapsed && disconnected && (
        <button
          type="button"
          onClick={reconnect(channel)}
          className={ROW_ACTION}
        >
          {t('reconnect', 'Reconnect')}
        </button>
      )}
      {!collapsed && needsSetup && (
        <button
          type="button"
          onClick={() =>
            router.push(
              `/launches?added=${channel.identifier}&continue=${channel.id}`
            )
          }
          className={ROW_ACTION}
        >
          {t('finish_setup', 'Finish setup')}
        </button>
      )}
      {!collapsed && menu}
      {!collapsed && (
        <span className={clsx('flex', !usable && 'opacity-50')}>
          <Check value={checked} onChange={toggle} />
        </span>
      )}
    </div>
  );
};

// A row a mouse or a held finger carries to a customer, as MenuComponent's
// was. Rendered only with onMoveToCustomer, so a page without DNDProvider
// never calls useDrag (C16).
const DraggableChannel: FC<{ id: string; children: ReactNode }> = ({
  id,
  children,
}) => {
  const [, drag] = useDrag(() => ({
    type: 'menu',
    item: { id },
  }));
  // a connector returns an element, which React 19's ref types refuse
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      drag(element);
    },
    [drag]
  );
  return <div ref={attach}>{children}</div>;
};

// A customer's group, header and rows, or the channels with no customer, ''
// (C27), taking a dropped channel as MenuGroupComponent's group did (C16).
const CustomerDropZone: FC<{
  customerId: string;
  onMoveToCustomer: (channelId: string, customerId: string) => void;
  children: ReactNode;
}> = ({ customerId, onMoveToCustomer, children }) => {
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: 'menu',
      drop: (item: { id: string }) => onMoveToCustomer(item.id, customerId),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
      }),
    }),
    [customerId, onMoveToCustomer]
  );
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      drop(element);
    },
    [drop]
  );
  return (
    <div
      ref={attach}
      className={clsx(
        'rounded-[10px]',
        isOver && 'bg-brandSoft ring-1 ring-inset ring-brand'
      )}
    >
      {children}
    </div>
  );
};

// A customer's channels, under a header that opens and closes them. Whether
// it's open is kept under '<name>_isOpen', as the calendar always has, so
// people's choices carry over and the three pages share them (R5). Beside the
// chevron, today's rename pencil when the page passes onRename, and the
// customer's tick over its usable channels: on, off or mixed.
const CustomerGroup: FC<{
  customer: { id: string; name: string };
  count: number;
  collapsed: boolean;
  checked: boolean | 'mixed';
  /** no usable channel to tick */
  disabled: boolean;
  onToggle: () => void;
  onRename?: () => void;
  children: ReactNode;
}> = ({
  customer,
  count,
  collapsed,
  checked,
  disabled,
  onToggle,
  onRename,
  children,
}) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(
    !!+(localStorage.getItem(customer.name + '_isOpen') || '1')
  );
  const changeOpenClose = () => {
    setIsOpen(!isOpen);
    localStorage.setItem(customer.name + '_isOpen', isOpen ? '0' : '1');
  };

  return (
    <div
      role="group"
      aria-label={customer.name}
      className="flex flex-col gap-[2px]"
    >
      <div className="group flex items-center gap-[4px]">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={changeOpenClose}
          {...(collapsed
            ? {
                'aria-label': customer.name,
                'data-tooltip-id': 'tooltip',
                'data-tooltip-content': customer.name,
              }
            : {})}
          className={clsx(
            'flex-1 min-w-0 flex items-center gap-[8px] min-h-[36px] coarse:min-h-[44px] coarse:min-w-[44px] px-[4px] rounded-[8px] text-start',
            collapsed && 'justify-center',
            FOCUS_RING
          )}
        >
          {!collapsed && (
            // down when open; closed, it points the way the page reads
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
              className={clsx(
                'flex-none text-muted transition-transform',
                !isOpen && '-rotate-90 rtl:rotate-90'
              )}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
          <span
            className={clsx(
              'w-[8px] h-[8px] rounded-full flex-none',
              customerHue(customer.name)
            )}
          />
          {!collapsed && (
            <>
              <bdi className="text-[13px] font-[600] text-inkSoft truncate">
                {customer.name}
              </bdi>
              <span className="text-[12px] text-muted">{count}</span>
            </>
          )}
        </button>
        {!collapsed && onRename && (
          <button
            type="button"
            aria-label={t('edit_group_name', 'Edit group name')}
            onClick={onRename}
            className={clsx(
              'flex-none flex items-center justify-center w-[28px] h-[28px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] text-muted hover:text-brandText opacity-0 group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100 transition-opacity',
              FOCUS_RING
            )}
          >
            <PencilIcon size={14} aria-hidden="true" />
          </button>
        )}
        {!collapsed && (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={customer.name}
            disabled={disabled}
            onClick={onToggle}
            className={clsx(
              'flex-none flex items-center justify-center w-[28px] h-[28px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] disabled:opacity-50',
              FOCUS_RING
            )}
          >
            {/* the look of the rows' Check, with a dash for mixed */}
            <span
              className={clsx(
                'flex border rounded-[6px] w-[20px] h-[20px] justify-center items-center transition-colors',
                checked ? 'bg-brand border-brand' : 'border-muted'
              )}
            >
              {checked === 'mixed' ? (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="text-white"
                >
                  <path d="M6 12h12" />
                </svg>
              ) : (
                checked && <CheckmarkIcon className="text-white" />
              )}
            </span>
          </button>
        )}
      </div>
      <div className={clsx('flex flex-col gap-[2px]', !isOpen && 'hidden')}>
        {children}
      </div>
    </div>
  );
};

/**
 * The channel list Calendar, Samy and Analytics share
 * (contracts/channel-panel.md): a header with the count, + and the rail's or
 * the sheet's control, a hint, a search past six channels, then the channels
 * with no customer and each customer's group, in `orderChannels` order.
 *
 * It draws its own header, because `SplitPanel` draws none (C6), and keeps
 * only its own state: the search, which groups are open, and the + menu. The
 * page keeps the selection.
 */
export const ChannelPanel: FC<{
  mode: PanelMode;
  /** the page's `useIntegrationList()` data */
  channels: Channel[];
  /** the ids whose posts show, or null for all */
  selected: string[] | null;
  /** the ids that show next, or null once every usable channel does (C5) */
  onChange: (selected: string[] | null) => void;
  /** the row's ⋯ menu */
  rowMenu?: (channel: Channel) => ReactNode;
  /** a channel dropped on a customer, '' for none; enables the drag (C16) */
  onMoveToCustomer?: (channelId: string, customerId: string) => void;
  /** shows the pencil on a customer's header */
  onRenameCustomer?: (customer: { id: string; name: string }) => void;
  /** refreshes the list after Add Channel or Invite a customer */
  update: () => void;
  /** the rail's pictures-only state; never the sheet */
  collapsed?: boolean;
  onToggleCollapse: () => void;
  /** closes the sheet */
  onDone: () => void;
}> = ({
  mode,
  channels,
  selected,
  onChange,
  rowMenu,
  onMoveToCustomer,
  onRenameCustomer,
  update,
  collapsed = false,
  onToggleCollapse,
  onDone,
}) => {
  const t = useT();
  const user = useUser();
  const add = useAddProvider(update);
  const invite = useAddProvider(update, true);
  const [search, setSearch] = useState('');
  const ordered = useMemo(() => orderChannels(channels), [channels]);

  const hints: Record<PanelMode, string> = {
    calendar: t('channel_hint_calendar', 'Untick a channel to hide its posts.'),
  };

  const atPlanLimit =
    channels.filter((channel) => !channel.disabled).length ===
    user?.totalChannels;
  const usable = (channel: Channel) => isUsable(channel, mode);
  // A channel that can't be ticked always shows (C5).
  const shows = (channel: Channel) =>
    !usable(channel) || !selected || selected.includes(channel.id);
  const hiding = channels.some((channel) => !shows(channel));
  // The page's next selection: null once every channel shows, else the ids
  // that do, every disabled one's included, even one the array was missing.
  const select = (next: (channel: Channel) => boolean) => {
    const shown = channels.filter(
      (channel) => !usable(channel) || next(channel)
    );
    onChange(
      shown.length === channels.length ? null : shown.map(({ id }) => id)
    );
  };

  // Past six channels a search helps find one (FR-006). It matches a channel's
  // name, its platform in the page's language or its customer, so a matching
  // customer shows all its channels.
  const searchable = !collapsed && channels.length > 6;
  const query = searchable ? search.trim().toLowerCase() : '';
  const groups = ordered
    .map((group) => ({
      ...group,
      // a customer's tick covers all its usable channels, whatever shows
      members: group.channels.filter(usable),
      channels: group.channels.filter(
        (channel) =>
          !query ||
          [
            channel.name,
            platformLabel(channel.identifier),
            group.customer?.name || '',
          ].some((text) => text.toLowerCase().includes(query))
      ),
    }))
    .filter((group) => group.channels.length);

  const rows = (list: Channel[]) =>
    list.map((channel) => {
      const row = (
        <ChannelRow
          key={channel.id}
          channel={channel}
          collapsed={collapsed}
          checked={shows(channel)}
          usable={usable(channel)}
          atPlanLimit={atPlanLimit}
          onToggle={() =>
            select((other) =>
              other.id === channel.id ? !shows(other) : shows(other)
            )
          }
          menu={rowMenu?.(channel)}
        />
      );
      return onMoveToCustomer ? (
        <DraggableChannel key={channel.id} id={channel.id}>
          {row}
        </DraggableChannel>
      ) : (
        row
      );
    });
  // a group, taking dropped channels under the calendar
  const dropZone = (customerId: string, group: ReactNode) =>
    onMoveToCustomer ? (
      <CustomerDropZone
        key={customerId}
        customerId={customerId}
        onMoveToCustomer={onMoveToCustomer}
      >
        {group}
      </CustomerDropZone>
    ) : (
      group
    );

  return (
    <div className="flex flex-col gap-[8px] select-none">
      {/* The header, the hint and the search stay put while the groups scroll
          under them (C28), so the block sits above everything in a row,
          the badge's z-10 included. */}
      <div className="sticky top-0 z-20 bg-newBgColorInner flex flex-col gap-[8px] pb-[8px]">
        <div
          className={clsx(
            'flex items-center gap-[4px]',
            collapsed && 'justify-center'
          )}
        >
          {!collapsed && (
            <>
              <h2 className="text-[15px] mobile:text-[17px] font-[600] text-ink">
                {t('channels', 'Channels')}
              </h2>
              <span className="text-[12px] font-[600] text-muted bg-surface2 rounded-full px-[8px] py-[1px]">
                {channels.length}
              </span>
              <PostActionsMenu
                label={t('add_a_channel', 'Add a channel')}
                triggerClassName={clsx('ms-auto', ICON_BUTTON)}
                trigger={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                }
                actions={[
                  {
                    key: 'add',
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                        className="text-muted"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    ),
                    label: t('add_channel', 'Add Channel'),
                    hint: t(
                      'add_channel_hint',
                      'Connect an account you can log in to'
                    ),
                    onClick: add,
                  },
                  {
                    key: 'invite',
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="text-muted"
                      >
                        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                      </svg>
                    ),
                    label: t('invite_a_customer', 'Invite a customer'),
                    hint: t(
                      'invite_a_customer_hint',
                      'Copies a link they open to connect their own account. It works for 1 hour.'
                    ),
                    onClick: invite,
                  },
                ]}
              />
            </>
          )}
          {/* the rail's; the sheet closes with Done */}
          <button
            type="button"
            aria-label={
              collapsed ? t('expand', 'Expand') : t('collapse', 'Collapse')
            }
            onClick={onToggleCollapse}
            className={clsx('mobile:hidden', ICON_BUTTON)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="rtl:-scale-x-100"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M15 4v16" />
              <path d={collapsed ? 'M10 10l-2 2 2 2' : 'M8 10l2 2-2 2'} />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDone}
            className={clsx(
              'hidden mobile:flex items-center h-[36px] coarse:h-[44px] px-[12px] rounded-[8px] bg-quiet border border-line hover:bg-surface2 transition-colors text-ink text-[13px] font-[600]',
              FOCUS_RING
            )}
          >
            {t('done', 'Done')}
          </button>
        </div>
        {!collapsed && channels.length > 0 && (
          <p className="text-[12px] text-muted">
            {hints[mode]}
            {hiding && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className={clsx(
                    'inline-flex items-center coarse:min-h-[44px] rounded-[4px] font-[600] text-brandText hover:underline underline-offset-2',
                    FOCUS_RING
                  )}
                >
                  {t('show_all', 'Show all')}
                </button>
              </>
            )}
          </p>
        )}
        {searchable && (
          <div className="relative">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="absolute start-[12px] top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            {/* A name typed in either script keeps its own direction. Empty,
                the field has no letter to take one from, and dir="auto" would
                turn an Arabic placeholder left to right, so it follows the
                page until something is typed. The padding is the icon's on
                both sides, because typed text may run either way. */}
            <input
              type="search"
              dir="auto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_channels', 'Search channels')}
              aria-label={t('search_channels', 'Search channels')}
              className={clsx(
                'w-full h-[36px] coarse:h-[44px] px-[34px] rounded-[8px] bg-newBgColorInner border border-line text-[14px] coarse:text-[16px] text-ink placeholder:text-muted outline-none placeholder-shown:[direction:inherit]',
                FOCUS_RING
              )}
            />
          </div>
        )}
      </div>
      {!collapsed && channels.length === 0 && (
        <div className="flex-1 max-h-[500px] justify-center items-center flex">
          <div className="flex flex-col gap-[12px] text-center">
            <NoChannelsIllustration className="mx-auto w-full h-auto" />
            <div className="font-[600] text-[20px]">
              {t('no_channels', 'No channels yet')}
            </div>
            <div className="text-[14px]">{t('connect_your_accounts')}</div>
          </div>
        </div>
      )}
      {groups.map(({ customer, members, channels: list }) => {
        if (!customer) {
          return dropZone(
            '',
            <div key="" className="flex flex-col gap-[2px]">
              {rows(list)}
            </div>
          );
        }
        const shown = members.filter(shows).length;
        const checked =
          shown === members.length ? true : shown ? 'mixed' : false;
        return dropZone(
          customer.id,
          <CustomerGroup
            key={customer.id}
            customer={customer}
            count={list.length}
            collapsed={collapsed}
            checked={checked}
            disabled={!members.length}
            onToggle={() =>
              select((channel) =>
                members.includes(channel) ? checked !== true : shows(channel)
              )
            }
            onRename={onRenameCustomer && (() => onRenameCustomer(customer))}
          >
            {rows(list)}
          </CustomerGroup>
        );
      })}
      {!!query && !groups.length && (
        <p className="py-[24px] px-[16px] text-center text-[13px] text-muted">
          {t('no_channel_matches', 'No channel matches')}
        </p>
      )}
    </div>
  );
};
