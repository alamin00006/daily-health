import { router } from 'expo-router';
import { ChevronRight, Zap } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { useQuickConsultOptions } from '@/features/consultations/use-consultations';
import { taka } from '@/features/doctors/doctor-display';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

/** "এখনই ডাক্তারের সাথে চ্যাট": the quick consult entry, with the admin-set price. */
export function QuickConsultBanner() {
  const options = useQuickConsultOptions();
  const general = options.data?.find((o) => o.kind === 'GENERAL');
  if (!general?.isEnabled) return null;
  const online = general.doctorsOnline;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`দ্রুত পরামর্শ, ${taka(general.price)}`}
      onPress={() => router.push('/quick-consult')}
      className="flex-row items-center gap-3 rounded-3xl bg-primary p-4 active:opacity-90">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
        <Zap size={22} color={colors.white} />
      </View>
      <View className="flex-1">
        <BanglaText className="font-bangla-semibold text-[16px] leading-[24px] text-white">
          এখনই চ্যাটে ডাক্তার · {taka(general.price)}
        </BanglaText>
        <BanglaText className="text-[13px] leading-[20px] text-white/80">
          {online > 0 ? `${toBanglaDigits(online)} জন ডাক্তার অনলাইনে আছেন` : 'এখন কেউ অনলাইনে নেই'}
        </BanglaText>
      </View>
      <ChevronRight size={22} color={colors.white} />
    </Pressable>
  );
}
