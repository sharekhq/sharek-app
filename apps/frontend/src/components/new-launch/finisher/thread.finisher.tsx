'use client';

import { Slider } from '@gitroom/react/form/slider';
import { Editor } from '@gitroom/frontend/components/new-launch/editor';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

export const ThreadFinisher = () => {
  const integration = useIntegration();
  const { register, watch, setValue } = useSettings();
  const dummy = useLaunchStore((p) => p.dummy);
  const t = useT();

  register('active_thread_finisher', {
    value: false,
  });

  register('thread_finisher', {
    value: t('that_a_wrap', {
      username:
        integration.integration?.display || integration.integration?.name,
    }),
  });

  const slider = watch('active_thread_finisher');
  const value = watch('thread_finisher');

  return (
    <div className="flex flex-col gap-[12px] border border-tableBorder rounded-[8px] p-[12px] my-[20px]">
      <div className="flex items-center gap-[12px]">
        <div className="flex-1 flex flex-col">
          <div className="text-[14px]">
            {t('add_a_thread_finisher', 'Add a thread finisher')}
          </div>
          <div className="text-[12px] text-muted">
            {t(
              'thread_finisher_description',
              'A closing post added to the end of the thread.'
            )}
          </div>
        </div>
        <Slider
          value={slider ? 'on' : 'off'}
          onChange={(p) => setValue('active_thread_finisher', p === 'on')}
          fill={true}
        />
      </div>
      {!!slider && (
        <div className="editor text-textColor">
          <Editor
            comments={true}
            chars={{}}
            selectedIntegration={[]}
            onChange={(val) => setValue('thread_finisher', val)}
            value={value}
            totalPosts={1}
            dummy={dummy}
          />
        </div>
      )}
    </div>
  );
};
