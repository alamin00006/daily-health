import { Clock3 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { StatusPill } from '@/components/ui/status-pill';
import {
  MODE_ICON,
  MODE_LABEL,
  providerTitle,
  STATUS_LABEL,
  STATUS_TONE,
} from '@/features/doctors/doctor-display';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, dhakaTime, formatDate, relativeDay } from '@/lib/bangla-format';
import type { AppointmentResponse } from '@/shared-contracts/appointments.contract';
import { colors, shadows } from '@/theme/design-tokens';

/** When: "আজ, সন্ধ্যা ৬:৩০" (estimated for a chamber serial). */
export function appointmentWhen(appointment: AppointmentResponse): string {
  const at = new Date(appointment.estimatedAt ?? appointment.scheduledAt);
  const day = relativeDay(appointment.date) || formatDate(appointment.date, false);
  return `${day}, ${appointment.estimatedAt ? 'আনুমানিক ' : ''}${banglaClock(dhakaTime(at))}`;
}

export function AppointmentCard({
  appointment,
  onPress,
}: {
  appointment: AppointmentResponse;
  onPress: () => void;
}) {
  const Icon = MODE_ICON[appointment.mode];
  const { provider } = appointment;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={shadows.card}
      className="gap-3 rounded-3xl bg-surface-card p-4 active:opacity-90">
      <View className="flex-row items-center gap-3">
        <ProfileAvatar name={provider.displayName} photoUrl={provider.avatarThumbnailUrl} />
        <View className="flex-1">
          <BanglaText variant="body-strong" numberOfLines={1}>
            {providerTitle(provider.type, provider.displayName)}
          </BanglaText>
          <BanglaText variant="caption" numberOfLines={1}>
            {provider.specialties[0]?.nameBn ?? ''}
            {appointment.kind === 'FOLLOW_UP' ? ' · ফলো-আপ' : ''}
          </BanglaText>
        </View>
        <StatusPill label={STATUS_LABEL[appointment.status]} tone={STATUS_TONE[appointment.status]} />
      </View>
      <View className="flex-row items-center gap-4 rounded-2xl bg-surface px-3 py-2.5">
        <View className="flex-row items-center">
          <Clock3 size={16} color={colors.primary} />
          <BanglaText variant="label" className="ml-1.5">
            {appointmentWhen(appointment)}
          </BanglaText>
        </View>
        <View className="flex-1 flex-row items-center justify-end">
          <Icon size={16} color={colors.primary} />
          <BanglaText variant="caption" className="ml-1" numberOfLines={1}>
            {appointment.chamber ? appointment.chamber.hospital.name : MODE_LABEL[appointment.mode]}
          </BanglaText>
        </View>
      </View>
      {appointment.serialNo ? (
        <BanglaText variant="caption">
          সিরিয়াল {toBanglaDigits(appointment.serialNo)} · কোড {appointment.code}
        </BanglaText>
      ) : (
        <BanglaText variant="caption">কোড {appointment.code}</BanglaText>
      )}
    </Pressable>
  );
}
