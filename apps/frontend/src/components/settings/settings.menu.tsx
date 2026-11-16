'use client';

import { FC, Ref, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { capitalize } from 'lodash';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import {
  MOBILE_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useLogout } from '@gitroom/frontend/components/layout/logout.component';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import {
  GROUP_LABEL,
  LIST_ROW_IDLE,
  LIST_ROW_ON,
  SplitPanel,
} from '@gitroom/frontend/components/ui/split.panel';
import {
  CodeIcon,
  ExitIcon,
  GridIcon,
  IconProps,
  LayersIcon,
  LinkIcon,
  PenIcon,
  PlugIcon,
  PuzzleIcon,
  RssIcon,
  SlidersIcon,
  UsersIcon,
} from '@gitroom/frontend/components/ui/icons';

const ICONS: Record<string, FC<IconProps>> = {
  global_settings: SlidersIcon,
  teams: UsersIcon,
  autopost: RssIcon,
  sets: LayersIcon,
  signatures: PenIcon,
  api: CodeIcon,
  webhooks: LinkIcon,
  plugs: PlugIcon,
  apps: GridIcon,
  integrations: PuzzleIcon,
};

// A row of the menu, a tab or Log out: the open tab has the selected tint
// Brands' list gives its open brand; the others show a hover. At 1025px and
// below the rows line up in one sideways strip.
const MenuRow: FC<{
  icon: FC<IconProps>;
  label: string;
  /** A tab says whether it is open; Log out says nothing. */
  current?: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}> = ({ icon: Icon, label, current, onClick, buttonRef }) => (
  <button
    ref={buttonRef}
    type="button"
    aria-pressed={current}
    onClick={onClick}
    className={clsx(
      'flex items-center gap-[10px] min-h-[36px] coarse:min-h-[44px] px-[10px] rounded-[8px] text-[14px] text-start cursor-pointer transition-colors mobile:shrink-0 mobile:whitespace-nowrap mobile:px-[14px]',
      current ? LIST_ROW_ON : LIST_ROW_IDLE,
      current
        ? 'text-ink font-[600]'
        : 'text-inkSoft font-[500] hover:text-ink',
      FOCUS_RING
    )}
  >
    <Icon
      size={18}
      aria-hidden="true"
      className={current ? 'text-brand' : 'text-muted'}
    />
    {label}
  </button>
);

/**
 * Settings' menu: each tab of `list` in three groups, Global settings and
 * Teams with no label, then Posting, then Developers, and under them Log out,
 * the lifetime plan and the version. Which tabs the list holds (role, plan,
 * flags) stays with the page. A side rail in SplitPanel above 1025px; at
 * 1025px and below one sideways strip with no group labels, at the top of
 * the page.
 */
export const SettingsMenu: FC<{
  list: { tab: string; label: string }[];
  tab: string;
  onChange: (tab: string) => void;
  showLogout: boolean;
}> = ({ list, tab, onChange, showLogout }) => {
  const t = useT();
  const user = useUser();
  const { billingEnabled } = useVariables();
  const logout = useLogout();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const version = process.env.NEXT_PUBLIC_VERSION;

  const groups = [
    { tabs: ['global_settings', 'teams'] },
    {
      label: t('settings_group_posting', 'Posting'),
      tabs: ['autopost', 'plugs', 'sets', 'signatures'],
    },
    {
      label: t('developers', 'Developers'),
      tabs: ['api', 'webhooks', 'apps', 'integrations'],
    },
  ];

  // The strip can open with the address's tab past the screen's edge, so it
  // starts scrolled to it, when it overflows. It measures the nav, the strip
  // itself: a row's group is mobile:contents and has no box. It runs again on
  // isMobile, which turns true only after the first render, when the strip
  // replaces the wide screen's rail.
  const nav = useRef<HTMLElement>(null);
  const open = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const strip = nav.current;
    if (isMobile && strip && strip.scrollWidth > strip.clientWidth) {
      open.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [isMobile]);

  const menu = (
    <>
      <nav
        ref={nav}
        aria-label={t('settings', 'Settings')}
        className="flex flex-col gap-[2px] pt-[12px] flex-1 mobile:flex-row mobile:pt-0 mobile:gap-[8px] mobile:overflow-x-auto mobile:pb-[6px] scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor"
      >
        {groups.map(({ label, tabs }) => {
          const rows = tabs.flatMap((key) =>
            list.filter((item) => item.tab === key)
          );
          if (!rows.length) {
            return null;
          }
          return (
            <div
              key={tabs[0]}
              role={label ? 'group' : undefined}
              aria-label={label}
              className="flex flex-col gap-[2px] mobile:contents"
            >
              {label && (
                <div
                  aria-hidden="true"
                  className={clsx(GROUP_LABEL, 'mobile:hidden')}
                >
                  {label}
                </div>
              )}
              {rows.map((item) => (
                <MenuRow
                  key={item.tab}
                  buttonRef={item.tab === tab ? open : undefined}
                  icon={ICONS[item.tab]}
                  label={item.label}
                  current={item.tab === tab}
                  onClick={() => onChange(item.tab)}
                />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="flex flex-col gap-[2px] border-t border-line pt-[10px] mt-[12px] mobile:mt-[8px]">
        {showLogout && (
          <MenuRow
            icon={ExitIcon}
            label={t('log_out', 'Log out')}
            onClick={logout}
          />
        )}
        {billingEnabled && user?.isLifetime && (
          <div className="text-[12px] text-muted px-[10px]">
            {t('lifetime_tier', '{{tier}} tier', {
              tier: capitalize(user?.tier?.current || ''),
            })}
          </div>
        )}
        {!!version && (
          <div className="font-mono text-[11.5px] text-muted px-[10px] py-[4px]">
            {t('settings_version', 'Version {{version}}', {
              version: version.slice(0, 7),
            })}
          </div>
        )}
      </div>
    </>
  );

  return isMobile ? (
    <div className="bg-newBgColorInner p-[12px]">{menu}</div>
  ) : (
    <SplitPanel width="w-[260px]" label={t('settings', 'Settings')}>
      {menu}
    </SplitPanel>
  );
};
