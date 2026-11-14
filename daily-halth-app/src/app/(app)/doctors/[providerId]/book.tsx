import { router, useLocalSearchParams } from 'expo-router';
import { Building2, CalendarX2, CheckCircle2, Home } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  MODE_ICON,
  MODE_LABEL,
  providerTitle,
  taka,
} from '@/features/doctors/doctor-display';
import { useAvailability, useBookAppointment, useProvider } from '@/features/doctors/use-doctors';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, BANGLA_WEEKDAYS_SHORT, dhakaDate, formatDate } from '@/lib/bangla-format';
import type { AvailabilitySessionResponse } from '@/shared-contracts/appointments.contract';
import type { ConsultationMode } from '@/shared-contracts/doctors.contract';
import { colors } from '@/theme/design-tokens';

/** Rough time of the next serial: the session spread evenly over its serials. */
function serialEstimate(session: AvailabilitySessionResponse): string | null {
  if (!session.nextSerial || !session.maxPatients) return null;
  const [sh, sm] = session.startTime.split(':').map(Number) as [number, number];
  const [eh, em] = session.endTime.split(':').map(Number) as [number, number];
  const perSerial = Math.max(5, Math.floor((eh * 60 + em - (sh * 60 + sm)) / session.maxPatients));
  const at = sh * 60 + sm + (session.nextSerial - 1) * perSerial;
  return banglaClock(`${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`);
}

