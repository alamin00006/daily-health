import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Apple,
  BadgeCheck,
  CalendarDays,
  Camera,
  FileText,
  FolderCheck,
  Hourglass,
  Laptop,
  MessagesSquare,
  Stethoscope,
  UserRoundPen,
  Video,
  Zap,
} from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { ListRow, SectionHeader } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SwitchRow } from '@/components/ui/switch-row';
import { QUICK_KIND_LABEL } from '@/features/consultations/consultation-display';
import { PROVIDER_TYPE_LABEL, STATUS_LABEL, STATUS_TONE, providerTitle, taka } from '@/features/doctors/doctor-display';
import { MISSING_LABEL, VERIFICATION_LABEL, VERIFICATION_TONE } from '@/features/provider/provider-display';
import {
  useAcceptQuickConsult,
  useMyProvider,
  useProviderConsultations,
  useProviderDay,
  useProviderProfileActions,
  useQuickQueue,
} from '@/features/provider/use-provider';
import { useRealtimeStore } from '@/features/realtime/realtime-connection';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, dhakaDate, dhakaTime, timeAgo } from '@/lib/bangla-format';
import { choosePhotoSource, pickPhoto } from '@/lib/pick-upload-file';
import { showToast } from '@/lib/user-feedback';
import type { MyProviderProfileResponse } from '@/shared-contracts/doctors.contract';
import { colors } from '@/theme/design-tokens';

function QueueCard({ me }: { me: MyProviderProfileResponse }) {
  const connected = useRealtimeStore((s) => s.connected);
  const canTake = me.verificationStatus === 'VERIFIED' && me.acceptsQuickConsult && me.isOnline;
  const queue = useQuickQueue(canTake);
  const accept = useAcceptQuickConsult();
  if (!me.acceptsQuickConsult || me.verificationStatus !== 'VERIFIED') return null;

  return (
    <SurfaceCard className="gap-3">
      <View className="flex-row items-center gap-2">
        <Zap size={20} color={colors.primary} />
        <BanglaText variant="heading" className="flex-1">
          দ্রুত পরামর্শের কিউ
        </BanglaText>
        {canTake ? <StatusPill label={connected ? 'লাইভ' : 'সংযোগ হচ্ছে…'} tone={connected ? 'success' : 'warning'} /> : null}
      </View>
      {!me.isOnline ? (
        <BanglaText variant="caption">অনলাইন হলে টাকা দিয়ে অপেক্ষারত রোগীদের এখানে দেখবেন।</BanglaText>
      ) : queue.isLoading ? (
        <SkeletonBlock className="h-16" />
      ) : !queue.data?.length ? (
        <View className="flex-row items-center gap-2">
          <Hourglass size={18} color={colors.inkMuted} />
          <BanglaText variant="caption">এখন কেউ অপেক্ষায় নেই। নতুন রোগী এলে সাথে সাথে দেখাবে।</BanglaText>
        </View>
      ) : (
        queue.data.map((q) => (
          <View key={q.consultationId} className="flex-row items-center gap-3 border-t border-line/60 pt-3">
            <View className="flex-1">
              <BanglaText variant="body-strong">
                {QUICK_KIND_LABEL[q.kind]} · {taka(q.fee)}
              </BanglaText>
              <BanglaText variant="caption">
                {[q.patientGender === 'FEMALE' ? 'নারী' : q.patientGender === 'MALE' ? 'পুরুষ' : null, q.patientAgeYears !== null ? `${toBanglaDigits(q.patientAgeYears)} বছর` : null]
                  .filter(Boolean)
                  .join(', ') || 'রোগী'}{' '}
                · {timeAgo(q.waitingSince)} থেকে অপেক্ষায়
              </BanglaText>
            </View>
            <ActionButton
              label="নিন"
              size="sm"
              loading={accept.isPending && accept.variables === q.consultationId}
              onPress={() =>
                accept.mutate(q.consultationId, {
                  onSuccess: (c) =>
                    router.push({ pathname: '/consultations/[consultationId]', params: { consultationId: c.id } }),
                  onError: (e) => showToast(apiErrorMessage(e)),
                })
              }
            />
          </View>
        ))
      )}
    </SurfaceCard>
  );
}

