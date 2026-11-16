'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { DeveloperComponent } from '@gitroom/frontend/components/developer/developer.component';
import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';
import {
  SWITCH_GROUP,
  SWITCH_OPTION,
  SWITCH_OPTION_IDLE,
  SWITCH_OPTION_ON,
} from '@gitroom/frontend/components/ui/pick.controls';

export const AppsComponent: FC<{ canManageApps: boolean }> = ({
  canManageApps,
}) => {
  const t = useT();
  const [subTab, setSubTab] = useState<'apps' | 'approved_apps'>('apps');
  const current = canManageApps ? subTab : 'approved_apps';

  return (
    <div className="flex flex-col gap-[20px]">
      <h3 className="text-[20px] font-[600]">{t('apps', 'Apps')}</h3>
      {canManageApps && (
        <div className={clsx(SWITCH_GROUP, 'self-start')}>
          {(['apps', 'approved_apps'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={clsx(
                SWITCH_OPTION,
                current === tab ? SWITCH_OPTION_ON : SWITCH_OPTION_IDLE
              )}
              onClick={() => setSubTab(tab)}
            >
              {tab === 'apps'
                ? t('apps', 'Apps')
                : t('approved_apps', 'Approved Apps')}
            </button>
          ))}
        </div>
      )}
      {current === 'apps' && <DeveloperComponent />}
      {current === 'approved_apps' && <ApprovedAppsComponent />}
    </div>
  );
};
