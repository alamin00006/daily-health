import { router } from 'expo-router';
import {
  BellRing,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand/brand-logo';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { IconBadge } from '@/components/ui/icon-badge';
import { SurfaceCard } from '@/components/ui/surface-card';
import { authErrorMessage } from '@/features/auth/auth-error-messages';
import { useGuestLoginMutation } from '@/features/auth/use-auth-mutations';
import { colors } from '@/theme/design-tokens';

const HIGHLIGHTS: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: UsersRound,
    title: 'পুরো পরিবার এক জায়গায়',
    detail: 'বাবা-মা, সন্তান সবার স্বাস্থ্য তথ্য একসাথে দেখুন',
  },
  {
    icon: BellRing,
    title: 'ওষুধের সময়মতো রিমাইন্ডার',
    detail: 'ইন্টারনেট না থাকলেও অ্যালার্ম বাজবে',
  },
  {
    icon: Stethoscope,
    title: 'ঘরে বসে ডাক্তারের পরামর্শ',
    detail: 'ভিডিও কল বা চ্যাটে বিশেষজ্ঞের সাথে কথা বলুন',
  },
];

export default function WelcomeScreen() {
  const guestLogin = useGuestLoginMutation();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      {/* Soft brand shapes behind the hero. */}
      <View
        pointerEvents="none"
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-100/70"
      />
      <View
        pointerEvents="none"
        className="absolute -left-16 top-40 h-40 w-40 rounded-full bg-primary-50"
      />

      <View className="flex-1 justify-between px-6 pb-4 pt-10">
        <View className="gap-8">
          <View className="gap-4">
            <BrandLogo size={68} />
            <View className="gap-1">
              <BanglaText variant="display">দৈনিক স্বাস্থ্য</BanglaText>
              <BanglaText className="text-[17px] leading-[28px] text-ink-muted">
                আপনার প্রতিদিনের ডিজিটাল স্বাস্থ্যসেবা
              </BanglaText>
            </View>
          </View>

          <SurfaceCard className="gap-5">
            {HIGHLIGHTS.map((item) => (
              <View key={item.title} className="flex-row items-center gap-4">
                <IconBadge icon={item.icon} />
                <View className="flex-1">
                  <BanglaText variant="body-strong">{item.title}</BanglaText>
                  <BanglaText variant="caption">{item.detail}</BanglaText>
                </View>
              </View>
            ))}
          </SurfaceCard>
        </View>

        <View className="gap-3 pt-8">
          <FormErrorBanner message={guestLogin.error ? authErrorMessage(guestLogin.error) : null} />
          <ActionButton
            label="নতুন অ্যাকাউন্ট খুলুন"
            onPress={() =>
              router.push({ pathname: '/request-code', params: { purpose: 'SIGNUP' } })
            }
          />
          <ActionButton
            label="আমার অ্যাকাউন্ট আছে, লগইন করুন"
            variant="outline"
            onPress={() => router.push('/login')}
          />
          <ActionButton
            label="অতিথি হিসেবে ঘুরে দেখুন"
            variant="ghost"
            size="sm"
            loading={guestLogin.isPending}
            onPress={() => guestLogin.mutate()}
          />
          <View className="flex-row items-center justify-center gap-1.5 pt-1">
            <ShieldCheck size={14} color={colors.inkSubtle} strokeWidth={2} />
            <BanglaText variant="caption" className="text-ink-subtle">
              আপনার স্বাস্থ্য তথ্য এনক্রিপ্ট করে সুরক্ষিত রাখা হয়
            </BanglaText>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
