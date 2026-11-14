import { router } from 'expo-router';
import { MessagesSquare, PhoneCall, Video } from 'lucide-react-native';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useMyConsultations } from '@/features/consultations/use-consultations';
import type { AppointmentResponse } from '@/shared-contracts/appointments.contract';
import { colors } from '@/theme/design-tokens';

/**
 * A confirmed VIDEO/CHAT booking: where the patient goes once the doctor
 * opens the consultation (a ringing call also opens the call screen by itself).
 */
export function BookedConsultCard({ appointment: a }: { appointment: AppointmentResponse }) {
  const active = useMyConsultations('active');
  const consult = active.data?.pages.flatMap((p) => p.data).find((c) => c.appointmentId === a.id);
  const video = a.mode === 'VIDEO';
  const Icon = video ? Video : MessagesSquare;

  return (
    <SurfaceCard className="gap-3 border border-primary/20">
      <View className="flex-row items-center gap-2">
        <Icon size={20} color={colors.primary} />
        <BanglaText variant="body-strong" className="flex-1">
          {consult ? 'ডাক্তার পরামর্শ শুরু করেছেন' : video ? 'ভিডিও কলে পরামর্শ' : 'চ্যাটে পরামর্শ'}
        </BanglaText>
      </View>
      <BanglaText variant="caption">
        {consult
          ? video
            ? consult.call?.active
              ? 'ডাক্তার কলে আছেন। এখনই যোগ দিন।'
              : 'চ্যাট খোলা আছে। ডাক্তার কল করলে ফোনে রিং হবে।'
            : 'চ্যাট খুলে ডাক্তারের সাথে কথা বলুন।'
          : video
            ? 'নির্ধারিত সময়ে ডাক্তার কল করবেন; অ্যাপ খোলা রাখলে সাথে সাথে রিং হবে। ইন্টারনেট চালু রাখুন।'
            : 'নির্ধারিত সময়ে ডাক্তার চ্যাট শুরু করবেন; নোটিফিকেশন পাবেন।'}
      </BanglaText>
      {consult ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <ActionButton
              label="চ্যাট খুলুন"
              size="sm"
              variant={video && consult.call?.active ? 'outline' : 'primary'}
              icon={MessagesSquare}
              onPress={() =>
                router.push({ pathname: '/consultations/[consultationId]', params: { consultationId: consult.id } })
              }
            />
          </View>
          {video && consult.call?.active ? (
            <View className="flex-1">
              <ActionButton
                label="কলে যোগ দিন"
                size="sm"
                icon={PhoneCall}
                onPress={() =>
                  router.push({ pathname: '/consultations/[consultationId]/call', params: { consultationId: consult.id } })
                }
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </SurfaceCard>
  );
}
