import React, { FC, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import clsx from 'clsx';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { TopTitle } from '@gitroom/frontend/components/launches/helpers/top.title.component';
import { array, boolean, object, string } from 'yup';
import { FormProvider, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { CopilotTextarea } from '@copilotkit/react-textarea';
import { Select } from '@gitroom/react/form/select';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
export const SignaturesComponent: FC<{
  appendSignature?: (value: string) => void;
}> = (props) => {
  const { appendSignature } = props;
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const load = useCallback(async () => {
    return (await fetch('/signatures')).json();
  }, []);
  const { data, mutate } = useSWR('signatures', load);
  const addSignature = useCallback(
    (data?: any) => () => {
      modal.openModal({
        title: data
          ? t('top_title_edit_signature', 'Edit Signature')
          : t('top_title_add_signature', 'Add Signature'),
        withCloseButton: true,
        children: <AddOrRemoveSignature data={data} reload={mutate} />,
      });
    },
    [mutate]
  );

  const deleteSignature = useCallback(
    (data: any) => async () => {
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete',
            `Are you sure you want to delete?`,
            { name: data.content.slice(0, 15) + '...' }
          )
        )
      ) {
        await fetch(`/signatures/${data.id}`, {
          method: 'DELETE',
        });
        mutate();
        toaster.show(
          t('signature_deleted_successfully', 'Signature deleted successfully'),
          'success'
        );
      }
    },
    []
  );

  const t = useT();

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('signatures', 'Signatures')}</h3>
      <div className="text-muted mt-[4px]">
        {t(
          'you_can_add_signatures_to_your_account_to_be_used_in_your_posts',
          'You can add signatures to your account to be used in your posts.'
        )}
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth items-center border rounded-[4px] p-[24px] flex gap-[24px]">
        <div className="flex flex-col w-full">
          {!!data?.length && (
            <div
              className={`grid ${
                !!appendSignature
                  ? 'grid-cols-[1fr,1fr,1fr,1fr,1fr]'
                  : 'grid-cols-[1fr,1fr,1fr,1fr]'
              } phone:grid-cols-1 w-full gap-y-[10px] phone:gap-y-[12px]`}
            >
              <div className="phone:hidden">{t('content', 'Content')}</div>
              <div className="text-center phone:hidden">{t('auto_add', 'Auto Add?')}</div>
              {!!appendSignature && (
                <div className="text-center phone:hidden">{t('actions', 'Actions')}</div>
              )}
              <div className="text-center phone:hidden">{t('edit', 'Edit')}</div>
              <div className="text-center phone:hidden">{t('delete', 'Delete')}</div>
              {data?.map((p: any) => (
                <div key={p.id} className="contents phone:flex phone:flex-col phone:gap-[10px] phone:p-[14px] phone:border phone:border-fifth phone:rounded-[8px]">
                  <div className="relative flex-1 me-[20px] overflow-x-hidden">
                    <div className="absolute phone:static start-0 line-clamp-1 top-[50%] -translate-y-[50%] phone:translate-y-0 text-ellipsis">
                      {p.content.slice(0, 15) + '...'}
                    </div>
                  </div>
                  <div className="flex flex-col justify-center relative me-[20px]">
                    <div className="text-center phone:text-start w-full absolute phone:static start-0 line-clamp-1 top-[50%] -translate-y-[50%] phone:translate-y-0">
                      {p.autoAdd ? t('yes', 'Yes') : t('no', 'No')}
                    </div>
                  </div>
                  {!!appendSignature && (
                    <div className="flex justify-center">
                      <Button onClick={() => appendSignature(p.content)}>
                        {t('use_signature', 'Use Signature')}
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <div>
                      <Button onClick={addSignature(p)}>
                        {t('edit', 'Edit')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <div>
                      <Button onClick={deleteSignature(p)}>
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
              onClick={addSignature()}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('add_a_signature', 'Add a signature')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
const details = object().shape({
  content: string().required(),
  autoAdd: boolean().required(),
});
const AddOrRemoveSignature: FC<{
  data?: any;
  reload: () => void;
}> = (props) => {
  const { data, reload } = props;
  const toast = useToaster();
  const fetch = useFetch();
  const form = useForm({
    resolver: yupResolver(details),
    values: {
      content: data?.content || '',
      autoAdd: data?.autoAdd || false,
    },
  });
  const text = form.watch('content');
  const autoAdd = form.watch('autoAdd');
  const modal = useModals();
  const callBack = useCallback(
    async (values: any) => {
      await fetch(data?.id ? `/signatures/${data.id}` : '/signatures', {
        method: data?.id ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      });
      toast.show(
        data?.id
          ? t('signature_updated_successfully', 'Signature updated successfully')
          : t('signature_added_successfully', 'Signature added successfully'),
        'success'
      );
      modal.closeCurrent();
      reload();
    },
    [data, modal]
  );

  const t = useT();

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)}>
        <div className="relative flex gap-[20px] flex-col flex-1 rounded-[4px] pt-0">
          <div className="relative bg-surface">
            <CopilotTextarea
              disableBranding={true}
              className={clsx(
                '!min-h-40 !max-h-80 p-[16px] overflow-x-hidden scrollbar scrollbar-thumb-fifth bg-newBgColorInner border border-newTableBorder rounded-[8px] outline-none'
              )}
              value={text}
              onChange={(e) => {
                form.setValue('content', e.target.value);
              }}
              placeholder={t('placeholder_write_signature', 'Write your signature...')}
              autosuggestionsConfig={{
                textareaPurpose: `Assist me in writing social media signature`,
                chatApiConfigs: {},
              }}
            />
          </div>

          <Select
            label="Auto add signature?"
            translationKey="label_auto_add_signature"
            {...form.register('autoAdd', {
              setValueAs: (value) => value === 'true',
            })}
          >
            <option value="false">
              {t('no', 'No')}
            </option>
            <option value="true">
              {t('yes', 'Yes')}
            </option>
          </Select>

          <Button type="submit">{t('save', 'Save')}</Button>
        </div>
      </form>
    </FormProvider>
  );
};
