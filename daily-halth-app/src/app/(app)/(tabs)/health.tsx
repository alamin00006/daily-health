import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  Camera,
  Copy,
  FileText,
  Pencil,
  Plus,
  QrCode,
  Settings,
  ShieldPlus,
  UsersRound,
} from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { CreateOwnProfileCard, GuestNotice } from '@/components/app/account-gates';
import { BanglaText } from '@/components/ui/bangla-text';
import { ListRow, SectionHeader } from '@/components/ui/list-row';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { IconButton } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, LoadingList, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  CONDITION_KIND_META,
  FILE_TYPE_LABELS,
  VITAL_META,
  VITAL_STATUS_META,
  VITAL_TYPES,
  formatVitalValue,
} from '@/features/health/health-display';
import { useConditions, useLatestVitals } from '@/features/health/use-health';
import { canEdit, relationLabel, ROLE_LABELS } from '@/features/profiles/profile-permissions';
import { useActiveProfile, useSetAvatar } from '@/features/profiles/use-profiles';
import { useMedicalFiles } from '@/features/records/use-records';
import { apiErrorMessage } from '@/api/api-error-messages';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { ageInYears, formatDate, formatNumber } from '@/lib/bangla-format';
import { choosePhotoSource, pickPhoto } from '@/lib/pick-upload-file';
import { showToast } from '@/lib/user-feedback';
import type { PatientProfileResponse } from '@/shared-contracts/profiles.contract';
import { useActiveProfileStore } from '@/stores/active-profile-store';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme/design-tokens';

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
const GENDER_LABELS = { MALE: 'পুরুষ', FEMALE: 'নারী', OTHER: 'অন্যান্য' } as const;

