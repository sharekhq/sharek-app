'use client';

import useSWR from 'swr';
import { useCallback, useMemo, useState } from 'react';
import { capitalize, orderBy } from 'lodash';
import clsx from 'clsx';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Select } from '@gitroom/react/form/select';
import { EmptyState } from '@gitroom/frontend/components/ui/empty.state';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { PlugsContext } from '@gitroom/frontend/components/plugs/plugs.context';
import { Plug } from '@gitroom/frontend/components/plugs/plug';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useCookie from 'react-use-cookie';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import {
  SplitPanel,
  SplitPanelToggle,
} from '@gitroom/frontend/components/ui/split.panel';
import {
  useMediaQuery,
  PHONE_QUERY,
} from '@gitroom/react/helpers/use.media.query';
const PlugsEmptyIllustration = () => (
  <svg
    width="132"
    height="108"
    viewBox="0 0 132 108"
    fill="none"
    className="text-muted"
    role="presentation"
  >
    <line x1="66" y1="54" x2="24" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.45" />
    <line x1="66" y1="54" x2="24" y2="80" stroke="currentColor" strokeWidth="2" opacity="0.45" />
    <line x1="66" y1="54" x2="110" y2="54" stroke="currentColor" strokeWidth="2" opacity="0.45" />
    <circle cx="24" cy="28" r="9" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    <circle cx="24" cy="80" r="9" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    <circle cx="110" cy="54" r="9" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    <circle cx="66" cy="54" r="18" className="text-brand" fill="currentColor" />
    <path d="M69 43 L59 56 H65 L63 65 L73 52 H67 Z" fill="#fff" />
  </svg>
);
export const Plugs = () => {
  const fetch = useFetch();
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [refresh, setRefresh] = useState(false);
  const toaster = useToaster();
  const load = useCallback(async () => {
    return (await (await fetch('/integrations/list')).json()).integrations;
  }, []);
  const load2 = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: plugList, isLoading: plugLoading } = useSWR(
    '/integrations/plug/list',
    load2,
    {
      fallbackData: [],
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );
  const { data, isLoading } = useSWR('analytics-list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });

  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  // Phone: the channels rail becomes an off-canvas sheet behind a toggle, and is
  // always fully expanded there (never the desktop icon-collapsed rail).
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const railCollapsed = collapseMenu === '1' && !isPhone;

  const t = useT();

  const sortedIntegrations = useMemo(() => {
    return orderBy(
      data.filter((integration: any) =>
        plugList?.plugs?.some(
          (f: any) => f.identifier === integration.identifier
        )
      ),
      // data.filter((integration) => !integration.disabled),
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [data, plugList]);
  const currentIntegration = useMemo(() => {
    return sortedIntegrations[current];
  }, [current, sortedIntegrations]);
  const currentIntegrationPlug = useMemo(() => {
    const plug = plugList?.plugs?.find(
      (f: any) => f?.identifier === currentIntegration?.identifier
    );
    if (!plug) {
      return null;
    }
    return {
      providerId: currentIntegration.id,
      ...plug,
    };
  }, [currentIntegration, plugList]);

  if (isLoading || plugLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  if (!sortedIntegrations.length && !isLoading) {
    return (
      <div className="bg-newBgColorInner flex flex-1">
        <EmptyState
          illustration={<PlugsEmptyIllustration />}
          title={t('plugs_empty_title', 'Put your channels on autopilot')}
          description={t(
            'plugs_empty_description',
            'Plugs run actions on your channels automatically. Connect X, LinkedIn Page, Threads, or Bluesky to switch them on.'
          )}
          actionLabel={t('connect_a_channel', 'Connect a channel')}
          onAction={() => router.push('/launches')}
        />
      </div>
    );
  }
  return (
    <>
      <SplitPanel
        open={channelsOpen}
        onClose={() => setChannelsOpen(false)}
        collapsed={railCollapsed}
        onToggleCollapse={() =>
          setCollapseMenu(collapseMenu === '1' ? '0' : '1')
        }
        title={t('channels')}
      >
        <div className="flex gap-[12px] flex-col">
          {sortedIntegrations.map((integration, index) => (
            <div
              key={integration.id}
              onClick={() => {
                if (integration.refreshNeeded) {
                  toaster.show(
                    'Please refresh the integration from the calendar',
                    'warning'
                  );
                  return;
                }
                setRefresh(true);
                setTimeout(() => {
                  setRefresh(false);
                }, 10);
                setCurrent(index);
              }}
              className={clsx(
                'flex gap-[8px] items-center justify-center hover:bg-boxHover rounded-e-[8px] coarse:min-h-[44px]',
                currentIntegration.id !== integration.id &&
                  'opacity-20 hover:opacity-100 cursor-pointer'
              )}
            >
              <div
                className={clsx(
                  'relative rounded-full flex justify-center items-center gap-[8px]',
                  integration.disabled && 'opacity-50'
                )}
              >
                {(integration.inBetweenSteps || integration.refreshNeeded) && (
                  <div className="absolute start-0 top-0 w-[39px] h-[46px] cursor-pointer">
                    <div className="bg-error w-[15px] h-[15px] rounded-full start-0 -top-[5px] absolute z-[200] text-[10px] flex justify-center items-center">
                      !
                    </div>
                    <div className="bg-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] w-[39px] h-[46px] start-0 top-0 absolute rounded-full z-[199]" />
                  </div>
                )}
                <ImageWithFallback
                  fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
                  src={integration.picture}
                  className="rounded-[8px]"
                  alt={integration.identifier}
                  width={36}
                  height={36}
                />
                <SafeImage
                  src={`/icons/platforms/${integration.identifier}.png`}
                  className="rounded-[8px] absolute z-10 bottom-[5px] -end-[5px] border border-fifth"
                  alt={integration.identifier}
                  width={18.41}
                  height={18.41}
                />
              </div>
              <div
                className={clsx(
                  'flex-1 whitespace-nowrap text-ellipsis overflow-hidden group-[.sidebar]:hidden',
                  integration.disabled && 'opacity-50'
                )}
              >
                {integration.name}
              </div>
            </div>
          ))}
        </div>
      </SplitPanel>
      {/* min-w-0: the rail is `shrink-0` now that it is a SplitPanel, so this
          column is what has to shrink. Without it, min-width:auto pins it to the
          plug form's min-content and the row overflows instead. Same reason as
          `launches.component.tsx:532`. */}
      <div className="bg-newBgColorInner flex-1 min-w-0 flex-col flex p-[20px] gap-[12px]">
        <SplitPanelToggle onClick={() => setChannelsOpen(true)}>
          {t('channels', 'Channels')}
        </SplitPanelToggle>
        <PlugsContext.Provider value={currentIntegrationPlug}>
          <Plug />
        </PlugsContext.Provider>
      </div>
    </>
  );
};
