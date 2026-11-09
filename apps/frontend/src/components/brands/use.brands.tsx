'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
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