export default function BookScreen() {
  const { providerId, parentAppointmentId } = useLocalSearchParams<{
    providerId: string;
    parentAppointmentId?: string;
  }>();
  const provider = useProvider(providerId);
  const { profile } = useActiveProfile();
  const book = useBookAppointment(profile?.id ?? '');
  const p = provider.data;

  const [mode, setMode] = useState<ConsultationMode | null>(null);
  const activeMode = mode ?? p?.modes[0] ?? null;
  const availability = useAvailability(providerId, activeMode);
  const [date, setDate] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [slotTime, setSlotTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const days = availability.data ?? [];
  const firstOpen = days.find((d) => d.sessions.some((s) => s.bookable))?.date ?? null;
  const activeDate = date ?? firstOpen;
  const day = days.find((d) => d.date === activeDate);
  const session = day?.sessions.find((s) => s.scheduleId === scheduleId) ??
    (day?.sessions.length === 1 && day.sessions[0]!.bookable ? day.sessions[0] : undefined);
  const isInPerson = activeMode === 'IN_PERSON';
  const ready =
    session?.bookable &&
    (isInPerson || slotTime) &&
    (activeMode !== 'HOME_VISIT' || homeAddress.trim().length >= 5);

  const fee = session?.fee ?? null;

  function chooseMode(next: ConsultationMode) {
    setMode(next);
    setDate(null);
    setScheduleId(null);
    setSlotTime(null);
    setError(null);
  }

  function submit() {
    if (!profile || !session || !activeDate) return;
    setError(null);
    book.mutate(
      {
        providerId: providerId!,
        scheduleId: session.scheduleId,
        date: activeDate,
        slotTime: isInPerson ? undefined : (slotTime ?? undefined),
        reason: reason.trim() || undefined,
        homeAddress: activeMode === 'HOME_VISIT' ? homeAddress.trim() : undefined,
        parentAppointmentId: parentAppointmentId || undefined,
      },
      {
        onSuccess: (appointment) =>
          router.replace({
            pathname: '/appointments/[appointmentId]',
            params: { appointmentId: appointment.id, justBooked: '1' },
          }),
        onError: (e) => {
          setError(apiErrorMessage(e));
          void availability.refetch();
          setSlotTime(null);
        },
      }
    );
  }

  const header = (
    <ScreenHeader
      title="অ্যাপয়েন্টমেন্ট নিন"
      subtitle={p ? providerTitle(p.type, p.displayName) : undefined}
      backIcon="close"
      fallbackHref="/doctors"
    />
  );

  if (profile && !canEdit(profile)) {
    return (
      <ScrollScreen header={header}>
        <CurrentProfileChip />
        <EmptyState
          icon={CalendarX2}
          title="এই প্রোফাইলে বুক করার অনুমতি নেই"
          message="আপনি শুধু দেখতে পারেন। বুক করতে প্রোফাইলের মালিক বা যত্নকারীকে বলুন, অথবা অন্য প্রোফাইল বেছে নিন।"
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      header={header}
      footer={
        <View className="gap-2">
          {fee !== null ? (
            <View className="flex-row items-center justify-between">
              <BanglaText variant="caption">
                {session ? `${formatDate(activeDate!, false)}, ${isInPerson ? `সিরিয়াল ${toBanglaDigits(session.nextSerial ?? 0)}` : slotTime ? banglaClock(slotTime) : 'সময় বেছে নিন'}` : ''}
              </BanglaText>
              <BanglaText className="font-bangla-bold text-[18px] leading-[28px] text-primary">
                {taka(fee)}
              </BanglaText>
            </View>
          ) : null}
          <ActionButton
            label={fee ? 'বুক করে পেমেন্টে যান' : 'বুক করুন'}
            icon={CheckCircle2}
            disabled={!ready}
            loading={book.isPending}
            onPress={submit}
          />
        </View>
      }>
      <View className="gap-2">
        <BanglaText variant="label">কার জন্য</BanglaText>
        <CurrentProfileChip />
      </View>

      {provider.isLoading ? (
        <SkeletonBlock className="h-40" />
      ) : provider.isError || !p ? (
        <ErrorState error={provider.error} onRetry={() => void provider.refetch()} />
      ) : (
        <>
          {p.modes.length > 1 ? (
            <View className="gap-2">
              <BanglaText variant="label">কীভাবে দেখাবেন</BanglaText>
              <View className="flex-row flex-wrap gap-2">
                {p.modes.map((m) => {
                  const Icon = MODE_ICON[m];
                  const active = activeMode === m;
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => chooseMode(m)}
                      className={`min-h-[48px] flex-row items-center rounded-2xl border px-4 ${active ? 'border-primary bg-primary' : 'border-line bg-surface-card'}`}>
                      <Icon size={18} color={active ? colors.white : colors.primary} />
                      <BanglaText className={`ml-2 text-[15px] leading-[22px] ${active ? 'font-bangla-semibold text-white' : 'font-bangla-medium text-ink'}`}>
                        {MODE_LABEL[m]}
                      </BanglaText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View className="gap-2">
            <BanglaText variant="label">তারিখ</BanglaText>
            {availability.isLoading ? (
              <SkeletonBlock className="h-20" />
            ) : availability.isError ? (
              <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                {days.map((d) => {
                  const open = d.sessions.some((s) => s.bookable);
                  const active = d.date === activeDate;
                  return (
                    <Pressable
                      key={d.date}
                      disabled={!open}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: !open }}
                      accessibilityLabel={formatDate(d.date)}
                      onPress={() => {
                        setDate(d.date);
                        setScheduleId(null);
                        setSlotTime(null);
                      }}
                      className={`w-[64px] items-center rounded-2xl border py-2.5 ${active ? 'border-primary bg-primary' : open ? 'border-line bg-surface-card' : 'border-line/50 bg-surface opacity-50'}`}>
                      <BanglaText className={`text-[12px] leading-[17px] ${active ? 'text-white' : 'text-ink-muted'}`}>
                        {d.date === dhakaDate() ? 'আজ' : BANGLA_WEEKDAYS_SHORT[d.weekday]}
                      </BanglaText>
                      <BanglaText className={`font-bangla-bold text-[20px] leading-[28px] ${active ? 'text-white' : 'text-ink'}`}>
                        {toBanglaDigits(Number(d.date.slice(8)))}
                      </BanglaText>
                      <View className={`mt-0.5 h-1.5 w-1.5 rounded-full ${open ? (active ? 'bg-white' : 'bg-success') : 'bg-transparent'}`} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {day ? (
            <View className="gap-3">
              {day.isOff || day.sessions.length === 0 ? (
                <SurfaceCard>
                  <BanglaText>{day.offNote ? `এই দিন বন্ধ: ${day.offNote}` : 'এই দিন কোনো সেশন নেই।'}</BanglaText>
                </SurfaceCard>
              ) : (
                day.sessions.map((s) => {
                  const selected = session?.scheduleId === s.scheduleId;
                  if (s.mode === 'IN_PERSON') {
                    const left = (s.maxPatients ?? 0) - (s.bookedCount ?? 0);
                    return (
                      <Pressable
                        key={s.scheduleId}
                        disabled={!s.bookable}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: !s.bookable }}
                        onPress={() => setScheduleId(s.scheduleId)}
                        className={`rounded-3xl border-2 bg-surface-card p-4 ${selected ? 'border-primary' : 'border-transparent'} ${s.bookable ? '' : 'opacity-60'}`}>
                        <View className="flex-row items-start gap-3">
                          <Building2 size={22} color={colors.primary} />
                          <View className="flex-1 gap-0.5">
                            <BanglaText variant="body-strong">{s.chamber?.hospital.name}</BanglaText>
                            <BanglaText variant="caption">
                              {banglaClock(s.startTime)} – {banglaClock(s.endTime)}
                            </BanglaText>
                            {s.note ? <BanglaText variant="caption" className="text-warning">{s.note}</BanglaText> : null}
                          </View>
                          <BanglaText className="font-bangla-bold text-[16px] leading-[24px] text-primary">{taka(s.fee)}</BanglaText>
                        </View>
                        <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-surface px-3 py-2.5">
                          <BanglaText variant="label">
                            {s.bookable
                              ? `আপনার সিরিয়াল ${toBanglaDigits(s.nextSerial ?? 0)}`
                              : left <= 0
                                ? 'সব সিরিয়াল শেষ'
                                : 'বুকিং বন্ধ'}
                          </BanglaText>
                          <BanglaText variant="caption">
                            {s.bookable ? `আনুমানিক ${serialEstimate(s)} · ${toBanglaDigits(left)}টি বাকি` : ''}
                          </BanglaText>
                        </View>
                      </Pressable>
                    );
                  }
                  return (
                    <SurfaceCard key={s.scheduleId} className="gap-3">
                      <View className="flex-row items-center justify-between">
                        <BanglaText variant="body-strong">
                          {banglaClock(s.startTime)} – {banglaClock(s.endTime)}
                        </BanglaText>
                        <BanglaText className="font-bangla-bold text-[16px] leading-[24px] text-primary">{taka(s.fee)}</BanglaText>
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        {s.slots.map((slot) => {
                          const picked = selected && slotTime === slot.time;
                          return (
                            <Pressable
                              key={slot.time}
                              disabled={!slot.available}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: picked, disabled: !slot.available }}
                              onPress={() => {
                                setScheduleId(s.scheduleId);
                                setSlotTime(slot.time);
                              }}
                              className={`min-h-[44px] min-w-[96px] items-center justify-center rounded-xl border px-3 ${picked ? 'border-primary bg-primary' : slot.available ? 'border-line bg-surface-card' : 'border-line/40 bg-surface'}`}>
                              <BanglaText className={`text-[14px] leading-[22px] ${picked ? 'font-bangla-semibold text-white' : slot.available ? 'font-bangla-medium text-ink' : 'text-ink-subtle line-through'}`}>
                                {banglaClock(slot.time)}
                              </BanglaText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </SurfaceCard>
                  );
                })
              )}
            </View>
          ) : !availability.isLoading && days.length > 0 && !firstOpen ? (
            <EmptyState icon={CalendarX2} title="সামনের ২ সপ্তাহে খালি সময় নেই" message="অন্য ধরন বেছে দেখুন বা পরে আবার চেষ্টা করুন।" />
          ) : null}

          {activeMode === 'HOME_VISIT' ? (
            <LabeledTextInput
              label="বাসার ঠিকানা"
              icon={Home}
              value={homeAddress}
              onChangeText={setHomeAddress}
              placeholder="বাড়ি, রোড, এলাকা"
              multiline
              helperText="ডাক্তার এই ঠিকানায় আসবেন"
            />
          ) : null}
          <LabeledTextInput
            label="কেন দেখাতে চান (ঐচ্ছিক)"
            value={reason}
            onChangeText={setReason}
            maxLength={300}
            placeholder="যেমন: কয়েকদিন ধরে বুকে চাপ লাগছে"
            multiline
            helperText="শুধু ডাক্তার দেখবেন"
          />
          {parentAppointmentId ? (
            <BanglaText variant="caption">আগের ভিজিটের ফলো-আপ হিসেবে বুক হবে (চেম্বারে ফলো-আপ ফি প্রযোজ্য)।</BanglaText>
          ) : null}
          {error ? <FormErrorBanner message={error} /> : null}
        </>
      )}
    </ScrollScreen>
  );
}
