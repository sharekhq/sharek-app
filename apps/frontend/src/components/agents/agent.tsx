'use client';

import { createContext, FC, useMemo, useRef, useState, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import useCookie from 'react-use-cookie';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ChatsPanel } from '@gitroom/frontend/components/agents/agent.chats';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  ChannelPanel,
  isUsable,
} from '@gitroom/frontend/components/launches/channel.panel';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

export const PropertiesContext = createContext({
  properties: [],
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
