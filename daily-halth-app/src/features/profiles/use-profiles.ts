import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { UploadFile } from '@/api/http-client';
import { profilesEndpoints } from '@/api/profiles-endpoints';
import { queryKeys } from '@/api/query-keys';
import type {
  CreateInviteRequest,
  CreateProfileRequest,
  PatientProfileResponse,
  UpdateMemberRequest,
  UpdateProfileRequest,
} from '@/shared-contracts/profiles.contract';
import { useActiveProfileStore } from '@/stores/active-profile-store';
import { useSessionStore } from '@/stores/session-store';

/** Profiles the user can see: own first, then family. Not for guests. */
export function useProfiles() {
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? true);
  return useQuery({
    queryKey: queryKeys.profiles,
    queryFn: async () => (await profilesEndpoints.list()).data,
    enabled: !isGuest,
    staleTime: 5 * 60_000,
  });
}

/**
 * The family member every tab shows. Falls back to the user's own profile
 * (or the first one) when nothing is selected or the selection was removed.
 */
export function useActiveProfile(): {
  profile: PatientProfileResponse | null;
  profiles: PatientProfileResponse[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
} {
  const query = useProfiles();
  const activeProfileId = useActiveProfileStore((s) => s.activeProfileId);
  const profiles = query.data ?? [];
  const profile =
    profiles.find((p) => p.id === activeProfileId) ??
    profiles.find((p) => p.myRelation === 'SELF') ??
    profiles[0] ??
    null;
  return {
    profile,
    profiles,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Keeps the cached list and the single-profile cache in step after a change. */
function useStoreProfile() {
  const queryClient = useQueryClient();
  return (profile: PatientProfileResponse) => {
    queryClient.setQueryData<PatientProfileResponse[]>(queryKeys.profiles, (list) =>
      list ? list.map((p) => (p.id === profile.id ? profile : p)) : list
    );
    queryClient.setQueryData(queryKeys.profile(profile.id), profile);
  };
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  const setActiveProfile = useActiveProfileStore((s) => s.setActiveProfile);
  return useMutation({
    mutationFn: (body: CreateProfileRequest) => profilesEndpoints.create(body),
    onSuccess: async (profile) => {
      setActiveProfile(profile.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
    },
  });
}

export function useUpdateProfile(profileId: string) {
  const storeProfile = useStoreProfile();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => profilesEndpoints.update(profileId, body),
    onSuccess: storeProfile,
  });
}

export function useSetAvatar(profileId: string) {
  const storeProfile = useStoreProfile();
  return useMutation({
    mutationFn: (file: UploadFile) => profilesEndpoints.setAvatar(profileId, file),
    onSuccess: storeProfile,
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  const clearActive = useActiveProfileStore((s) => s.clear);
  return useMutation({
    mutationFn: (profileId: string) => profilesEndpoints.remove(profileId),
    onSuccess: async (_result, profileId) => {
      clearActive();
      queryClient.removeQueries({ queryKey: ['profile', profileId] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
    },
  });
}

export function useMembers(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.members(profileId ?? ''),
    queryFn: async () => (await profilesEndpoints.members(profileId!)).data,
    enabled: Boolean(profileId),
  });
}

export function useUpdateMember(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UpdateMemberRequest }) =>
      profilesEndpoints.updateMember(profileId, userId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
      ]);
    },
  });
}

export function useRemoveMember(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => profilesEndpoints.removeMember(profileId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.members(profileId) }),
  });
}

/** Pending invites of a profile (OWNER only on the API). */
export function useInvites(profileId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invites(profileId ?? ''),
    queryFn: async () => (await profilesEndpoints.invites(profileId!)).data,
    enabled: Boolean(profileId) && enabled,
  });
}

export function useCreateInvite(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteRequest) => profilesEndpoints.createInvite(profileId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites(profileId) }),
  });
}

export function useRevokeInvite(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => profilesEndpoints.revokeInvite(profileId, inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites(profileId) }),
  });
}

/** Invites sent to the user's email, shown on the home screen. */
export function useMyInvites() {
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? true);
  return useQuery({
    queryKey: queryKeys.myInvites,
    queryFn: async () => (await profilesEndpoints.myInvites()).data,
    enabled: !isGuest,
  });
}

export function useRespondToInvite() {
  const queryClient = useQueryClient();
  const setActiveProfile = useActiveProfileStore((s) => s.setActiveProfile);
  return useMutation({
    mutationFn: async ({ inviteId, accept }: { inviteId: string; accept: boolean }) =>
      accept ? profilesEndpoints.acceptInvite(inviteId) : profilesEndpoints.declineInvite(inviteId),
    onSuccess: async (result) => {
      if (result) setActiveProfile(result.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myInvites }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
      ]);
    },
  });
}

/** Loads the remembered family member once per app start. */
export function useLoadActiveProfile(): boolean {
  const loaded = useActiveProfileStore((s) => s.loaded);
  const load = useActiveProfileStore((s) => s.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  return loaded;
}
