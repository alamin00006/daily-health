import { router } from 'expo-router';
import { ChevronRight, FileText } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { usePrescriptions } from '@/features/prescriptions/use-prescriptions';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

/** The prescription the doctor gave for this visit, once issued (nothing before that). */
export function VisitPrescriptionCard({ appointmentId, profileId }: { appointmentId: string; profileId: string }) {
  const list = usePrescriptions(profileId);
  const p = list.data?.pages
    .flatMap((page) => page.data)
    .find((x) => x.appointmentId === appointmentId && x.status === 'ISSUED');
  if (!p) return null;
  const pending = p.items.filter((i) => !i.alarm?.isActive).length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/prescriptions/[prescriptionId]', params: { prescriptionId: p.id, profileId } })
      }
      className="flex-row items-center gap-3 rounded-3xl border border-primary/20 bg-primary-50 p-4 active:opacity-80">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-card">
        <FileText size={22} color={colors.primary} />
      </View>
      <View className="flex-1">
        <BanglaText variant="body-strong">প্রেসক্রিপশন দেখুন</BanglaText>
        <BanglaText variant="caption">
          {p.code} · {toBanglaDigits(p.items.length)}টি ওষুধ
          {pending > 0 ? ` · ${toBanglaDigits(pending)}টির অ্যালার্ম বাকি` : ''}
        </BanglaText>
      </View>
      <ChevronRight size={20} color={colors.primary} />
    </Pressable>
  );
}
