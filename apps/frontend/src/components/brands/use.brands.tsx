'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useCallback } from 'react';
import useSWR from 'swr';

// A kit image, a Media item of the organization; `missing` once it is deleted
// from the Media library (FR-012).
export type BrandImage = { id: string; path: string | null; missing: boolean };

// A brand as GET /brands gives it (data-model.md), A to Z. Which channels are
// in it comes from GET /integrations/list, each channel's `customer`.
export type Brand = {
  id: string;
  name: string;
  kit: {
    logo: BrandImage | null;
    examples: BrandImage[];
    colours: string[];
    headingFont: string | null;
    bodyFont: string | null;
  };
};

// A kit image still in Media: it has a path and isn't missing (FR-012).
export const isLive = (image?: BrandImage | null) =>
  !!image?.path && !image.missing;

// The brand's logo while it is still in Media: what goes along with a render,
// taking one of its places, as the server counts it (FR-016), and what the
// brand's mark shows.
export const liveLogo = (brand?: Brand) => {
  const logo = brand?.kit.logo;
  return isLive(logo) ? logo : undefined;
};

// The brand's examples still in Media, the ones that go along.
export const liveExamples = (brand?: Brand) =>
  (brand?.kit.examples ?? []).filter(isLive);

export const useBrands = () => {
  const fetch = useFetch();

  // A failed answer (a 500 has a JSON body too) is an error SWR asks again
  // for, never brands to list
  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load brands');
      }
      return response.json();
    },
    [fetch]
  );

  return useSWR<Brand[]>('/brands', load);
};

// A saved brand in its place in GET /brands' list, for useBrands' mutate
// with no refetch: the server's answer to a kit change is the whole brand.
export const withSavedBrand = (saved: Brand) => (list?: Brand[]) =>
  list && list.map((item) => (item.id === saved.id ? saved : item));

// A change to a brand or to its channels: the answer once the server takes
// it. A refusal says why in a toast, in the server's words when it has some
// (a 400 lists them; the first goes), else the app's, as does a request that
// fails; one the fetch interceptor answered already (the limit modal, a
// redirect) says nothing more. Either way there is no answer.
export const useBrandChange = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();

  return async (url: string, init: RequestInit) => {
    const failed = t('error_occurred', 'An error occurred. Please try again.');
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }
      const { message } = await response.json().catch(() => ({}));
      toaster.show(
        (Array.isArray(message) ? message[0] : message) || failed,
        'warning'
      );
    } catch (e) {
      if (!isAlreadyAnswered(e)) {
        toaster.show(failed, 'warning');
      }
    }
    return undefined;
  };
};
