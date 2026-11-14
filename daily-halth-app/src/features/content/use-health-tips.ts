import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { contentEndpoints } from '@/api/content-endpoints';
import { queryKeys } from '@/api/query-keys';
import type { TipCategory } from '@/shared-contracts/content.contract';

/** The newest few for home. */
export function useLatestHealthTips(limit = 5) {
  return useQuery({
    queryKey: [...queryKeys.healthTips('ALL'), 'latest', limit],
    queryFn: async () => (await contentEndpoints.tips({ limit })).data,
    staleTime: 10 * 60_000,
  });
}

export function useHealthTips(category: TipCategory | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.healthTips(category ?? 'ALL'),
    queryFn: ({ pageParam }) => contentEndpoints.tips({ category, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.meta.hasMore ? (page.meta.cursor ?? undefined) : undefined),
    staleTime: 10 * 60_000,
  });
}

export function useHealthTip(tipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.healthTip(tipId ?? ''),
    queryFn: () => contentEndpoints.tip(tipId!),
    enabled: Boolean(tipId),
  });
}