function TodayCard() {
  const today = dhakaDate();
  const day = useProviderDay(today);
  const rows = (day.data ?? []).filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT');
  return (
    <SurfaceCard className="gap-3">
      <SectionHeader title={`আজ ${toBanglaDigits(rows.length)} জন`} actionLabel="সব দেখুন" onAction={() => router.push('/provider/appointments')} />
      {day.isLoading ? (
        <SkeletonBlock className="h-16" />
      ) : rows.length === 0 ? (
        <BanglaText variant="caption">আজ আর কোনো অ্যাপয়েন্টমেন্ট বাকি নেই।</BanglaText>
      ) : (
        rows.slice(0, 4).map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/provider/appointments/[appointmentId]', params: { appointmentId: a.id } })}
            className="flex-row items-center gap-3 border-t border-line/60 pt-3 active:opacity-70">
            <View className="h-11 w-14 items-center justify-center rounded-xl bg-primary-50">
              <BanglaText className="font-bangla-semibold text-[14px] text-primary">
                {a.serialNo ? `#${toBanglaDigits(a.serialNo)}` : banglaClock(dhakaTime(new Date(a.scheduledAt))).split(' ')[1]}
              </BanglaText>
            </View>
            <View className="flex-1">
              <BanglaText variant="body-strong" numberOfLines={1}>
                {a.patient.fullName}
              </BanglaText>
              <BanglaText variant="caption">{a.mode === 'VIDEO' ? 'ভিডিও কল' : a.mode === 'CHAT' ? 'চ্যাট' : a.mode === 'HOME_VISIT' ? 'হোম ভিজিট' : 'চেম্বার'}</BanglaText>
            </View>
            <StatusPill label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
          </Pressable>
        ))
      )}
    </SurfaceCard>
  );
}

function ActiveConsultations() {
  const list = useProviderConsultations('active');
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  if (rows.length === 0) return null;
  return (
    <SurfaceCard className="gap-3">
      <BanglaText variant="heading">চলমান পরামর্শ</BanglaText>
      {rows.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/consultations/[consultationId]', params: { consultationId: c.id } })}
          className="flex-row items-center gap-3 border-t border-line/60 pt-3 active:opacity-70">
          {c.channel === 'VIDEO' ? <Video size={20} color={colors.primary} /> : <MessagesSquare size={20} color={colors.primary} />}
          <BanglaText variant="body-strong" className="flex-1" numberOfLines={1}>
            {c.patient.fullName}
          </BanglaText>
          <BanglaText variant="caption">{c.tier === 'QUICK' ? 'দ্রুত পরামর্শ' : c.appointmentCode}</BanglaText>
        </Pressable>
      ))}
    </SurfaceCard>
  );
}

