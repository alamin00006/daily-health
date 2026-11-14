import { router } from 'expo-router';
import { ChevronRight, Stethoscope } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { providerTitle } from '@/features/doctors/doctor-display';
import { VERIFICATION_LABEL } from '@/features/provider/provider-display';
import { useMyProvider, useQuickQueue } from '@/features/provider/use-provider';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

/** On home, for accounts that are also providers: the way into their work. */
export function ProviderHomeCard() {
  const me = useMyProvider();
  const p = me.data;
  const live = Boolean(p && p.verificationStatus === 'VERIFIED' && p.isOnline && p.acceptsQuickConsult);
  const queue = useQuickQueue(live);
  if (!p) return null;
  const waiting = queue.data?.length ?? 0;
  const status =
    p.verificationStatus !== 'VERIFIED'
      ? VERIFICATION_LABEL[p.verificationStatus]
      : p.isOnline
        ? waiting > 0
          ? `অনলাইনে · ${toBanglaDigits(waiting)} জন দ্রুত পরামর্শের অপেক্ষায়`
          : 'অনলাইনে আছেন'
        : 'অফলাইন';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/provider')}
      className="flex-row items-center gap-3 rounded-3xl bg-ink p-4 active:opacity-90">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
        <Stethoscope size={22} color={colors.white} />
      </View>
      <View className="flex-1">
        <BanglaText className="font-bangla-semibold text-[16px] leading-[24px] text-white" numberOfLines={1}>
          {providerTitle(p.type, p.displayName)} · সেবাদাতা
        </BanglaText>
        <BanglaText className="text-[13px] leading-[20px] text-white/80">{status}</BanglaText>
      </View>
      {waiting > 0 ? (
        <View className="min-w-7 items-center rounded-full bg-warning px-2 py-0.5">
          <BanglaText className="font-bangla-bold text-[13px] text-white">{toBanglaDigits(waiting)}</BanglaText>
        </View>
      ) : null}
      <ChevronRight size={22} color={colors.white} />
    </Pressable>
  );
}
