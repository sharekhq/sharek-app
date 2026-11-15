'use client';

import { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import {
  Channel,
  ChannelPicture,
  FOCUS_RING,
} from '@gitroom/frontend/components/launches/channel.panel';
import { Check } from '@gitroom/frontend/components/launches/tags.component';

// A channel on a brand's page, on No brand's or in Add channels: its picture,
// its name in its own direction and a line under it, its platform unless the
// row gives a line of its own, then what the row offers (a brand's ×, the
// picker's tick). The name lines up with the start beside the picture,
// whatever its own direction, as the brands list's names do. A disabled
// channel stays in its brand, dimmed as the channel list dims one, its line
// saying so in place of its platform.
export const BrandChannel: FC<{
  channel: Channel;
  line?: ReactNode;
  children?: ReactNode;
}> = ({ channel, line, children }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-[12px] min-h-[52px] ps-[8px] pe-[4px] py-[6px] rounded-[10px] hover:bg-boxHover transition-colors">
      <ChannelPicture
        channel={channel}
        className={clsx(channel.disabled && 'opacity-50')}
      />
      <span className="flex-1 min-w-0 flex flex-col items-start gap-[1px]">
        <bdi
          className={clsx(
            'max-w-full text-[14px] font-[500] text-ink truncate',
            channel.disabled && 'opacity-50'
          )}
        >
          {channel.name}
        </bdi>
        <span className="max-w-full text-[12px] text-muted truncate">
          {line ??
            (channel.disabled
              ? t('channel_disabled', 'Channel Disabled')
              : platformLabel(channel.identifier))}
        </span>
      </span>
      {children}
    </div>
  );
};

// Add channels' picker: the organization's channels in no brand or another
// one, each saying which, ticked to move into this brand. Each row is a
// BrandChannel in a button, its line the brand in place of the platform, and
// a disabled channel's saying so after it.
export const ChannelPicker: FC<{
  channels: Channel[];
  onAdd: (ids: string[]) => void;
  onCancel: () => void;
}> = ({ channels, onAdd, onCancel }) => {
  const t = useT();
  const [picked, setPicked] = useState<string[]>([]);

  if (!channels.length) {
    return (
      <p className="text-[14px] text-muted">
        {t('brands_no_other_channels', 'No other channels to add.')}
      </p>
    );
  }

  const toggle = (id: string) =>
    setPicked((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
    );

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="text-[13px] leading-[1.5] text-muted">
        {t(
          'brands_add_channels_hint',
          'A channel in another brand moves to this one.'
        )}
      </p>
      <div className="flex flex-col gap-[2px]">
        {channels.map((channel) => {
          const checked = picked.includes(channel.id);
          return (
            <button
              key={channel.id}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(channel.id)}
              className={clsx(
                'rounded-[10px] text-start cursor-pointer',
                FOCUS_RING
              )}
            >
              <BrandChannel
                channel={channel}
                line={
                  <>
                    {channel.customer?.id ? (
                      <bdi>{channel.customer.name}</bdi>
                    ) : (
                      t('brands_no_brand', 'No brand')
                    )}
                    {channel.disabled &&
                      ` · ${t('channel_disabled', 'Channel Disabled')}`}
                  </>
                }
              >
                {/* the channel list's Check, which the row's button ticks */}
                <Check value={checked} onChange={() => {}} />
              </BrandChannel>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-[8px]">
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button disabled={!picked.length} onClick={() => onAdd(picked)}>
          {t('add', 'Add')}
        </Button>
      </div>
    </div>
  );
};
