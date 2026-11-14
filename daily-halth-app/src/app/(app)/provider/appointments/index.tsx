import { router } from 'expo-router';
import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { MODE_LABEL, STATUS_LABEL, STATUS_TONE } from '@/features/doctors/doctor-display';
import { useProviderDay } from '@/features/provider/use-provider';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { addDays, banglaClock, dhakaDate, dhakaTime, relativeDay } from '@/lib/bangla-format';
import type { ProviderAppointmentResponse } from '@/shared-contracts/appointments.contract';
import { colors } from '@/theme/design-tokens';

function Row({ a }: { a: ProviderAppointmentResponse }) {
  const at = a.estimatedAt ?? a.scheduledAt;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/provider/appointments/[appointmentId]', params: { appointmentId: a.id } })}
      className="flex-row items-center gap-3 rounded-3xl border border-line bg-surface-card p-4 active:bg-primary-50">
      <View className="min-w-14 items-center rounded-xl bg-primary-50 px-2 py-2">
        {a.serialNo ? (
          <BanglaText className="font-bangla-bold text-[18px] text-primary">#{toBanglaDigits(a.serialNo)}</BanglaText>
        ) : null}
        <BanglaText className="text-[12px] text-primary">{banglaClock(dhakaTime(new Date(at)))}</BanglaText>
      </View>
      <View className="flex-1">
        <BanglaText variant="body-strong" numberOfLines={1}>
          {a.patient.fullName}
        </BanglaText>
        <BanglaText variant="caption" numberOfLines={1}>
          {MODE_LABEL[a.mode]}
          {a.chamber ? ` · ${a.chamber.hospital.name}` : ''} · {a.code}
        </BanglaText>
      </View>
      <StatusPill label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
    </Pressable>
  );
}

/** One day's visits, by serial / time. */
export default function ProviderAppointmentsScreen() {
  const [date, setDate] = useState(dhakaDate());
  const day = useProviderDay(date);
  const label = relativeDay(date);

  return (
    <ScrollScreen header={<ScreenHeader title="অ্যাপয়েন্টমেন্ট" fallbackHref="/provider" />} onRefresh={() => day.refetch()}>
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel="আগের দিন" onPress={() => setDate(addDays(date, -1))} className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-card">
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <BanglaText variant="heading" className="flex-1 text-center">
          {label}
        </BanglaText>
        <Pressable accessibilityRole="button" accessibilityLabel="পরের দিন" onPress={() => setDate(addDays(date, 1))} className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-card">
          <ChevronRight size={22} color={colors.ink} />
        </Pressable>
      </View>
      {day.isLoading ? (
        <LoadingList rows={4} />
      ) : day.isError ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : !day.data?.length ? (
        <EmptyState icon={CalendarX2} title="এই দিনে কেউ বুক করেননি" message="সময়সূচি আর ছুটির দিন ওয়েব প্যানেল থেকে সাজান।" />
      ) : (
        <View className="gap-3">
          {day.data.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}
