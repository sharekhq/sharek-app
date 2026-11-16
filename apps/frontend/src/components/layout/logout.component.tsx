'use client';

import React, { FC, useCallback } from 'react';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { setCookie } from '@gitroom/frontend/components/layout/layout.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { resetAnalyticsIdentity } from '@gitroom/react/helpers/posthog';
import { LogoutIcon } from '@gitroom/frontend/components/ui/icons';
export const useLogout = () => {
  const fetch = useFetch();
  const { isSecured } = useVariables();
  const t = useT();

  return useCallback(async () => {
    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_logout',
          'Are you sure you want to logout?'
        ),
        t('yes_logout', 'Yes logout')
      )
    ) {
      if (!isSecured) {
        setCookie('auth', '', -10);
      } else {
        await fetch('/user/logout', {
          method: 'POST',
        });
      }
      resetAnalyticsIdentity();
      window.location.href = '/';
    }
  }, []);
};

export const LogoutComponent: FC<{ isIcon?: boolean }> = ({ isIcon }) => {
  const t = useT();
  const logout = useLogout();
  return (
    <>
      {/* The text variant is already wider than a touch target and shares its
          row with nothing, so it takes height only — widening it would drag the
          hit area across whatever sits beside it. The icon variant is 24px of
          SVG, and measured 24x44 on the paywall header while mode, language,
          feedback and developer all measured 44x44, so it takes the floor on
          both axes. */}
      <div
        className={clsx(
          'cursor-pointer coarse:min-h-[44px] coarse:flex coarse:items-center',
          isIcon && 'coarse:min-w-[44px] coarse:justify-center'
        )}
        aria-label={
          isIcon ? t('logout_from_sharek', 'Logout from Sharek') : undefined
        }
        onClick={logout}
      >
        {isIcon ? (
          <LogoutIcon
            data-tooltip-id="tooltip"
            data-tooltip-content={t('logout_from_sharek', 'Logout from Sharek')}
          />
        ) : (
          <span className="text-error">
            {t('logout_from_sharek', 'Logout from Sharek')}
          </span>
        )}
      </div>
    </>
  );
};
