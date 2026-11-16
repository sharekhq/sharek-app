import React, { useCallback } from 'react';
import clsx from 'clsx';
import { buttonClassName } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { fromUtc } from '@gitroom/frontend/components/layout/set.timezone';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { SetSelectionModal } from '@gitroom/frontend/components/launches/calendar';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ModalWrapperComponent } from '@gitroom/frontend/components/new-launch/modal.wrapper.component';

export const NewPost = () => {
  const fetch = useFetch();
  const modal = useModals();
  const { integrations, reloadCalendarView, sets } = useCalendar();
  const t = useT();

  const createAPost = useCallback(async () => {
    const date = (await (await fetch('/posts/find-slot')).json()).date;

    const set: any = !sets.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            closeOnEscape: true,
            withCloseButton: false,
            onClose: () => resolve('exit'),
            children: (
              <SetSelectionModal
                sets={sets}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({
            ...p,
          }))}
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={createAPost}
          mutate={reloadCalendarView}
          integrations={integrations}
          date={fromUtc(date)}
        />
      ),
      size: '80%',
      title: ``,
    });
  }, [integrations, sets]);
  return (
    <button
      onClick={createAPost}
      className={clsx(
        buttonClassName({ size: 'large' }),
        'flex-1 group-[.sidebar]:p-0'
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="21"
        height="20"
        viewBox="0 0 21 20"
        fill="none"
        className="w-[16px] h-[16px] shrink-0"
      >
        <path
          d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="group-[.sidebar]:hidden">
        {t('create_new_post', 'Create Post')}
      </div>
    </button>
  );
};
