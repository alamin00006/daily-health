import * as Clipboard from 'expo-clipboard';
import { QrCode, RefreshCw, ScanLine, Share2, ShieldOff } from 'lucide-react-native';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { ListRow, SectionHeader } from '@/components/ui/list-row';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  useHealthCard,
  useHealthCardAccesses,
  useHealthCardActions,
} from '@/features/health/use-health';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { ageInYears, timeAgo } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import { colors, shadows } from '@/theme/design-tokens';

const BLOOD_GROUP_LABELS: Record<string, string> = {
  A_POS: 'A+',
  A_NEG: 'A−',
  B_POS: 'B+',
  B_NEG: 'B−',
  AB_POS: 'AB+',
  AB_NEG: 'AB−',
  O_POS: 'O+',
  O_NEG: 'O−',
};

/** QR digital health card: what an emergency doctor scans to see blood group, conditions and allergies. */
export default function HealthCardScreen() {
  const { profile } = useActiveProfile();
  const card = useHealthCard(profile?.id);
  const { issue, revoke } = useHealthCardActions(profile?.id ?? '');
  const active = card.data?.isActive ? card.data : null;
  const accesses = useHealthCardAccesses(profile?.id, Boolean(active));
  const editable = canEdit(profile);
  const scans = accesses.data?.pages.flatMap((p) => p.data) ?? [];

  const issueCard = (replace: boolean) =>
    void (async () => {
      if (replace) {
        const ok = await confirmAction({
          title: 'নতুন QR কোড বানাবেন?',
          message: 'আগের কার্ড (ছাপানো বা কাউকে পাঠানো) আর কাজ করবে না।',
          confirmLabel: 'নতুন বানান',
        });
        if (!ok) return;
      }
      issue.mutate(undefined, {
        onSuccess: () => showToast('হেলথ কার্ড তৈরি হয়েছে'),
        onError: (error) => showToast(apiErrorMessage(error)),
      });
    })();

  return (
    <ScrollScreen
      header={
        <ScreenHeader title="QR হেলথ কার্ড" subtitle={profile?.fullName} fallbackHref="/health" />
      }
      onRefresh={() => Promise.all([card.refetch(), accesses.refetch()])}>
      {card.isLoading || !profile ? (
        <SkeletonBlock className="h-96" />
      ) : card.isError ? (
        <ErrorState error={card.error} onRetry={() => void card.refetch()} />
      ) : !active ? (
        <>
          <EmptyState
            icon={QrCode}
            title={card.data ? 'কার্ডটি বন্ধ করা আছে' : 'এখনো হেলথ কার্ড নেই'}
            message="জরুরি অবস্থায় ডাক্তার বা হাসপাতাল এই QR স্ক্যান করে রক্তের গ্রুপ, দীর্ঘমেয়াদি রোগ আর অ্যালার্জি সাথে সাথে জানতে পারবেন। লগইন লাগবে না।"
            actionLabel={editable ? 'হেলথ কার্ড তৈরি করুন' : undefined}
            onAction={() => issueCard(false)}
          />
        </>
      ) : (
        <>
          <View style={shadows.raised} className="gap-5 overflow-hidden rounded-4xl bg-primary p-5">
            <View
              pointerEvents="none"
              className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary-500/60"
            />
            <View className="flex-row items-center gap-3">
              <ProfileAvatar
                name={profile.fullName}
                photoUrl={profile.avatarThumbnailUrl}
                size="md"
                ringed
              />
              <View className="flex-1">
                <BanglaText variant="heading" className="text-white" numberOfLines={1}>
                  {profile.fullName}
                </BanglaText>
                <BanglaText variant="caption" className="text-primary-100">
                  {profile.patientCode}
                  {profile.dateOfBirth
                    ? ` · ${toBanglaDigits(ageInYears(profile.dateOfBirth))} বছর`
                    : ''}
                  {profile.bloodGroup ? ` · রক্ত ${BLOOD_GROUP_LABELS[profile.bloodGroup]}` : ''}
                </BanglaText>
              </View>
            </View>
            <View className="items-center self-center rounded-3xl bg-white p-4">
              <QRCode
                value={active.scanUrl}
                size={210}
                color={colors.ink}
                backgroundColor="#ffffff"
                ecl="M"
              />
            </View>
            <View className="flex-row items-center justify-center gap-2">
              <ScanLine size={16} color={colors.primary100} />
              <BanglaText variant="caption" className="text-primary-100">
                জরুরি অবস্থায় যেকোনো ফোনের ক্যামেরা দিয়ে স্ক্যান করুন
              </BanglaText>
            </View>
          </View>

          <InlineAlert message="স্ক্রিনশট নিয়ে রাখুন বা ছাপিয়ে মানিব্যাগে রাখুন। কার্ড হারালে নিচে নতুন QR বানান, আগেরটা বন্ধ হয়ে যাবে।" />

          <ActionButton
            label="লিংক শেয়ার করুন"
            icon={Share2}
            variant="secondary"
            onPress={() =>
              void Share.share({
                message: `${profile.fullName}-এর জরুরি স্বাস্থ্য তথ্য (দৈনিক স্বাস্থ্য): ${active.scanUrl}`,
              }).catch(() => {
                void Clipboard.setStringAsync(active.scanUrl);
                showToast('লিংক কপি হয়েছে');
              })
            }
          />

          <View className="gap-3">
            <SectionHeader title="কে কখন স্ক্যান করেছে" />
            {scans.length === 0 ? (
              <BanglaText variant="caption">এখনো কেউ স্ক্যান করেনি।</BanglaText>
            ) : (
              <SurfaceCard className="py-1">
                {scans.slice(0, 10).map((scan, index, list) => (
                  <ListRow
                    key={scan.id}
                    icon={ScanLine}
                    iconTone="neutral"
                    title={scan.byLoggedInUser ? 'অ্যাপ ব্যবহারকারী' : 'অজানা ফোন থেকে'}
                    subtitle={timeAgo(scan.accessedAt)}
                    divider={index < list.length - 1}
                  />
                ))}
              </SurfaceCard>
            )}
          </View>

          {editable ? (
            <View className="gap-2">
              <ActionButton
                label="নতুন QR কোড বানান"
                icon={RefreshCw}
                variant="outline"
                size="sm"
                loading={issue.isPending}
                onPress={() => issueCard(true)}
              />
              <ActionButton
                label="কার্ড বন্ধ করুন"
                icon={ShieldOff}
                variant="danger"
                size="sm"
                loading={revoke.isPending}
                onPress={async () => {
                  const ok = await confirmAction({
                    title: 'কার্ড বন্ধ করবেন?',
                    message:
                      'স্ক্যান করলে আর কোনো তথ্য দেখাবে না। পরে আবার চালু করা যাবে (নতুন QR)।',
                    confirmLabel: 'বন্ধ করুন',
                    destructive: true,
                  });
                  if (ok)
                    revoke.mutate(undefined, {
                      onError: (error) => showToast(apiErrorMessage(error)),
                    });
                }}
              />
            </View>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
