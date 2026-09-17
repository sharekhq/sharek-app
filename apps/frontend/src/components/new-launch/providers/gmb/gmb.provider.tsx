'use client';

import { FC, useCallback, useEffect } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { GmbSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/gmb.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useWatch } from 'react-hook-form';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const topicTypes = [
  {
    translationKey: 'standard_update',
    label: 'Standard Update',
    value: 'STANDARD',
  },
  {
    translationKey: 'event',
    label: 'Event',
    value: 'EVENT',
  },
  {
    translationKey: 'offer',
    label: 'Offer',
    value: 'OFFER',
  },
];

const callToActionTypes = [
  {
    translationKey: 'none',
    label: 'None',
    value: 'NONE',
  },
  {
    translationKey: 'book',
    label: 'Book',
    value: 'BOOK',
  },
  {
    translationKey: 'order_online',
    label: 'Order Online',
    value: 'ORDER',
  },
  {
    translationKey: 'shop',
    label: 'Shop',
    value: 'SHOP',
  },
  {
    translationKey: 'learn_more',
    label: 'Learn More',
    value: 'LEARN_MORE',
  },
  {
    translationKey: 'sign_up',
    label: 'Sign Up',
    value: 'SIGN_UP',
  },
  {
    translationKey: 'get_offer',
    label: 'Get Offer',
    value: 'GET_OFFER',
  },
  {
    translationKey: 'call',
    label: 'Call',
    value: 'CALL',
  },
];

const GmbSettings: FC = () => {
  const t = useT();
  const { register, control } = useSettings();
  const topicType = useWatch({ control, name: 'topicType' });
  const callToActionType = useWatch({ control, name: 'callToActionType' });

  return (
    <div className="flex flex-col gap-[10px]">
      <Select
        label="Post Type"
        {...register('topicType', {
          value: 'STANDARD',
        })}
      >
        {topicTypes.map((item) => (
          <option key={item.value} value={item.value}>
            {t(item.translationKey, item.label)}
          </option>
        ))}
      </Select>

      <Select
        label="Call to Action"
        {...register('callToActionType', {
          value: 'NONE',
        })}
      >
        {callToActionTypes.map((item) => (
          <option key={item.value} value={item.value}>
            {t(item.translationKey, item.label)}
          </option>
        ))}
      </Select>

      {callToActionType &&
        callToActionType !== 'NONE' &&
        callToActionType !== 'CALL' && (
          <Input
            label="Call to Action URL"
            placeholder="https://example.com"
            {...register('callToActionUrl')}
          />
        )}

      {topicType === 'EVENT' && (
        <div className="flex flex-col gap-[10px] mt-[10px] p-[15px] border border-input rounded-[8px]">
          <div className="text-[14px] font-medium mb-[5px]">{t('gmb_event_details', 'Event Details')}</div>
          <Input
            label="Event Title"
            placeholder={t('placeholder_event_name', 'Event name')}
            {...register('eventTitle')}
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label="Start Date"
              type="date"
              {...register('eventStartDate')}
            />
            <Input label="End Date" type="date" {...register('eventEndDate')} />
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label="Start Time (optional)"
              type="time"
              {...register('eventStartTime')}
            />
            <Input
              label="End Time (optional)"
              type="time"
              {...register('eventEndTime')}
            />
          </div>
        </div>
      )}

      {topicType === 'OFFER' && (
        <div className="flex flex-col gap-[10px] mt-[10px] p-[15px] border border-input rounded-[8px]">
          <div className="text-[14px] font-medium mb-[5px]">{t('gmb_offer_details', 'Offer Details')}</div>
          <Input
            label="Coupon Code (optional)"
            placeholder="SAVE20"
            {...register('offerCouponCode')}
          />
          <Input
            label="Redeem Online URL (optional)"
            placeholder="https://example.com/redeem"
            {...register('offerRedeemUrl')}
          />
          <Input
            label="Terms & Conditions (optional)"
            placeholder={t('placeholder_valid_until', 'Valid until...')}
            {...register('offerTerms')}
          />
        </div>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: GmbSettings,
  CustomPreviewComponent: undefined,
  dto: GmbSettingsDto,
  maximumCharacters: 1500,
});
