import React, { FC, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModalWrapperComponent } from '@gitroom/frontend/components/new-launch/modal.wrapper.component';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import i18next from 'i18next';

export const PreConditionComponentModal: FC = () => {
  const t = useT();
  const modal = useModals();
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="whitespace-pre-line">
        {t(
          'channel_connected_to_another_account',
          "This social channel was previously connected to another Sharek account.\nTo connect it during your trial, you can end the trial now: your plan's first payment is charged today instead of at the end of the trial, and nothing extra is added.\n\n** Please note this payment is final and not refundable."
        )}
      </div>
      <div className="flex gap-[2px] justify-center">
        <Button
          onClick={() => (window.location.href = '/billing?finishTrial=true')}
        >
          {t('finish_trial_charge_me_now', 'End trial and pay now')}
        </Button>
        <Button onClick={modal.closeCurrent} secondary={true}>{t('cancel', 'Cancel')}</Button>
      </div>
    </div>
  );
};
export const PreConditionComponent: FC = () => {
  const modal = useModals();
  const query = useSearchParams();
  // i18next.t, not the hook: this effect runs once on mount, and naming t in its
  // dependencies would re-run it — opening a second modal — every time the reader
  // switches language. Read at call time it answers in the language in force when the
  // modal opens.
  useEffect(() => {
    if (query.get('precondition')) {
      modal.openModal({
        title: i18next.t(
          'suspicious_activity_detected',
          'Suspicious activity detected'
        ),
        withCloseButton: true,
        children: <PreConditionComponentModal />,
      });
    }
  }, []);
  return null;
};
