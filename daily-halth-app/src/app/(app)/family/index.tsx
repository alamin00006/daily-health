import { router } from 'expo-router';
import { Mail, MoreVertical, UserPlus, UsersRound } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ListRow, SectionHeader } from '@/components/ui/list-row';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SwitchRow } from '@/components/ui/switch-row';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  canManageMembers,
  RELATION_LABELS,
  ROLE_LABELS,
} from '@/features/profiles/profile-permissions';
import {
  useActiveProfile,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMember,
} from '@/features/profiles/use-profiles';
import { formatDate, dhakaDate } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { ProfileMemberResponse, ProfileRole } from '@/shared-contracts/profiles.contract';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme/design-tokens';

export default function FamilyScreen() {
  const myUserId = useSessionStore((s) => s.user?.id);
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const isOwner = canManageMembers(profile);
  const members = useMembers(profile?.id);
  const invites = useInvites(profile?.id, isOwner);
  const updateMember = useUpdateMember(profileId);
  const removeMember = useRemoveMember(profileId);
  const revokeInvite = useRevokeInvite(profileId);

  const me = members.data?.find((m) => m.userId === myUserId);

  const changeRole = (member: ProfileMemberResponse) => {
    const roles: ProfileRole[] = ['OWNER', 'CAREGIVER', 'VIEWER'];
    Alert.alert(member.displayName ?? member.email ?? 'সদস্য', 'কী করতে পারবেন?', [
      ...roles
        .filter((role) => role !== member.role)
        .map((role) => ({
          text: ROLE_LABELS[role],
          onPress: () =>
            updateMember.mutate(
              { userId: member.userId, body: { role } },
              { onError: (error) => showToast(apiErrorMessage(error)) }
            ),
        })),
      {
        text: 'প্রোফাইল থেকে বাদ দিন',
        style: 'destructive' as const,
        onPress: async () => {
          const ok = await confirmAction({
            title: 'সদস্যকে বাদ দেবেন?',
            message: 'তিনি আর এই প্রোফাইল দেখতে পারবেন না।',
            confirmLabel: 'বাদ দিন',
            destructive: true,
          });
          if (ok)
            removeMember.mutate(member.userId, {
              onError: (error) => showToast(apiErrorMessage(error)),
            });
        },
      },
      { text: 'বাতিল', style: 'cancel' as const },
    ]);
  };

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title="পরিবার ও সদস্য"
          subtitle={profile ? `${profile.fullName}-এর প্রোফাইল` : undefined}
          fallbackHref="/health"
        />
      }
      onRefresh={() => Promise.all([members.refetch(), invites.refetch()])}
      footer={
        isOwner ? (
          <ActionButton
            label="কাউকে আমন্ত্রণ জানান"
            icon={UserPlus}
            onPress={() => router.push('/family/invite')}
          />
        ) : undefined
      }>
      <BanglaText variant="label" className="font-bangla text-ink-muted">
        যাদের যোগ করবেন তারা নিজের ফোন থেকে এই প্রোফাইলের ওষুধ, রিপোর্ট আর মাপ দেখতে পারবেন। ওষুধ
        বাদ পড়লে সতর্কবার্তাও পাবেন।
      </BanglaText>

      {members.isLoading ? (
        <LoadingList rows={2} rowClassName="h-16" />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <SurfaceCard className="py-2">
          {(members.data ?? []).map((member, index, list) => {
            const isMe = member.userId === myUserId;
            const name = member.displayName ?? member.email ?? 'সদস্য';
            return (
              <ListRow
                key={member.userId}
                leading={<ProfileAvatar name={name} size="sm" />}
                title={isMe ? `${name} (আপনি)` : name}
                subtitle={[
                  member.isPatient
                    ? 'রোগী নিজে'
                    : member.relation === 'OTHER'
                      ? null
                      : `রোগী তার ${RELATION_LABELS[member.relation]}`,
                  // The email only when there is no name (it wraps badly next to a name).
                  member.displayName ? null : member.email,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <View className="flex-row items-center gap-1">
                    <StatusPill
                      label={ROLE_LABELS[member.role]}
                      tone={member.role === 'OWNER' ? 'info' : 'neutral'}
                    />
                    {isOwner && !isMe ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${name}-এর ভূমিকা বদলান`}
                        hitSlop={10}
                        onPress={() => changeRole(member)}
                        className="h-9 w-9 items-center justify-center rounded-full active:bg-primary-50">
                        <MoreVertical size={18} color={colors.inkMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                }
                divider={index < list.length - 1}
              />
            );
          })}
        </SurfaceCard>
      )}

      {me ? (
        <View className="gap-3">
          <SectionHeader title="আমার সেটিংস" />
          <SurfaceCard className="py-1">
            <SwitchRow
              title="সতর্কবার্তা পাব"
              subtitle="ওষুধ সময়মতো না খেলে বা ফুরিয়ে এলে আমাকে জানাবে"
              value={me.receivesAlerts}
              onChange={(receivesAlerts) =>
                updateMember.mutate(
                  { userId: me.userId, body: { receivesAlerts } },
                  { onError: (error) => showToast(apiErrorMessage(error)) }
                )
              }
              disabled={updateMember.isPending}
            />
          </SurfaceCard>
          {me.relation !== 'SELF' ? (
            <ActionButton
              label="এই প্রোফাইল ছেড়ে দিন"
              variant="ghost"
              size="sm"
              onPress={async () => {
                const ok = await confirmAction({
                  title: 'প্রোফাইল ছেড়ে দেবেন?',
                  message: 'আবার দেখতে চাইলে মালিকের কাছ থেকে নতুন আমন্ত্রণ লাগবে।',
                  confirmLabel: 'ছেড়ে দিন',
                  destructive: true,
                });
                if (!ok) return;
                removeMember.mutate(me.userId, {
                  onSuccess: () => router.dismissTo('/health'),
                  onError: (error) => showToast(apiErrorMessage(error)),
                });
              }}
            />
          ) : null}
        </View>
      ) : null}

      {isOwner ? (
        <View className="gap-3">
          <SectionHeader title="অপেক্ষমাণ আমন্ত্রণ" />
          {(invites.data ?? []).filter((i) => i.status === 'PENDING').length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="কোনো আমন্ত্রণ অপেক্ষায় নেই"
              message="ভাই-বোন বা অন্য কেউ দেখাশোনায় সাহায্য করতে চাইলে তাদের ইমেইলে আমন্ত্রণ পাঠান।"
            />
          ) : (
            <SurfaceCard className="py-2">
              {(invites.data ?? [])
                .filter((i) => i.status === 'PENDING')
                .map((invite, index, list) => (
                  <ListRow
                    key={invite.id}
                    icon={Mail}
                    title={invite.invitedEmail}
                    subtitle={`${ROLE_LABELS[invite.role]} · ${formatDate(dhakaDate(new Date(invite.expiresAt)))} পর্যন্ত`}
                    trailing={
                      <Pressable
                        accessibilityRole="button"
                        onPress={async () => {
                          const ok = await confirmAction({
                            title: 'আমন্ত্রণ বাতিল করবেন?',
                            message: invite.invitedEmail,
                            confirmLabel: 'বাতিল করুন',
                            destructive: true,
                          });
                          if (ok) revokeInvite.mutate(invite.id);
                        }}
                        className="min-h-touch justify-center px-2">
                        <BanglaText variant="label" className="font-bangla-semibold text-danger">
                          বাতিল
                        </BanglaText>
                      </Pressable>
                    }
                    divider={index < list.length - 1}
                  />
                ))}
            </SurfaceCard>
          )}
        </View>
      ) : null}
    </ScrollScreen>
  );
}
