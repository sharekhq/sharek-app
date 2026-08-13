import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface TikTokCreatorInfo {
  creatorNickname: string;
  creatorUsername: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
  errorCode: string | null;
}

/**
 * The connected TikTok account's current posting profile.
 *
 * TikTok requires the latest profile at render time — the creator can change
 * their privacy settings at any moment — so this is fetched whenever the
 * settings mount rather than cached across sessions. Keyed by integration id,
 * so two TikTok channels in one post fetch their own profile exactly once
 * each; TikTok allows 20 of these a minute per token, well clear of one per
 * selected channel.
 *
 * Reached through the generic provider-function bridge, which refreshes an
 * expired token and retries before answering. That bridge reports a failed
 * provider call as the literal `false`, so callers must treat a non-object
 * answer as "could not be retrieved" and offer no options at all — never an
 * empty list presented as the account's real permissions.
 */
export const useTikTokCreatorInfo = (integrationId?: string) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (
      await fetch('/integrations/function', {
        method: 'POST',
        body: JSON.stringify({ name: 'creatorInfo', id: integrationId }),
      })
    ).json();
  }, [integrationId]);

  return useSWR<TikTokCreatorInfo | false>(
    integrationId ? `tiktok-creator-info-${integrationId}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );
};
