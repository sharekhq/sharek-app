'use client';

import {
  ComponentProps,
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CalendarWeekProvider,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import { Filters } from '@gitroom/frontend/components/launches/filters';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import { useUser } from '../layout/user.context';
import { Menu } from '@gitroom/frontend/components/launches/menu/menu';
import { useSearchParams } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';
import { Calendar } from './calendar';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { CalendarDragLayer } from '@gitroom/frontend/components/launches/calendar.drag.layer';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import useCookie from 'react-use-cookie';
import { Onboarding } from '@gitroom/frontend/components/onboarding/onboarding';
import { ChannelsAfterPayment } from '@gitroom/frontend/components/layout/check.payment';
import { HubspotInstalled } from '@gitroom/frontend/components/launches/hubspot.installed';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { Button } from '@gitroom/react/form/button';
import {
  ChannelPanel,
  compareChannels,
  isUsable,
  useReconnectChannel,
} from '@gitroom/frontend/components/launches/channel.panel';

const EditGroupNameModal: FC<{
  name: string;
  id: string;
  close: () => void;
  resolve: (value: string) => void;
}> = (props) => {
  const t = useT();
  const { close, name, id, resolve } = props;
  const fetch = useFetch();
  const toaster = useToaster();
  const [groupName, setGroupName] = useState<string>(name);
  const save = useCallback(async () => {
    const response = await fetch(`/integrations/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: groupName }),
    });
    if (!response.ok) {
      const { message } = await response.json().catch(() => ({} as any));
      toaster.show(
        (Array.isArray(message) ? message[0] : message) ||
          t('could_not_save_group', 'Could not save the group.'),
        'warning'
      );
      return;
    }
    resolve(groupName);
    close();
  }, [groupName, id]);
  return (
    <div>
      <Input
        name="name"
        disableForm={true}
        label={t('group_name', 'Name')}
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
      />
      <Button onClick={save} className="mt-[16px]">
        {t('save', 'Save')}
      </Button>
    </div>
  );
};

// The calendar's channel list: ChannelPanel in calendar mode, its ticks the
// calendar's selection. A channel disabled while it was hidden goes back into
// the selection, since a disabled channel's posts always show and its row
// can't be ticked (C5, C19).
const CalendarChannels: FC<
  Omit<ComponentProps<typeof ChannelPanel>, 'mode' | 'selected' | 'onChange'>
> = (props) => {
  const { channels } = props;
  const { selectedChannels, setSelectedChannels } = useCalendar();
  useEffect(() => {
    if (!selectedChannels) {
      return;
    }
    const missing = channels
      .filter(
        (channel) =>
          !isUsable(channel, 'calendar') &&
          !selectedChannels.includes(channel.id)
      )
      .map(({ id }) => id);
    if (missing.length) {
      setSelectedChannels([...selectedChannels, ...missing]);
    }
  }, [channels, selectedChannels, setSelectedChannels]);
  return (
    <ChannelPanel
      {...props}
      mode="calendar"
      selected={selectedChannels}
      onChange={setSelectedChannels}
    />
  );
};
export const LaunchesComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const search = useSearchParams();
  const toast = useToaster();
  const fireEvents = useFireEvents();
  const t = useT();
  const modal = useModals();
  const reconnectChannel = useReconnectChannel();
  const [reload, setReload] = useState(false);
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  const [channelsOpen, setChannelsOpen] = useState(false);
  const railCollapsed = collapseMenu === '1' && !channelsOpen;
  const { isLoading, data: integrations, mutate } = useIntegrationList();

  const totalNonDisabledChannels = useMemo(() => {
    return (
      integrations?.filter((integration: any) => !integration.disabled)
        ?.length || 0
    );
  }, [integrations]);
  const changeItemGroup = useCallback(
    async (id: string, group: string) => {
      mutate(
        integrations.map((integration: any) => {
          if (integration.id === id) {
            return {
              ...integration,
              customer: {
                id: group,
              },
            };
          }
          return integration;
        }),
        false
      );
      await fetch(`/integrations/${id}/group`, {
        method: 'PUT',
        body: JSON.stringify({
          group,
        }),
      });
      mutate();
    },
    [integrations]
  );
  const sortedIntegrations = useMemo(
    () => [...integrations].sort(compareChannels),
    [integrations]
  );
  const update = useCallback(async (shouldReload: boolean) => {
    if (shouldReload) {
      setReload(true);
    }
    await mutate();
    if (shouldReload) {
      setReload(false);
    }
  }, []);
  const renameCustomer = useCallback(
    async (customer: { id: string; name: string }) => {
      const val: string | undefined = await new Promise((resolve) => {
        modal.openModal({
          title: t('edit_group_name', 'Edit group name'),
          onClose: () => resolve(undefined),
          children: (close) => (
            <EditGroupNameModal
              name={customer.name}
              id={customer.id}
              close={close}
              resolve={resolve}
            />
          ),
        });
      });
      if (!val) {
        return;
      }
      await mutate();
      toast.show(t('group_updated', 'Group Updated'), 'success');
    },
    [mutate, modal, toast, t]
  );
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (search.get('msg')) {
      toast.show(search.get('msg')!, 'success');
      window?.opener?.postMessage(
        {
          msg: search.get('msg')!,
          success: false,
        },
        '*'
      );
    }
    if (search.get('added')) {
      fireEvents('channel_added');
      window?.opener?.postMessage(
        {
          msg: t('channel_added', 'Channel added'),
          success: true,
        },
        '*'
      );
    }
    if (window.opener) {
      window.close();
    }
  }, []);
  if (isLoading || reload) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  // @ts-ignore
  return (
    // One box in the shell's row: the provider renders an empty box for its
    // preview portal after its children, which the row's 1px gap would set
    // apart as a strip down the end edge.
    <div className="flex flex-1 min-w-0">
      <DNDProvider>
        {/* One preview for every drag under the provider — the backends draw
          either a filled rectangle or nothing at all on their own. */}
        <CalendarDragLayer />
        <Onboarding />
        <ChannelsAfterPayment integrations={integrations} />
        <HubspotInstalled />
        <CalendarWeekProvider integrations={sortedIntegrations}>
          <div className="flex flex-1 min-w-0 gap-[1px]">
            {/* min-w-0: without it this flex-1 column keeps min-width:auto and is
            pinned to the filter bar's min-content (847px), which starves the
            channels rail at every width below ~1220. */}
            <div className="bg-newBgColorInner flex-1 min-w-0 flex-col flex p-[20px] mobile:p-[12px] gap-[12px] mobile:min-h-[600px]">
              <Filters
                onOpenChannels={() => setChannelsOpen(true)}
                channelsOpen={channelsOpen}
                update={() => update(true)}
              />
              <div className="flex-1 flex">
                <Calendar />
              </div>
            </div>
            <SplitPanel
              open={channelsOpen}
              onClose={() => setChannelsOpen(false)}
              collapsed={railCollapsed}
              width="w-[288px]"
              label={t('channels', 'Channels')}
            >
              <CalendarChannels
                channels={sortedIntegrations}
                rowMenu={(channel) => {
                  // the full channel, for what only the menu reads
                  const integration = sortedIntegrations.find(
                    ({ id }) => id === channel.id
                  );
                  return (
                    <Menu
                      label={t('channel_menu', 'Channel menu')}
                      canChangeProfilePicture={integration.changeProfilePicture}
                      canChangeNickName={integration.changeNickName}
                      refreshChannel={reconnectChannel}
                      mutate={mutate}
                      onChange={update}
                      id={integration.id}
                      canEnable={
                        user?.totalChannels! > totalNonDisabledChannels &&
                        integration.disabled
                      }
                      canDisable={!integration.disabled}
                    />
                  );
                }}
                onMoveToCustomer={changeItemGroup}
                onRenameCustomer={renameCustomer}
                update={() => update(true)}
                collapsed={railCollapsed}
                onToggleCollapse={() =>
                  setCollapseMenu(collapseMenu === '1' ? '0' : '1')
                }
                onDone={() => setChannelsOpen(false)}
              />
            </SplitPanel>
          </div>
        </CalendarWeekProvider>
      </DNDProvider>
    </div>
  );
};
