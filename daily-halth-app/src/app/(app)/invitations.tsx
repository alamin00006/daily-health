import { router } from 'expo-router';
import { Check, MailOpen } from 'lucide-react-native';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  RELATION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from '@/features/profiles/profile-permissions';
import { useMyInvites, useRespondToInvite } from '@/features/profiles/use-profiles';
import { dhakaDate, formatDate } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';

/** Invitations sent to the user's email: join a family member's profile. */
export default function InvitationsScreen() {
  const invites = useMyInvites();
  const respond = useRespondToInvite();
  const pending = (invites.data ?? []).filter((i) => i.status === 'PENDING');

  return (
    <ScrollScreen
      header={<ScreenHeader title="আমন্ত্রণ" fallbackHref="/home" />}
      onRefresh={() => invites.refetch()}>
      {invites.isLoading ? (
        <LoadingList rows={2} rowClassName="h-40" />
      ) : invites.isError ? (
        <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />
      ) : pending.length === 0 ? (
        <EmptyState
          icon={MailOpen}
          title="কোনো আমন্ত্রণ নেই"
          message="কেউ আপনাকে তার পরিবারের প্রোফাইলে যোগ করলে এখানে দেখাবে।"
        />
      ) : (
        pending.map((invite) => {
          const busy = respond.isPending && respond.variables?.inviteId === invite.id;
          return (
            <SurfaceCard key={invite.id} className="gap-4">
              <View className="gap-1">
                <BanglaText variant="heading">{invite.profileName}-এর প্রোফাইল</BanglaText>
                <BanglaText variant="label" className="font-bangla text-ink-muted">
                  {invite.relation === 'SELF'
                    ? 'আপনাকে এই প্রোফাইলের রোগী হিসেবে যুক্ত করতে চাওয়া হয়েছে। গ্রহণ করলে এটি আপনার নিজের প্রোফাইল হবে।'
                    : `আপনি দেখাশোনা করবেন (${RELATION_LABELS[invite.relation]})। ভূমিকা: ${ROLE_LABELS[invite.role]}। ${ROLE_DESCRIPTIONS[invite.role]}।`}
                </BanglaText>
                <BanglaText variant="caption">
                  {formatDate(dhakaDate(new Date(invite.expiresAt)))} পর্যন্ত গ্রহণ করা যাবে
                </BanglaText>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ActionButton
                    label="না, ধন্যবাদ"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onPress={() => respond.mutate({ inviteId: invite.id, accept: false })}
                  />
                </View>
                <View className="flex-1">
                  <ActionButton
                    label="গ্রহণ করুন"
                    icon={Check}
                    size="sm"
                    loading={busy && respond.variables?.accept}
                    onPress={() =>
                      respond.mutate(
                        { inviteId: invite.id, accept: true },
                        {
                          onSuccess: () => {
                            showToast(`${invite.profileName}-এর প্রোফাইলে যুক্ত হয়েছেন`);
                            router.dismissTo('/home');
                          },
                          onError: (error) => showToast(apiErrorMessage(error)),
                        }
                      )
                    }
                  />
                </View>
              </View>
            </SurfaceCard>
          );
        })
      )}
    </ScrollScreen>
  );
}