/** The provider's corner of the app: status, online switch, queue, today's visits and links. */
export default function ProviderHomeScreen() {
  const me = useMyProvider();
  const actions = useProviderProfileActions();
  const p = me.data;

  function changePhoto() {
    choosePhotoSource((source) =>
      void pickPhoto(source, true).then((file) => {
        if (file) actions.setAvatar.mutate(file, { onError: (e) => showToast(apiErrorMessage(e)) });
      })
    );
  }

  return (
    <ScrollScreen header={<ScreenHeader title="সেবাদাতা" subtitle="ডাক্তার, পুষ্টিবিদ ও ফিজিওথেরাপিস্ট" fallbackHref="/home" />} onRefresh={() => me.refetch()}>
      {me.isLoading ? (
        <SkeletonBlock className="h-64" />
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : !p ? (
        <EmptyState
          icon={Stethoscope}
          title="আপনি কি ডাক্তার বা পুষ্টিবিদ?"
          message="নিবন্ধন করে অ্যাপ থেকেই রোগী দেখুন: অ্যাপয়েন্টমেন্ট, চ্যাট, ভিডিও কল আর প্রেসক্রিপশন। আপনার রোগী প্রোফাইল আগের মতোই থাকবে।"
          actionLabel="সেবাদাতা হিসেবে নিবন্ধন"
          onAction={() => router.push('/provider/register')}
        />
      ) : (
        <>
          <SurfaceCard className="flex-row items-center gap-4">
            <Pressable accessibilityRole="button" accessibilityLabel="ছবি বদলান" onPress={changePhoto} className="relative">
              {p.avatarThumbnailUrl ? (
                <Image source={{ uri: p.avatarThumbnailUrl }} style={{ width: 72, height: 72, borderRadius: 20 }} contentFit="cover" />
              ) : (
                <View className="h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-primary-100">
                  <BanglaText className="font-bangla-bold text-[28px] text-primary">{p.displayName.slice(0, 1)}</BanglaText>
                </View>
              )}
              <View className="absolute -bottom-1 -right-1 h-7 w-7 items-center justify-center rounded-full bg-primary">
                <Camera size={14} color={colors.white} />
              </View>
            </Pressable>
            <View className="flex-1 gap-1">
              <BanglaText variant="heading" numberOfLines={1}>
                {providerTitle(p.type, p.displayName)}
              </BanglaText>
              <BanglaText variant="caption">
                {PROVIDER_TYPE_LABEL[p.type]} · {p.providerCode}
                {p.bmdcNo ? ` · BMDC ${p.bmdcNo}` : ''}
              </BanglaText>
              <StatusPill label={VERIFICATION_LABEL[p.verificationStatus]} tone={VERIFICATION_TONE[p.verificationStatus]} />
            </View>
          </SurfaceCard>

          {p.verificationStatus === 'REJECTED' ? (
            <SurfaceCard className="gap-3">
              <InlineAlert tone="danger" message={`সংশোধন দরকার: ${p.rejectionReason ?? 'অ্যাডমিনের নোট দেখুন'}`} />
              <ActionButton
                label="ঠিক করেছি, আবার যাচাই করুন"
                size="sm"
                loading={actions.resubmit.isPending}
                onPress={() =>
                  actions.resubmit.mutate(undefined, {
                    onSuccess: () => showToast('আবার যাচাইয়ে পাঠানো হয়েছে'),
                    onError: (e) => showToast(apiErrorMessage(e)),
                  })
                }
              />
            </SurfaceCard>
          ) : null}
          {p.verificationStatus !== 'VERIFIED' && p.missingForVerification.length > 0 ? (
            <SurfaceCard className="gap-2">
              <BanglaText variant="body-strong">যাচাইয়ের আগে যা লাগবে</BanglaText>
              {p.missingForVerification.map((m) => (
                <BanglaText key={m} variant="caption" className="text-ink">
                  • {MISSING_LABEL[m]}
                </BanglaText>
              ))}
            </SurfaceCard>
          ) : null}
          {p.verificationStatus === 'PENDING' && p.missingForVerification.length === 0 ? (
            <InlineAlert tone="info" message="সব জমা হয়েছে। অ্যাডমিন যাচাই করলে রোগীরা আপনাকে দেখবেন।" />
          ) : null}

          {p.verificationStatus === 'VERIFIED' ? (
            <SurfaceCard className="gap-0">
              <SwitchRow
                title={p.isOnline ? 'অনলাইনে আছেন' : 'অফলাইন'}
                subtitle="অনলাইন হলে রোগীরা তালিকার উপরে দেখবেন আর দ্রুত পরামর্শ পাবেন"
                value={p.isOnline}
                disabled={actions.setOnline.isPending}
                onChange={(value) =>
                  actions.setOnline.mutate(value, { onError: (e) => showToast(apiErrorMessage(e)) })
                }
                divider
              />
              <SwitchRow
                title="দ্রুত পরামর্শ নেব"
                subtitle="টাকা দিয়ে অপেক্ষারত রোগীদের চ্যাটে উত্তর"
                value={p.acceptsQuickConsult}
                disabled={actions.update.isPending}
                onChange={(value) =>
                  actions.update.mutate({ acceptsQuickConsult: value }, { onError: (e) => showToast(apiErrorMessage(e)) })
                }
              />
            </SurfaceCard>
          ) : null}

          <QueueCard me={p} />
          {p.verificationStatus === 'VERIFIED' ? <TodayCard /> : null}
          <ActiveConsultations />

          <SurfaceCard className="gap-0">
            <ListRow icon={CalendarDays} title="অ্যাপয়েন্টমেন্ট" subtitle="দিন ধরে রোগী, দেখা হয়েছে বা আসেননি" onPress={() => router.push('/provider/appointments')} divider />
            <ListRow icon={MessagesSquare} title="পরামর্শ" subtitle="চলমান আর আগের চ্যাট ও ভিডিও" onPress={() => router.push('/provider/consultations')} divider />
            <ListRow icon={FileText} title="প্রেসক্রিপশন" subtitle="খসড়া, দেওয়া আর বাতিল" onPress={() => router.push('/provider/prescriptions')} divider />
            {p.type === 'NUTRITIONIST' ? (
              <ListRow icon={Apple} title="ডায়েট চার্ট" subtitle="ভিজিটের পর রোগীর খাবারের তালিকা" onPress={() => router.push('/provider/diet-plans')} divider />
            ) : null}
            <ListRow icon={UserRoundPen} title="প্রোফাইল সম্পাদনা" subtitle="ডিগ্রি, বিশেষজ্ঞতা, ফি" onPress={() => router.push('/provider/edit')} divider />
            <ListRow icon={FolderCheck} title="যাচাইয়ের কাগজপত্র" subtitle={`${toBanglaDigits(p.documents.length)}টি জমা`} onPress={() => router.push('/provider/documents')} />
          </SurfaceCard>

          <View className="flex-row items-start gap-2 rounded-2xl bg-primary-50 p-3">
            <Laptop size={18} color={colors.primary} style={{ marginTop: 3 }} />
            <BanglaText variant="caption" className="flex-1 text-ink">
              চেম্বার ও সময়সূচি, আয় ও পেআউট ওয়েব প্যানেল থেকে সাজান; একই ইমেইল আর পিন দিয়ে লগইন করুন।
            </BanglaText>
          </View>
          {p.verificationStatus === 'VERIFIED' ? (
            <View className="flex-row items-center justify-center gap-1">
              <BadgeCheck size={14} color={colors.success} />
              <BanglaText variant="caption">রোগীরা আপনাকে দেখতে পাচ্ছেন</BanglaText>
            </View>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
