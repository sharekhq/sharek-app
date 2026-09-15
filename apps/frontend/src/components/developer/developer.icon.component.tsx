'use client';

import { FC } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { DeveloperComponent } from '@gitroom/frontend/components/developer/developer.component';

export const DeveloperIconComponent: FC = () => {
  const modals = useModals();
  const t = useT();

  // A button rather than a div with a key handler: it is the only control in
  // this row that was neither keyboard-reachable nor 44px, and the row's
  // feedback control already answers both by being a real button. The name it
  // used to render as text costs 81px on a 390px screen, which is most of why
  // the paywall header scrolled sideways.
  return (
    <button
      type="button"
      aria-label={t('developer', 'Developer')}
      className="hover:text-newTextColor focus-visible:ring-2 focus-visible:ring-brand coarse:min-w-[44px] coarse:min-h-[44px] coarse:flex coarse:items-center coarse:justify-center"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('developer', 'Developer')}
      onClick={() => {
        modals.openModal({
          title: t('developer', 'Developer'),
          size: '80%',
          children: <DeveloperComponent />,
        });
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 8L5 12L9 16M15 8L19 12L15 16M13.5 6.5L10.5 17.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};
