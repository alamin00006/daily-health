import { router } from 'expo-router';
import { CalendarCheck2, CalendarPlus, CheckCircle2, Plus, Repeat2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppointmentCard } from '@/components/doctors/appointment-card';
import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import { FOLLOW_UP_MODE_LABEL } from '@/features/doctors/doctor-display';
import { useAppointments, useFollowUpActions, useFollowUps } from '@/features/doctors/use-doctors';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { banglaClock, dhakaDate, dhakaTime, formatDate, relativeDay } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { FollowUpResponse } from '@/shared-contracts/appointments.contract';

type Scope = 'upcoming' | 'past';

function FollowUpRow({ item, profileId, editable }: { item: FollowUpResponse; profileId: string; editable: boolean }) {
  const actions = useFollowUpActions(profileId);
  const at = new Date(item.dueAt);
  const date = dhakaDate(at);
  return (
    <View className="gap-2 border-t border-line/60 pt-3">
      <View className="flex-row items-start gap-3">
        <Repeat2 size={18} color="#0f5c5a" style={{ marginTop: 3 }} />
        <View className="flex-1">
          <BanglaText variant="body-strong">{item.doctorName}</BanglaText>
          <BanglaText variant="caption">
            {relativeDay(date) || formatDate(date, false)}, {banglaClock(dhakaTime(at))} ·{' '}
            {FOLLOW_UP_MODE_LABEL[item.mode]}
            {item.location ? ` · ${item.location}` : ''}
          </BanglaText>
          {item.note ? <BanglaText variant="caption" className="text-ink">{item.note}</BanglaText> : null}
        </View>
        {item.status !== 'UPCOMING' ? (
          <StatusPill
            label={item.status === 'DONE' ? 'হয়ে গেছে' : item.status === 'MISSED' ? 'যাওয়া হয়নি' : 'বাতিল'}
            tone={item.status === 'DONE' ? 'success' : 'neutral'}
          />
        ) : null}
      </View>
      {editable && item.status === 'UPCOMING' ? (
        <View className="flex-row gap-2">
          {item.providerId && item.appointmentId ? (
            <ActionButton
              label="বুক করুন"
              size="sm"
              variant="secondary"
              icon={CalendarPlus}
              onPress={() =>
                router.push({
                  pathname: '/doctors/[providerId]/book',
                  params: { providerId: item.providerId!, parentAppointmentId: item.appointmentId! },
                })
              }
            />
          ) : null}
          <ActionButton
            label="হয়ে গেছে"
            size="sm"
            variant="outline"
            icon={CheckCircle2}
            loading={actions.update.isPending}
            onPress={() =>
              actions.update.mutate(
                { id: item.id, status: 'DONE' },
                { onError: (e) => showToast(apiErrorMessage(e)) }
              )
            }
          />
          {!item.appointmentId ? (
            <ActionButton
              label="মুছুন"
              size="sm"
              variant="ghost"
              onPress={async () => {
                const ok = await confirmAction({
                  title: 'ফলো-আপ মুছবেন?',
                  message: 'রিমাইন্ডারও বন্ধ হয়ে যাবে।',
                  confirmLabel: 'মুছুন',
                  destructive: true,
                });
                if (ok) {
                  actions.remove.mutate(item.id, { onError: (e) => showToast(apiErrorMessage(e)) });
                }
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A profile's bookings (upcoming / past) and follow-ups. */
export default function AppointmentsScreen() {
  const { profile } = useActiveProfile();
  const [scope, setScope] = useState<Scope>('upcoming');
  const appointments = useAppointments(profile?.id, scope);
  const followUps = useFollowUps(profile?.id, scope);
  const items = appointments.data?.pages.flatMap((page) => page.data) ?? [];
  const editable = canEdit(profile);

  return (
    <ScrollScreen
      header={<ScreenHeader title="অ্যাপয়েন্টমেন্ট" subtitle="বুকিং আর ফলো-আপ" fallbackHref="/doctors" />}
      onRefresh={() => Promise.all([appointments.refetch(), followUps.refetch()])}
      footer={
        editable ? (
          <ActionButton label="ডাক্তার খুঁজে বুক করুন" icon={CalendarPlus} onPress={() => router.push('/doctors')} />
        ) : undefined
      }>
      <CurrentProfileChip />
      <View className="flex-row rounded-2xl bg-primary-100 p-1">
        {(['upcoming', 'past'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === value }}
            onPress={() => setScope(value)}
            className={`min-h-[44px] flex-1 items-center justify-center rounded-xl ${scope === value ? 'bg-surface-card' : ''}`}>
            <BanglaText className={`text-[15px] leading-[22px] ${scope === value ? 'font-bangla-semibold text-primary' : 'font-bangla-medium text-ink-muted'}`}>
              {value === 'upcoming' ? 'সামনে' : 'আগের'}
            </BanglaText>
          </Pressable>
        ))}
      </View>

      {appointments.isLoading ? (
        <LoadingList rows={3} rowClassName="h-36" />
      ) : appointments.isError ? (
        <ErrorState error={appointments.error} onRetry={() => void appointments.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title={scope === 'upcoming' ? 'সামনে কোনো অ্যাপয়েন্টমেন্ট নেই' : 'আগের কোনো অ্যাপয়েন্টমেন্ট নেই'}
          message={scope === 'upcoming' ? 'ডাক্তার খুঁজে চেম্বারে সিরিয়াল বা ভিডিও পরামর্শ বুক করুন।' : undefined}
        />
      ) : (
        <View className="gap-3">
          {items.map((item) => (
            <AppointmentCard
              key={item.id}
              appointment={item}
              onPress={() => router.push({ pathname: '/appointments/[appointmentId]', params: { appointmentId: item.id } })}
            />
          ))}
          {appointments.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="ghost"
              loading={appointments.isFetchingNextPage}
              onPress={() => void appointments.fetchNextPage()}
            />
          ) : null}
        </View>
      )}

      <SurfaceCard className="gap-1">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <BanglaText variant="body-strong">ফলো-আপ</BanglaText>
            <BanglaText variant="caption">২৪ ঘণ্টা আর ২ ঘণ্টা আগে মনে করিয়ে দেওয়া হবে</BanglaText>
          </View>
          {editable && scope === 'upcoming' ? (
            <ActionButton label="যোগ করুন" size="sm" variant="secondary" icon={Plus} onPress={() => router.push('/follow-ups/new')} />
          ) : null}
        </View>
        {followUps.isLoading ? (
          <LoadingList rows={1} rowClassName="h-14" />
        ) : !followUps.data?.length ? (
          <BanglaText variant="caption" className="pt-2">
            {scope === 'upcoming' ? 'অ্যাপের বাইরের ডাক্তারের কাছে আবার যাওয়ার কথা থাকলে এখানে যোগ করুন।' : 'কিছু নেই।'}
          </BanglaText>
        ) : (
          followUps.data.map((item) => (
            <FollowUpRow key={item.id} item={item} profileId={profile!.id} editable={editable} />
          ))
        )}
      </SurfaceCard>
    </ScrollScreen>
  );
}
