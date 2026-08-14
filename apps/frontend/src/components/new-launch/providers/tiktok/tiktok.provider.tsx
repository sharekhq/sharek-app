'use client';

import {
  FC,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { Checkbox } from '@gitroom/react/form/checkbox';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Input } from '@gitroom/react/form/input';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { useTikTokCreatorInfo } from '@gitroom/frontend/components/new-launch/providers/tiktok/use.tiktok.creator.info';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { formatDuration } from '@gitroom/helpers/utils/format.duration';

// TikTok's published policy pages, linked from the declaration it requires on
// every post.
const MUSIC_USAGE_CONFIRMATION_URL =
  'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_CONTENT_POLICY_URL =
  'https://www.tiktok.com/legal/page/global/bc-policy/en';

export const TikTokSettings: FC<{
  values?: any;
}> = (props) => {
  const { watch, register, setValue } = useSettings();
  const { value, integration } = useIntegration();
  const t = useT();
  const setPublishBlocker = useLaunchStore((p) => p.setPublishBlocker);

  const isTitle = useMemo(() => {
    return value?.[0]?.image?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1);
  }, [value]);

  const hasMedia = (value?.[0]?.image?.length ?? 0) > 0;
  const isVideo = hasMedia && !isTitle;

  const disclose = watch('disclose');
  const brand_organic_toggle = watch('brand_organic_toggle');
  const brand_content_toggle = watch('brand_content_toggle');
  const content_posting_method = watch('content_posting_method');
  const privacy_level = watch('privacy_level');
  const isUploadMode = content_posting_method === 'UPLOAD';

  // What this TikTok account currently permits. The bridge answers the literal
  // `false` when the provider call fails, so anything that is not an object is
  // a retrieval failure — which is not the same as an account that permits
  // nothing, and must never be rendered as an empty list of real permissions.
  const { data: creatorInfo, isLoading: creatorInfoLoading } =
    useTikTokCreatorInfo(integration?.id);
  const profile =
    creatorInfo && typeof creatorInfo === 'object' ? creatorInfo : undefined;
  const profileUnavailable = !creatorInfoLoading && !profile;

  // TikTok has no is_aigc, disable_duet or disable_stitch field for photo
  // posts, so those controls are not offered there. They stay mounted and
  // registered — exactly as the direct-post-only settings do in upload mode —
  // because TikTokDto still requires them at save time.
  const videoOnly = clsx(isTitle && 'invisible h-0 overflow-hidden');

  // The mirror of the above: TikTok's photo post_info carries auto_add_music
  // and its video post_info has no equivalent, so the provider only ever sends
  // it for a photo. Offering it on a video post is a setting that silently
  // does nothing. Hidden rather than unmounted, for the same reason.
  const photoOnly = clsx(!isTitle && 'invisible h-0 overflow-hidden');

  // TikTok answers with a refusal code rather than a profile when the account
  // cannot publish right now. The causes are not interchangeable — waiting
  // clears a daily cap and does nothing for a blocked account — so each gets
  // its own remedy, and the raw code is never shown. These English defaults
  // are pinned against the publish-time failure messages by
  // tiktok.provider.spec.ts, so the creator hears the same thing either way.
  const refusalMessage = useMemo(() => {
    switch (profile?.errorCode) {
      case undefined:
      case null:
        return null;
      case 'spam_risk_too_many_posts':
        return t(
          'tiktok_refusal_daily_post_limit',
          'TikTok says your daily post limit reached, please try again tomorrow'
        );
      case 'spam_risk_user_banned_from_posting':
        return t(
          'tiktok_refusal_account_banned',
          'Account banned from posting, please check TikTok account status'
        );
      case 'reached_active_user_cap':
        return t(
          'tiktok_refusal_app_quota',
          'Sharek has reached its daily TikTok publishing quota, please try again later'
        );
      default:
        return t(
          'tiktok_refusal_generic',
          'TikTok is not accepting posts from this account right now, please try again later'
        );
    }
  }, [profile?.errorCode, t]);

  // Duration is not stored on the media record, so it is read in the browser
  // from the attachment itself, the way the media library already does it.
  const [videoDurationSec, setVideoDurationSec] = useState(NaN);
  const videoUrl = isTitle ? undefined : value?.[0]?.image?.[0]?.path;
  const maxVideoDurationSec = profile?.maxVideoPostDurationSec ?? 0;
  const videoTooLong =
    Number.isFinite(videoDurationSec) &&
    maxVideoDurationSec > 0 &&
    videoDurationSec > maxVideoDurationSec;

  // Which label TikTok will attach, stated off the *selection* rather than off
  // the disclosure toggle: announcing "Promotional content" the moment
  // disclosure is switched on, before the creator has chosen anything, is one
  // of the two points the API application was rejected on. Branded content
  // wins when both are selected — TikTok treats the post as a paid
  // partnership.
  const commercialLabel = useMemo(() => {
    if (!disclose || (!brand_organic_toggle && !brand_content_toggle)) {
      return null;
    }

    // The inner quotes are single on purpose: TikTok's guidelines prescribe
    // these sentences down to the punctuation, and reject paraphrase.
    if (brand_content_toggle) {
      return isTitle
        ? t(
            'tiktok_label_paid_partnership_photo',
            "Your photo will be labeled as 'Paid partnership'"
          )
        : t(
            'tiktok_label_paid_partnership_video',
            "Your video will be labeled as 'Paid partnership'"
          );
    }

    return isTitle
      ? t(
          'tiktok_label_promotional_photo',
          "Your photo will be labeled as 'Promotional content'"
        )
      : t(
          'tiktok_label_promotional_video',
          "Your video will be labeled as 'Promotional content'"
        );
  }, [disclose, brand_organic_toggle, brand_content_toggle, isTitle, t]);

  // TikTok will not accept a private branded-content post, so a visibility
  // already set to private is cleared rather than left to fail on submit.
  useEffect(() => {
    if (brand_content_toggle && privacy_level === 'SELF_ONLY') {
      setValue('privacy_level', '');
    }
  }, [brand_content_toggle, privacy_level, setValue]);

  // Switching the disclosure off only hides these two, and TikTok's payload has
  // no disclosure field — it reads them on their own — so a choice left behind
  // would still label the post, and still bar private visibility here. Written
  // against the state rather than the switching, because a post saved with the
  // pair already mismatched opens the same way.
  useEffect(() => {
    if (disclose) {
      return;
    }

    // shouldValidate, or a refusal raised against the cleared choice outlives
    // it: nothing else revalidates until the creator touches another field.
    if (brand_organic_toggle) {
      setValue('brand_organic_toggle', false, { shouldValidate: true });
    }

    if (brand_content_toggle) {
      setValue('brand_content_toggle', false, { shouldValidate: true });
    }
  }, [disclose, brand_organic_toggle, brand_content_toggle, setValue]);

  // Why this channel cannot be published right now. TikTok requires the
  // publish control itself to be disabled with the reason on hover, so the
  // reason reaches the composer store already translated and already naming
  // this channel.
  const publishBlockReason = useMemo(() => {
    const attributedTo = (reason: string) =>
      `${platformLabel(integration?.identifier ?? 'tiktok')} (${
        profile?.creatorUsername
          ? `@${profile.creatorUsername}`
          : integration?.name
      }): ${reason}`;

    // These two hold whichever way the post is finished (FR-017): a refused
    // account and a video longer than the account may publish stop an inbox
    // upload exactly as they stop a direct post.
    if (refusalMessage) {
      return attributedTo(refusalMessage);
    }

    if (videoTooLong) {
      return attributedTo(
        t(
          'tiktok_video_too_long',
          'Video is too long. This TikTok account may publish up to {{maximum}}.',
          { maximum: formatDuration(maxVideoDurationSec) ?? '' }
        )
      );
    }

    // The disclosure rule is exempt on UPLOAD — TikTok discards those fields,
    // so blocking would refuse an upload TikTok would have accepted.
    if (
      !isUploadMode &&
      disclose &&
      !brand_organic_toggle &&
      !brand_content_toggle
    ) {
      return attributedTo(
        t(
          'tiktok_disclosure_needs_a_choice',
          'You need to indicate if your content promotes yourself, a third party, or both.'
        )
      );
    }

    // Ranked last so TikTok's mandated disclosure sentence stays the hover
    // message whenever both are unanswered - that sentence is what the
    // reviewer checks. Nothing pre-selects a visibility, so this is the state
    // a creator lands in simply by adding TikTok and never opening its
    // settings; without it they reach submit and meet the settings class's
    // raw refusal instead. Exempt on UPLOAD, where TikTok discards it.
    if (!isUploadMode && !privacy_level) {
      return attributedTo(
        profileUnavailable
          ? // Asking someone to choose from a list that failed to load is a
            // dead end; tell them what actually went wrong.
            t(
              'tiktok_creator_info_unavailable',
              'TikTok settings could not be loaded, so no options can be offered. Close and reopen the post to try again.'
            )
          : t(
              'tiktok_visibility_needs_a_choice',
              'Choose who can see this post.'
            )
      );
    }

    return undefined;
  }, [
    refusalMessage,
    videoTooLong,
    maxVideoDurationSec,
    isUploadMode,
    disclose,
    brand_organic_toggle,
    brand_content_toggle,
    privacy_level,
    profileUnavailable,
    integration,
    profile?.creatorUsername,
    t,
  ]);

  const integrationId = integration?.id;

  useEffect(() => {
    if (!integrationId || !publishBlockReason) {
      return;
    }

    setPublishBlocker(integrationId, publishBlockReason);

    // Clears when the condition clears, when the channel leaves the post, and
    // on unmount — settings panels stay mounted for every selected channel,
    // not only the open tab.
    return () => setPublishBlocker(integrationId, undefined);
  }, [integrationId, publishBlockReason, setPublishBlocker]);

  // TikTok ignores every setting except the title / content when the posting
  // method is UPLOAD, so we hide them rather than pretend they apply. The fields
  // stay mounted and registered: their values must survive the switch, and
  // TikTokDto still requires most of them at save time.
  const directPostOnly = clsx(isUploadMode && 'invisible h-0 overflow-hidden');

  const tiktokRestrictionNotice = useMemo(() => {
    if (!hasMedia || !isVideo) return null;
    if (!isUploadMode) {
      return t(
        'tiktok_restriction_direct_video',
        'TikTok restriction: For direct post with video, your post content is used as the title. A separate title field is not available.'
      );
    }
    return t(
      'tiktok_restriction_upload_video',
      'TikTok restriction: For upload-only video, TikTok does not accept a title or message. The content will default to "#Sharek" and you can edit it inside the TikTok app before publishing.'
    );
  }, [hasMedia, isUploadMode, isVideo, t]);

  // Built from the account's own profile, never from a fixed list: TikTok
  // allows public and private accounts different subsets, and offering a
  // visibility the account does not have gets the post refused.
  const privacyLevelLabels: Record<string, string> = {
    PUBLIC_TO_EVERYONE: t('public_to_everyone', 'Public to everyone'),
    MUTUAL_FOLLOW_FRIENDS: t('mutual_follow_friends', 'Mutual follow friends'),
    FOLLOWER_OF_CREATOR: t('follower_of_creator', 'Follower of creator'),
    SELF_ONLY: t('self_only', 'Self only'),
  };
  const privacyLevel = (profile?.privacyLevelOptions ?? []).map((value) => ({
    value,
    label: privacyLevelLabels[value] ?? value,
  }));
  const contentPostingMethod = [
    {
      value: 'DIRECT_POST',
      label: t(
        'post_content_directly_to_tiktok',
        'Post content directly to TikTok'
      ),
    },
    {
      value: 'UPLOAD',
      label: t(
        'upload_content_to_tiktok_without_posting',
        'Upload content to TikTok without posting it'
      ),
    },
  ];
  const yesNo = [
    {
      value: 'yes',
      label: t('yes', 'Yes'),
    },
    {
      value: 'no',
      label: t('no', 'No'),
    },
  ];

  return (
    <div className="flex flex-col">
      {/*<CheckTikTokValidity picture={props?.values?.[0]?.image?.[0]?.path} />*/}
      {tiktokRestrictionNotice && (
        <div className="bg-tableBorder p-[10px] mb-[18px] rounded-[10px] flex gap-[10px] items-start text-[13px] text-balance">
          <div className="shrink-0 mt-[2px]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>{tiktokRestrictionNotice}</div>
        </div>
      )}
      {/*
        Reads the attachment's length so an over-long video is refused here
        rather than hours later at publish time. Kept out of view but rendered,
        because a display:none element is not guaranteed to load metadata.
      */}
      {videoUrl && (
        <VideoFrame
          url={videoUrl}
          className="absolute w-px h-px opacity-0 pointer-events-none"
          onLoadedMetadata={(element) => setVideoDurationSec(element.duration)}
        />
      )}
      {/* Which account receives the post — shown in both posting modes. */}
      {profile?.creatorNickname && (
        <div className="text-[14px] mb-[18px] text-balance">
          {t('tiktok_posting_to_account', 'Posting to {{nickname}}', {
            nickname: profile.creatorNickname,
          })}
        </div>
      )}
      {refusalMessage && (
        <div className="bg-tableBorder p-[10px] mb-[18px] rounded-[10px] flex gap-[10px] items-start text-[13px] text-balance">
          <div className="shrink-0 mt-[2px]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>{refusalMessage}</div>
        </div>
      )}
      {profileUnavailable && (
        <div className="bg-tableBorder p-[10px] mb-[18px] rounded-[10px] flex gap-[10px] items-start text-[13px] text-balance">
          <div className="shrink-0 mt-[2px]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            {t(
              'tiktok_creator_info_unavailable',
              'TikTok settings could not be loaded, so no options can be offered. Close and reopen the post to try again.'
            )}
          </div>
        </div>
      )}
      {isTitle && <Input label="Title" {...register('title')} maxLength={89} />}
      <div className={directPostOnly}>
        <Select
          label={t('tiktok_who_can_see_this_post', 'Who can see this post?')}
          disabled={isUploadMode}
          {...register('privacy_level')}
        >
          <option value="">{t('select', 'Select')}</option>
          {privacyLevel.map((item) => (
            <option
              key={item.value}
              value={item.value}
              disabled={item.value === 'SELF_ONLY' && brand_content_toggle}
            >
              {item.label}
            </option>
          ))}
        </Select>
        {brand_content_toggle && (
          // Repeated as visible text, not left to the greyed option alone: an
          // unavailable choice may never be signalled by styling by itself.
          <div className="text-[14px] -mt-[10px] mb-[10px] text-balance">
            {t(
              'tiktok_branded_content_not_private',
              'Branded content visibility cannot be set to private.'
            )}
          </div>
        )}
      </div>
      <div className="text-[14px] mt-[10px] mb-[18px] text-balance">
        {t(
          'choose_upload_without_posting_description',
          `Choose upload without posting if you want to review and edit your content within TikTok's app before publishing.
        This gives you access to TikTok's built-in editing tools and lets you make final adjustments before posting. The additional settings are only available when posting directly to TikTok.`
        )}
      </div>
      <Select
        label={t('label_content_posting_method', 'Content posting method')}
        {...register('content_posting_method', {
          value: 'DIRECT_POST',
        })}
      >
        <option value="">{t('select', 'Select')}</option>
        {contentPostingMethod.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      {isUploadMode && <div className="-mt-[23px] mb-[23px] text-muted">After posting you fill find a notification inside your Inbox about your post (not content studio)</div>}
      <div className={clsx('flex flex-col', directPostOnly)}>
        <div className={photoOnly}>
          <Select
            label={t('label_auto_add_music', 'Auto add music')}
            disabled={isUploadMode}
            {...register('autoAddMusic', {
              value: 'no',
            })}
          >
            <option value="">{t('select', 'Select')}</option>
            {yesNo.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <div className="text-[14px] mt-[10px] mb-[24px] text-balance">
            {t(
              'tiktok_auto_add_music_description',
              'TikTok adds a default track, which you can change later.'
            )}
          </div>
        </div>
        <div className={videoOnly}>
          <hr className="mb-[15px] border-tableBorder" />
          <div className="text-[14px] mb-[10px]">
            {t('tiktok_video_features', 'Video features')}
          </div>
          <div className="flex gap-[40px]">
            <Checkbox
              label={t('label_duet', 'Allow Duet')}
              disabled={isUploadMode || !!profile?.duetDisabled}
              {...register('duet', {
                value: false,
              })}
            />
            <Checkbox
              label={t('label_stitch', 'Allow Stitch')}
              disabled={isUploadMode || !!profile?.stitchDisabled}
              {...register('stitch', {
                value: false,
              })}
            />
            <Checkbox
              label={t('video_made_with_ai', 'Video made with AI')}
              disabled={isUploadMode}
              {...register('video_made_with_ai', {
                value: false,
              })}
            />
          </div>
        </div>
        <hr className="my-[15px] mb-[25px] border-tableBorder" />
        <div className="flex flex-col gap-[20px]">
          <Checkbox
            label={t('label_comments', 'Allow Comments')}
            disabled={isUploadMode || !!profile?.commentDisabled}
            {...register('comment', {
              value: false,
            })}
          />
          <Checkbox
            label={t('tiktok_content_disclosure', 'Content disclosure')}
            disabled={isUploadMode}
            {...register('disclose', {
              value: false,
            })}
          />
          <div className="text-[14px] my-[10px] text-balance">
            {t(
              'tiktok_disclosure_description',
              'Indicate whether this content promotes yourself, a brand, product or service.'
            )}
          </div>
        </div>
        <div
          className={clsx(
            !disclose && 'invisible h-0 overflow-hidden',
            'mt-[20px]'
          )}
        >
          <Checkbox
            label={t('label_your_brand', 'Your brand')}
            disabled={isUploadMode}
            {...register('brand_organic_toggle', {
              value: false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'tiktok_your_brand_description',
              'You are promoting yourself or your own business.'
            )}
            <br />
            {t(
              'tiktok_brand_organic_classification',
              'This content will be classified as Brand Organic.'
            )}
          </div>
          <Checkbox
            label={t('label_branded_content', 'Branded content')}
            disabled={isUploadMode}
            {...register('brand_content_toggle', {
              value: false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_another_brand',
              'You are promoting another brand or a third party.'
            )}
            <br />
            {t(
              'tiktok_branded_content_classification',
              'This content will be classified as Branded Content.'
            )}
          </div>
          {commercialLabel && (
            <div className="bg-tableBorder p-[10px] mt-[10px] rounded-[10px] flex gap-[20px] items-center">
              <div>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                    fill="white"
                  />
                </svg>
              </div>
              <div>
                {commercialLabel}
                <br />
                {t(
                  'tiktok_label_cannot_be_changed',
                  'This cannot be changed once the post is published.'
                )}
              </div>
            </div>
          )}
        </div>
        {/*
          Required on every post, commercial or not — not only once a brand
          toggle is on, which is how it read when the application was rejected.
          The order is TikTok's: Branded Content Policy, then Music Usage
          Confirmation.
        */}
        <div className="my-[10px] text-[14px] text-balance">
          {t(
            'by_posting_you_agree_to_tiktoks',
            "By posting, you agree to TikTok's"
          )}{' '}
          {brand_content_toggle && (
            <>
              <a
                target="_blank"
                className="text-brand hover:underline"
                href={BRANDED_CONTENT_POLICY_URL}
              >
                {t('branded_content_policy', 'Branded Content Policy')}
              </a>{' '}
              {t('and', 'and')}{' '}
            </>
          )}
          <a
            target="_blank"
            className="text-brand hover:underline"
            href={MUSIC_USAGE_CONFIRMATION_URL}
          >
            {t('music_usage_confirmation', 'Music Usage Confirmation')}
          </a>
        </div>
        {/*
          Sits inside the direct-post block on purpose: an upload only lands in
          the creator's inbox, so there is no publishing to wait for and
          promising one would mislead (FR-017).
        */}
        <div className="text-[14px] mt-[10px] text-muted text-balance">
          {t(
            'tiktok_processing_delay_notice',
            'Your post may take a few minutes to process before it appears on your TikTok profile.'
          )}
        </div>
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TikTokSettings,
  comments: false,
  CustomPreviewComponent: TiktokPreview,
  dto: TikTokDto,
  maximumCharacters: 2000,
});
