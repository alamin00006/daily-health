import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UploadFile } from '@/api/http-client';
import { queryKeys } from '@/api/query-keys';
import { recordsEndpoints } from '@/api/records-endpoints';
import type {
  MedicalFileType,
  UpdateMedicalFileRequest,
} from '@/shared-contracts/records.contract';

/** File URLs are signed for ~10 minutes: refetch well before they stop working. */
const URL_LIFETIME_MS = 8 * 60_000;

export function useMedicalFiles(profileId: string | undefined, type?: MedicalFileType) {
  return useInfiniteQuery({
    queryKey: queryKeys.files(profileId ?? '', type),
    queryFn: ({ pageParam }) => recordsEndpoints.list(profileId!, { type, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.meta.hasMore ? (page.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(profileId),
    staleTime: URL_LIFETIME_MS,
  });
}

export function useMedicalFile(profileId: string | undefined, fileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.file(profileId ?? '', fileId ?? ''),
    queryFn: () => recordsEndpoints.get(profileId!, fileId!),
    enabled: Boolean(profileId && fileId),
    staleTime: URL_LIFETIME_MS,
    refetchInterval: URL_LIFETIME_MS,
  });
}

function useInvalidateFiles(profileId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'files'] });
}

export function useUploadMedicalFile(profileId: string) {
  const invalidate = useInvalidateFiles(profileId);
  return useMutation({
    mutationFn: ({
      file,
      fields,
    }: {
      file: UploadFile;
      fields: { type: MedicalFileType; title: string; reportDate: string | null };
    }) => recordsEndpoints.upload(profileId, file, fields),
    onSuccess: invalidate,
  });
}

export function useUpdateMedicalFile(profileId: string, fileId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateFiles(profileId);
  return useMutation({
    mutationFn: (body: UpdateMedicalFileRequest) =>
      recordsEndpoints.update(profileId, fileId, body),
    onSuccess: async (file) => {
      queryClient.setQueryData(queryKeys.file(profileId, fileId), file);
      await invalidate();
    },
  });
}

export function useDeleteMedicalFile(profileId: string) {
  const invalidate = useInvalidateFiles(profileId);
  return useMutation({
    mutationFn: (fileId: string) => recordsEndpoints.remove(profileId, fileId),
    onSuccess: invalidate,
  });
}
