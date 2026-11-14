import { router } from 'expo-router';
import { Baby, CalendarHeart, CircleStop, MessageCircleHeart } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { DateField } from '@/components/ui/date-time-field';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { IconBadge } from '@/components/ui/icon-badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useCycleOverview, useWomensHealthActions } from '@/features/womens-health/use-womens-health';
import { TRIMESTER_LABELS, babySizeHint } from '@/features/womens-health/womens-health-display';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { addDays, dhakaDate, formatDate } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { PregnancyResponse } from '@/shared-contracts/womens-health.contract';

/** What to keep in mind in each trimester (general guidance, not medical advice). */
const TRIMESTER_TIPS: Record<1 | 2 | 3, string[]> = {
  1: [
    'প্রতিদিন ফলিক অ্যাসিড খান (ডাক্তারের পরামর্শে)।',
    'প্রথম চেকআপে রক্ত, প্রস্রাব আর আল্ট্রাসনোগ্রাম করিয়ে নিন।',
    'বমি ভাব হলে অল্প অল্প করে বারবার খান।',
  ],
  2: [
    'আয়রন আর ক্যালসিয়াম নিয়মিত খান।',
    '১৮–২২ সপ্তাহে অ্যানোমালি স্ক্যান করানো হয়।',
    'টিটি টিকা নেওয়া হয়েছে কিনা দেখে নিন।',
  ],
  3: [
    'শিশুর নড়াচড়া প্রতিদিন খেয়াল করুন; কমে গেলে দেরি না করে ডাক্তার দেখান।',
    'প্রসবের জন্য হাসপাতাল আর যাতায়াত আগে থেকে ঠিক করে রাখুন।',
    'রক্তপাত, পানি ভাঙা, মাথাব্যথা বা চোখে ঝাপসা দেখলে সাথে সাথে হাসপাতালে যান।',
  ],
};

function ActivePregnancy({ profileId, p }: { profileId: string; p: PregnancyResponse }) {
  const actions = useWomensHealthActions(profileId);
  const size = babySizeHint(p.week);
  const end = async () => {
    const ok = await confirmAction({
      title: 'গর্ভধারণ ট্র্যাকিং বন্ধ করবেন?',
      message: 'বন্ধ করলে আবার পিরিয়ডের হিসাব দেখানো হবে। তথ্য মুছে যাবে না।',
      confirmLabel: 'বন্ধ করুন',
      destructive: true,
    });
    if (!ok) return;
    actions.endPregnancy.mutate(undefined, {
      onSuccess: () => {
        showToast('ট্র্যাকিং বন্ধ হয়েছে');
        router.back();
      },
      onError: (e) => showToast(apiErrorMessage(e)),
    });
  };
  return (
    <View className="gap-4">
      <SurfaceCard className="items-center gap-2">
        <IconBadge icon={Baby} tone="rose" size="lg" />
        <BanglaText className="font-bangla-bold text-[30px] leading-[42px] text-rose">
          {toBanglaDigits(p.week)} সপ্তাহ {toBanglaDigits(p.dayOfWeek)} দিন
        </BanglaText>
        <BanglaText variant="label">{TRIMESTER_LABELS[p.trimester]}</BanglaText>
        {size ? <BanglaText variant="caption">শিশু এখন প্রায় {size}</BanglaText> : null}
        <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-rose-soft">
          <View
            className="h-2.5 rounded-full bg-rose"
            style={{ width: `${Math.min(100, ((280 - p.daysLeft) / 280) * 100)}%` }}
          />
        </View>
        <View className="w-full flex-row justify-between">
          <BanglaText variant="caption">শেষ পিরিয়ড {formatDate(p.lmpDate, false)}</BanglaText>
          <BanglaText variant="caption">সম্ভাব্য তারিখ {formatDate(p.dueDate, false)}</BanglaText>
        </View>
        <BanglaText variant="body-strong">আর {toBanglaDigits(p.daysLeft)} দিন</BanglaText>
      </SurfaceCard>

      <SurfaceCard className="gap-2">
        <BanglaText variant="body-strong">এই সময়ে খেয়াল রাখুন</BanglaText>
        {TRIMESTER_TIPS[p.trimester].map((tip) => (
          <BanglaText key={tip} variant="label" className="font-bangla">
            • {tip}
          </BanglaText>
        ))}
      </SurfaceCard>

      <ActionButton
        label="নারী ডাক্তারের সাথে চ্যাট"
        icon={MessageCircleHeart}
        variant="secondary"
        onPress={() => router.push({ pathname: '/quick-consult', params: { kind: 'WOMENS_HEALTH' } })}
      />
      <ActionButton
        label="ট্র্যাকিং বন্ধ করুন"
        icon={CircleStop}
        variant="ghost"
        loading={actions.endPregnancy.isPending}
        onPress={() => void end()}
      />
    </View>
  );
}

function StartPregnancy({ profileId, lastPeriodStart }: { profileId: string; lastPeriodStart: string | null }) {
  const actions = useWomensHealthActions(profileId);
  const today = dhakaDate();
  const [lmp, setLmp] = useState<string | null>(
    lastPeriodStart && lastPeriodStart >= addDays(today, -294) ? lastPeriodStart : null
  );
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    if (!lmp) return setError('শেষ পিরিয়ড কবে শুরু হয়েছিল বেছে নিন।');
    setError(null);
    actions.startPregnancy.mutate(
      { lmpDate: lmp },
      { onSuccess: () => showToast('শুভকামনা! সপ্তাহ গোনা শুরু হলো'), onError: (e) => setError(apiErrorMessage(e)) }
    );
  };
  return (
    <SurfaceCard className="gap-4">
      <View className="flex-row items-center gap-3">
        <IconBadge icon={CalendarHeart} tone="rose" />
        <BanglaText className="flex-1">
          গর্ভবতী হলে শেষ পিরিয়ডের প্রথম দিনটি দিন। সেখান থেকে সপ্তাহ আর সম্ভাব্য প্রসবের তারিখ হিসাব হবে।
        </BanglaText>
      </View>
      {error ? <InlineAlert tone="danger" message={error} /> : null}
      <DateField
        label="শেষ পিরিয়ডের প্রথম দিন"
        value={lmp}
        onChange={setLmp}
        minimumDate={new Date(`${addDays(today, -294)}T12:00:00`)}
        maximumDate={new Date(`${today}T12:00:00`)}
      />
      <ActionButton label="ট্র্যাকিং শুরু করুন" loading={actions.startPregnancy.isPending} onPress={start} />
    </SurfaceCard>
  );
}

export default function PregnancyScreen() {
  const { profile } = useActiveProfile();
  const overview = useCycleOverview(profile?.id);
  const o = overview.data;
  if (!profile || !o) return null;
  return (
    <ScrollScreen
      header={<ScreenHeader title="গর্ভধারণ" fallbackHref="/womens-health" />}
      onRefresh={() => overview.refetch()}>
      {o.pregnancy ? (
        <ActivePregnancy profileId={profile.id} p={o.pregnancy} />
      ) : (
        <StartPregnancy profileId={profile.id} lastPeriodStart={o.lastPeriod?.startDate ?? null} />
      )}
      <BanglaText variant="caption" className="px-1">
        এগুলো সাধারণ তথ্য। নিয়মিত চেকআপ আর ডাক্তারের পরামর্শ মেনে চলুন।
      </BanglaText>
    </ScrollScreen>
  );
}
