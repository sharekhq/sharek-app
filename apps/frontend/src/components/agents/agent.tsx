'use client';

import { createContext, FC, useMemo, useRef, useState, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import useCookie from 'react-use-cookie';
import { uniq } from 'lodash';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ChatsPanel } from '@gitroom/frontend/components/agents/agent.chats';
import {
  EACH_BRAND,
  NO_BRAND,
} from '@gitroom/frontend/components/brands/brand.menu';
import {
  Brand,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  ChannelPanel,
  isUsable,
} from '@gitroom/frontend/components/launches/channel.panel';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

export const PropertiesContext = createContext({
  properties: [],
  // the brand chip's choice, which Samy gets beside the channels: a brand's
  // id, NO_BRAND or EACH_BRAND; none while the chip waits for one
  brand: undefined as string | undefined,
  pickBrand: (() => {}) as (choice: string) => void,
  // the open chat, which the chat header reads from CopilotKit and sets here,
  // so a chat started at /agents/new has its id too (C21)
  threadId: '',
  setThreadId: (() => {}) as (id: string) => void,
  // whether the chats panel is hidden for the visit on a wide screen
  chatsHidden: false,
  // the chats panel's Hide chats on a wide screen, and its Close on the drawer
  hideChats: () => {},
  closeChats: () => {},
  // the chat header's Chats, and the message box's "Samy will use"
  openChats: () => {},
  openChannels: () => {},
});

// The brands the picked channels are in, in the brands' order. A channel in
// no brand is in none (FR-017).
export const brandsAmong = (brands: Brand[], channels: Integrations[]) =>
  brands.filter((brand) =>
    channels.some((channel) => channel.customer?.id === brand.id)
  );

/**
 * The brand chip's choice (FR-017, FR-023; contracts/pages-ui.md part 2): the
 * user's own pick while the list still offers it; else the one brand among
 * the picked channels, each channel's brand when they span more, or No brand
 * when none of them is in one; with nothing picked, the organization's one
 * brand, or nothing while it has several, so Samy asks. An organization with
 * no brands has nothing to choose.
 */
const chooseBrand = (
  brands: Brand[] | undefined,
  channels: Integrations[],
  pick?: string
) => {
  if (!brands?.length) {
    return undefined;
  }
  const among = brandsAmong(brands, channels);
  const offered =
    pick === NO_BRAND ||
    (pick === EACH_BRAND
      ? among.length > 1
      : brands.some((brand) => brand.id === pick));
  if (offered) {
    return pick;
  }
  if (channels.length) {
    return among.length > 1 ? EACH_BRAND : among[0]?.id ?? NO_BRAND;
  }
  return brands.length === 1 ? brands[0].id : undefined;
};

/**
 * Samy's page (contracts/pages-ui.md): the chats at the start, the chat, then
 * the shared channel list in samy mode at the end. At 1025px and below the
 * chats open as SplitPanel's start-side drawer, from the chat header's Chats,
 * and the channels as its bottom sheet, from the message box's summary.
 */
export const Agent: FC<{ children: ReactNode }> = ({ children }) => {
  const t = useT();
  const { data, mutate } = useIntegrationList();
  // The picks outlive a chat switch. Samy gets the list's usable channels
  // among them, so a pick the list then reports disconnected, needing setup
  // or disabled drops out of what is sent, the summary and the ticks (C20).
  const [ids, setIds] = useState<string[]>([]);
  const properties = useMemo(
    () =>
      data.filter(
        (channel: Integrations) =>
          ids.includes(channel.id) && isUsable(channel, 'samy')
      ),
    [data, ids]
  );
  const { data: brands } = useBrands();
  // The chip's own pick, with the brands of the picked channels it was made
  // for. It lasts until those change; then the chip chooses again, and the
  // pick doesn't come back with them (FR-023).
  const [brandPick, setBrandPick] = useState<{
    choice: string;
    among: string;
  }>();
  const among = uniq(
    properties.flatMap((channel: Integrations) =>
      channel.customer?.id ? [channel.customer.id] : []
    )
  )
    .sort()
    .join();
  const pick = brandPick?.among === among ? brandPick.choice : undefined;
  if (brandPick && !pick) {
    setBrandPick(undefined);
  }
  const [threadId, setThreadId] = useState('');
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  const [channelsOpen, setChannelsOpen] = useState(false);
  const railCollapsed = collapseMenu === '1' && !channelsOpen;
  // Hide chats lasts for the visit, so it keeps no cookie.
  const [chatsHidden, setChatsHidden] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  // Where the openers put the focus on a wide screen.
  const chats = useRef<HTMLDivElement>(null);
  const channels = useRef<HTMLDivElement>(null);

  // At 1025px and below each opener opens its drawer or sheet. On a wide
  // screen it shows its panel, the chats if hidden and the channel rail
  // expanded as its own Expand does, and puts the focus in it. Showing the
  // chats is flushed first, so the panel is there to take the focus.
  const openChats = () => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setChatsOpen(true);
      return;
    }
    flushSync(() => setChatsHidden(false));
    chats.current?.focus();
  };
  const openChannels = () => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setChannelsOpen(true);
      return;
    }
    if (collapseMenu === '1') {
      setCollapseMenu('0');
    }
    channels.current?.focus();
  };

  return (
    <PropertiesContext.Provider
      value={{
        properties,
        brand: chooseBrand(brands, properties, pick),
        pickBrand: (choice: string) => setBrandPick({ choice, among }),
        threadId,
        setThreadId,
        chatsHidden,
        hideChats: () => setChatsHidden(true),
        closeChats: () => setChatsOpen(false),
        openChats,
        openChannels,
      }}
    >
      {/* Up to 1025px the panels leave the row until opened, so the chat
          takes exactly the column (min-h-0, no floor) and the message box
          always ends on screen. */}
      <div className="flex flex-1 min-w-0 gap-[1px] mobile:flex-col">
        {(!chatsHidden || chatsOpen) && (
          <SplitPanel
            variant="drawer"
            open={chatsOpen}
            onClose={() => setChatsOpen(false)}
            width="w-[272px]"
            label={t('chats', 'Chats')}
          >
            <div ref={chats} tabIndex={-1}>
              <ChatsPanel />
            </div>
          </SplitPanel>
        )}
        <div className="bg-newBgColorInner flex flex-1 min-w-0 mobile:min-h-0">
          {children}
        </div>
        <SplitPanel
          open={channelsOpen}
          onClose={() => setChannelsOpen(false)}
          collapsed={railCollapsed}
          width="w-[288px]"
          label={t('channels', 'Channels')}
        >
          <div ref={channels} tabIndex={-1}>
            <ChannelPanel
              mode="samy"
              channels={data}
              selected={ids}
              onChange={setIds}
              update={mutate}
              collapsed={railCollapsed}
              onToggleCollapse={() =>
                setCollapseMenu(collapseMenu === '1' ? '0' : '1')
              }
              onDone={() => setChannelsOpen(false)}
            />
          </div>
        </SplitPanel>
      </div>
    </PropertiesContext.Provider>
  );
};
