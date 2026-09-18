'use client';
import 'reflect-metadata';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';

const SaveSetModal: FC<{
  postData: any;
  initialValue?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ postData, onSave, onCancel, initialValue }) => {
  const [name, setName] = useState(initialValue);
  const t = useT();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Input
          label="Set Name"
          translationKey="label_set_name"
          name="setName"
          value={name}
          disableForm={true}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('placeholder_set_name', 'Enter a name for this set')}
          autoFocus
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" secondary onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t('save', 'Save')}
        </Button>
      </div>
    </form>
  );
};

export const Sets: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const modal = useModals();
  const toaster = useToaster();

  const load = useCallback(async (path: string) => {
    return (await (await fetch(path)).json()).integrations;
  }, []);

  const { isLoading, data: integrations } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });

  const list = useCallback(async () => {
    return (await fetch('/sets')).json();
  }, []);

  const { data, mutate } = useSWR('sets', list, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const addSet = useCallback(
    (params?: { id?: string; name?: string; content?: string }) => () => {
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
            allIntegrations={integrations.map((p: any) => ({
              ...p,
            }))}
            {...(params?.id ? { set: JSON.parse(params.content) } : {})}
            addEditSets={(data) => {
              modal.openModal({
                title: t('save_as_set', 'Save as Set'),
                children: (
                  <SaveSetModal
                    initialValue={params?.name || ''}
                    postData={data}
                    onSave={async (name: string) => {
                      try {
                        await fetch('/sets', {
                          method: 'POST',
                          body: JSON.stringify({
                            ...(params?.id ? { id: params.id } : {}),
                            name,
                            content: JSON.stringify(data),
                          }),
                        });
                        modal.closeAll();
                        mutate();
                        toaster.show(
                          t('set_saved_successfully', 'Set saved successfully'),
                          'success'
                        );
                      } catch (error) {
                        toaster.show(
                          t('failed_to_save_set', 'Failed to save set'),
                          'warning'
                        );
                      }
                    }}
                    onCancel={() => modal.closeAll()}
                  />
                ),
              });
            }}
            reopenModal={() => {}}
            mutate={() => {}}
            integrations={integrations}
            date={newDayjs()}
          />
        ),
        title: ``,
      });
    },
    [integrations, t]
  );

  const deleteSet = useCallback(
    (data: any) => async () => {
      if (
        await deleteDialog(
          t('are_you_sure_you_want_to_delete', 'Are you sure you want to delete {{name}}?', {
            name: data.name,
          })
        )
      ) {
        await fetch(`/sets/${data.id}`, {
          method: 'DELETE',
        });
        mutate();
        toaster.show(
          t('set_deleted_successfully', 'Set deleted successfully'),
          'success'
        );
      }
    },
    [t]
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">
        {t('sets_2', 'Sets ({{value1}})', { value1: data?.length || 0 })}
      </h3>
      <div className="text-muted mt-[4px]">
        {t(
          'manage_your_content_sets_for_easy_reuse_across_posts',
          'Manage your content sets for easy reuse across posts.'
        )}
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth items-center border rounded-[4px] p-[24px] flex gap-[24px]">
        <div className="flex flex-col w-full">
          {!!data?.length && (
            <div className="grid grid-cols-[2fr,1fr,1fr] phone:grid-cols-1 w-full gap-y-[10px] phone:gap-y-[12px]">
              <div className="phone:hidden">{t('name', 'Name')}</div>
              <div className="phone:hidden">{t('edit', 'Edit')}</div>
              <div className="phone:hidden">{t('delete', 'Delete')}</div>
              {data?.map((p: any) => (
                <div key={p.id} className="contents phone:flex phone:flex-col phone:gap-[10px] phone:p-[14px] phone:border phone:border-fifth phone:rounded-[8px]">
                  <div className="flex flex-col justify-center">{p.name}</div>
                  <div className="flex flex-col justify-center">
                    <div>
                      <Button onClick={addSet(p)}>{t('edit', 'Edit')}</Button>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div>
                      <Button onClick={deleteSet(p)}>
                        {t('delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <Button
              onClick={addSet()}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('add_a_set', 'Add a set')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