function ProfileCard({ profile }: { profile: PatientProfileResponse }) {
  const setAvatar = useSetAvatar(profile.id);
  const editable = canEdit(profile);
  const facts = [
    GENDER_LABELS[profile.gender],
    profile.dateOfBirth ? `${toBanglaDigits(ageInYears(profile.dateOfBirth))} বছর` : null,
    profile.bloodGroup ? `রক্ত ${BLOOD_GROUP_LABELS[profile.bloodGroup]}` : null,
    profile.heightCm ? `${formatNumber(profile.heightCm, 0)} সেমি` : null,
  ].filter(Boolean);

  const changePhoto = () =>
    choosePhotoSource((source) => {
      void pickPhoto(source, true).then((file) => {
        if (!file) return;
        setAvatar.mutate(file, {
          onSuccess: () => showToast('ছবি বদলানো হয়েছে'),
          onError: (error) => showToast(apiErrorMessage(error)),
        });
      });
    });

  return (
    <SurfaceCard className="gap-4">
      <View className="flex-row items-center gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="প্রোফাইল ছবি বদলান"
          disabled={!editable || setAvatar.isPending}
          onPress={changePhoto}>
          <ProfileAvatar name={profile.fullName} photoUrl={profile.avatarUrl} size="lg" />
          {editable ? (
            <View className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-2 border-surface-card bg-primary">
              {setAvatar.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Camera size={14} color={colors.white} strokeWidth={2.2} />
              )}
            </View>
          ) : null}
        </Pressable>
        <View className="flex-1 gap-1">
          <BanglaText variant="title" className="text-[21px] leading-[30px]" numberOfLines={2}>
            {profile.fullName}
          </BanglaText>
          <View className="flex-row flex-wrap gap-1.5">
            <StatusPill label={relationLabel(profile)} tone="info" />
            {profile.myRelation !== 'SELF' ? (
              <StatusPill label={ROLE_LABELS[profile.myRole]} tone="neutral" />
            ) : null}
          </View>
        </View>
      </View>

      <BanglaText variant="label" className="font-bangla text-ink-muted">
        {facts.join(' · ')}
        {profile.district ? ` · ${profile.district}` : ''}
      </BanglaText>

      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`রোগীর আইডি ${profile.patientCode}, কপি করুন`}
          onPress={() => {
            void Clipboard.setStringAsync(profile.patientCode);
            showToast('আইডি কপি হয়েছে');
          }}
          className="flex-1 flex-row items-center justify-between rounded-2xl bg-primary-50 px-4 py-2.5 active:bg-primary-100">
          <View>
            <BanglaText variant="caption">রোগীর আইডি</BanglaText>
            <BanglaText className="font-bangla-bold text-[17px] leading-[24px] tracking-wider text-primary">
              {profile.patientCode}
            </BanglaText>
          </View>
          <Copy size={18} color={colors.primary} />
        </Pressable>
        {editable ? (
          <IconButton
            icon={Pencil}
            label="তথ্য বদলান"
            onPress={() =>
              router.push({ pathname: '/profiles/edit', params: { profileId: profile.id } })
            }
          />
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function FamilyStrip({
  profiles,
  activeId,
}: {
  profiles: PatientProfileResponse[];
  activeId: string;
}) {
  const setActive = useActiveProfileStore((s) => s.setActiveProfile);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 pr-5">
      {profiles.map((p) => {
        const active = p.id === activeId;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${p.fullName}, ${relationLabel(p)}`}
            onPress={() => setActive(p.id)}
            className="w-[76px] items-center gap-1.5">
            <View className={`rounded-full p-0.5 ${active ? 'bg-primary' : 'bg-transparent'}`}>
              <ProfileAvatar
                name={p.fullName}
                photoUrl={p.avatarThumbnailUrl}
                size="md"
                ringed={active}
              />
            </View>
            <BanglaText
              variant="caption"
              numberOfLines={1}
              className={active ? 'font-bangla-semibold text-primary' : 'text-ink-muted'}>
              {relationLabel(p)}
            </BanglaText>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="পরিবারের সদস্য যোগ করুন"
        onPress={() => router.push('/profiles/new')}
        className="w-[76px] items-center gap-1.5">
        <View className="h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-dashed border-primary-300 bg-primary-50">
          <Plus size={22} color={colors.primary} />
        </View>
        <BanglaText variant="caption" className="text-primary">
          যোগ করুন
        </BanglaText>
      </Pressable>
    </ScrollView>
  );
}

function VitalsGrid({ profileId }: { profileId: string }) {
  const latest = useLatestVitals(profileId);
  if (latest.isLoading) return <SkeletonBlock className="h-40" />;
  const byType = new Map((latest.data ?? []).map((r) => [r.type, r]));
  return (
    <View className="flex-row flex-wrap gap-3">
      {VITAL_TYPES.map((type) => {
        const reading = byType.get(type);
        const meta = VITAL_META[type];
        const Icon = meta.icon;
        const status = reading?.status ? VITAL_STATUS_META[reading.status] : null;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            onPress={() =>
              reading
                ? router.push({ pathname: '/vitals', params: { type } })
                : router.push({ pathname: '/vitals/new', params: { type } })
            }
            style={{ width: '48%' }}
            className="flex-grow gap-1.5 rounded-3xl border border-line/70 bg-surface-card p-4 active:bg-primary-50">
            <View className="flex-row items-center gap-2">
              <Icon size={17} color={colors.primary} strokeWidth={2} />
              <BanglaText variant="caption" className="font-bangla-medium text-ink">
                {meta.shortLabel}
              </BanglaText>
            </View>
            {reading ? (
              <>
                <BanglaText className="font-bangla-bold text-[20px] leading-[28px]">
                  {formatVitalValue(reading)}
                  <BanglaText variant="caption"> {meta.unit}</BanglaText>
                </BanglaText>
                {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
              </>
            ) : (
              <BanglaText variant="caption" className="text-primary">
                + মাপ লিখুন
              </BanglaText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function ConditionsSummary({ profileId }: { profileId: string }) {
  const conditions = useConditions(profileId);
  const items = conditions.data ?? [];
  return (
    <SurfaceCard className="gap-3">
      <ListRow
        icon={ShieldPlus}
        title="রোগ ও অ্যালার্জি"
        subtitle={
          items.length === 0
            ? 'ডায়াবেটিস, উচ্চ রক্তচাপ, ওষুধে অ্যালার্জি ইত্যাদি লিখে রাখুন'
            : `${toBanglaDigits(items.length)}টি তথ্য`
        }
        onPress={() => router.push('/conditions')}
      />
      {items.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {items.slice(0, 6).map((c) => (
            <StatusPill key={c.id} label={c.name} tone={CONDITION_KIND_META[c.kind].tone} />
          ))}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

function RecentFiles({ profileId }: { profileId: string }) {
  const files = useMedicalFiles(profileId);
  const recent = files.data?.pages[0]?.data.slice(0, 3) ?? [];
  return (
    <SurfaceCard className="gap-1">
      <ListRow
        icon={FileText}
        title="রিপোর্ট ও প্রেসক্রিপশন"
        subtitle={
          recent.length === 0 ? 'ল্যাব রিপোর্ট বা প্রেসক্রিপশনের ছবি রেখে দিন' : 'সব ফাইল দেখুন'
        }
        onPress={() => router.push('/records')}
        divider={recent.length > 0}
      />
      {recent.map((file, index) => (
        <ListRow
          key={file.id}
          title={file.title}
          subtitle={`${FILE_TYPE_LABELS[file.type]}${file.reportDate ? ` · ${formatDate(file.reportDate)}` : ''}`}
          onPress={() =>
            router.push({ pathname: '/records/[fileId]', params: { fileId: file.id } })
          }
          divider={index < recent.length - 1}
        />
      ))}
    </SurfaceCard>
  );
}

export default function HealthProfileScreen() {
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? false);
  const { profile, profiles, isLoading, isError, refetch } = useActiveProfile();

  const header = (
    <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
      <BanglaText variant="title">স্বাস্থ্য প্রোফাইল</BanglaText>
      {isGuest ? null : (
        <IconButton icon={Settings} label="সেটিংস" onPress={() => router.push('/settings')} />
      )}
    </View>
  );

  if (isGuest) {
    return (
      <ScrollScreen inTabs header={header}>
        <GuestNotice what="স্বাস্থ্য প্রোফাইল, রিপোর্ট আর পরিবারের তথ্য" />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen inTabs header={header} onRefresh={() => Promise.resolve(refetch())}>
      {isLoading ? (
        <LoadingList rows={3} rowClassName="h-36" />
      ) : isError ? (
        <ErrorState error={null} onRetry={() => void refetch()} />
      ) : !profile ? (
        <CreateOwnProfileCard />
      ) : (
        <>
          <FamilyStrip profiles={profiles} activeId={profile.id} />
          <ProfileCard profile={profile} />

          <View className="gap-3">
            <SectionHeader
              title="ভাইটালস"
              actionLabel="মাপ লিখুন"
              onAction={() => router.push('/vitals/new')}
            />
            <VitalsGrid profileId={profile.id} />
          </View>

          <ConditionsSummary profileId={profile.id} />
          <RecentFiles profileId={profile.id} />

          <SurfaceCard className="gap-1">
            <ListRow
              icon={QrCode}
              title="QR হেলথ কার্ড"
              subtitle="জরুরি অবস্থায় ডাক্তার স্ক্যান করে রক্তের গ্রুপ, রোগ আর অ্যালার্জি দেখতে পারবেন"
              onPress={() => router.push('/health-card')}
              divider
            />
            <ListRow
              icon={UsersRound}
              title="পরিবার ও সদস্য"
              subtitle="কে কে এই প্রোফাইল দেখতে ও দেখাশোনা করতে পারেন"
              onPress={() => router.push('/family')}
            />
          </SurfaceCard>
        </>
      )}
    </ScrollScreen>
  );
}
