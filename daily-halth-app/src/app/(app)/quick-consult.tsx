import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircleHeart, MessagesSquare, ShieldCheck, Stethoscope } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { isApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/api-error-messages';
import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { QUICK_KIND_HINT, QUICK_KIND_LABEL } from '@/features/consultations/consultation-display';
import { useQuickConsultOptions, useStartQuickConsult } from '@/features/consultations/use-consultations';
import { taka } from '@/features/doctors/doctor-display';
import { usePayForItem } from '@/features/payments/use-payments';
import { canEdit, canViewWomensHealth } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { showToast } from '@/lib/user-feedback';
import type { QuickConsultKind, QuickConsultOptionResponse } from '@/shared-contracts/consultation.contract';
import { colors } from '@/theme/design-tokens';

const MIN_CONCERN = 5;

function KindCard({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: QuickConsultOptionResponse;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const women = option.kind === 'WOMENS_HEALTH';
  const Icon = women ? MessageCircleHeart : Stethoscope;
  const accent = women ? '#c2475e' : colors.primary;
  const unavailable = !option.isEnabled ? 'এখন বন্ধ' : option.doctorsOnline === 0 ? 'এখন কেউ অনলাইনে নেই' : null;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`gap-2 rounded-3xl border-2 bg-surface-card p-4 ${selected ? '' : 'border-line'} ${disabled ? 'opacity-50' : ''}`}
      style={selected ? { borderColor: accent } : undefined}>
      <View className="flex-row items-center gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: women ? '#fbe4e8' : colors.primary100 }}>
          <Icon size={22} color={accent} />
        </View>
        <View className="flex-1">
          <BanglaText variant="body-strong">{QUICK_KIND_LABEL[option.kind]}</BanglaText>
          <BanglaText variant="caption">{QUICK_KIND_HINT[option.kind]}</BanglaText>
        </View>
        <BanglaText className="font-bangla-bold text-[22px] leading-[32px]" style={{ color: accent }}>
          {taka(option.price)}
        </BanglaText>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {unavailable ? (
          <StatusPill label={unavailable} tone="neutral" />
        ) : (
          <StatusPill label={`${toBanglaDigits(option.doctorsOnline)} জন ডাক্তার অনলাইনে`} tone="success" />
        )}
        <BanglaText variant="caption">শুধু চ্যাট · {toBanglaDigits(option.sessionMin)} মিনিট</BanglaText>
      </View>
    </Pressable>
  );
}

/**
 * Pay-and-wait chat with an online doctor (price set by admins). The question
 * is written first; after paying, the first free doctor takes it.
 */
export default function QuickConsultScreen() {
  const { profile } = useActiveProfile();
  const options = useQuickConsultOptions();
  const start = useStartQuickConsult(profile?.id ?? '');
  const pay = usePayForItem(profile?.id ?? '');
  // The women's health section opens this with ?kind=WOMENS_HEALTH.
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<QuickConsultKind>(
    params.kind === 'WOMENS_HEALTH' ? 'WOMENS_HEALTH' : 'GENERAL'
  );
  const [concern, setConcern] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Women's health: the patient themself (or the owner of a profile without an account).
  const womenAllowed = profile?.gender === 'FEMALE' && canViewWomensHealth(profile);
  const selected = options.data?.find((o) => o.kind === kind);
  const usable = (o: QuickConsultOptionResponse) =>
    o.isEnabled && o.doctorsOnline > 0 && (o.kind !== 'WOMENS_HEALTH' || womenAllowed);
  const valid = Boolean(selected && usable(selected) && concern.trim().length >= MIN_CONCERN && canEdit(profile));
  const busy = start.isPending || pay.isPending;

  async function submit() {
    if (!profile || !selected) return;
    setError(null);
    let consultationId: string;
    try {
      consultationId = (await start.mutateAsync({ kind, concern: concern.trim() })).id;
    } catch (e) {
      const existing =
        isApiError(e) && e.code === 'QUICK_CONSULT_ALREADY_ACTIVE'
          ? (e.details as { consultationId?: string } | null)?.consultationId
          : null;
      if (existing) {
        showToast('আগের পরামর্শটি খোলা হলো');
        router.replace({ pathname: '/consultations/[consultationId]', params: { consultationId: existing } });
        return;
      }
      setError(apiErrorMessage(e));
      void options.refetch();
      return;
    }
    // Pay now; if the page is closed or fails, the consultation screen offers to pay again.
    const outcome = await pay.mutateAsync({ purpose: 'QUICK_CONSULT', referenceId: consultationId }).catch(() => null);
    if (outcome?.kind === 'paid') showToast('পেমেন্ট হয়েছে। ডাক্তার খোঁজা হচ্ছে…');
    router.replace({ pathname: '/consultations/[consultationId]', params: { consultationId } });
  }

  return (
    <ScrollScreen
      header={<ScreenHeader title="দ্রুত পরামর্শ" subtitle="চ্যাটে অনলাইন ডাক্তার" fallbackHref="/doctors" />}
      onRefresh={() => options.refetch()}
      footer={
        <ActionButton
          label={selected ? `${taka(selected.price)} দিয়ে শুরু করুন` : 'শুরু করুন'}
          icon={MessagesSquare}
          disabled={!valid}
          loading={busy}
          onPress={() => void submit()}
        />
      }>
      <CurrentProfileChip />
      {!canEdit(profile) ? (
        <InlineAlert tone="info" message="এই প্রোফাইলে আপনি শুধু দেখতে পারেন, পরামর্শ নিতে পারবেন না।" />
      ) : null}

      {options.isLoading ? (
        <>
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </>
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : (
        <View className="gap-3" accessibilityRole="radiogroup">
          {(options.data ?? [])
            .filter((o) => o.kind !== 'WOMENS_HEALTH' || womenAllowed)
            .map((o) => (
              <KindCard
                key={o.kind}
                option={o}
                selected={kind === o.kind}
                disabled={!usable(o)}
                onPress={() => setKind(o.kind)}
              />
            ))}
        </View>
      )}

      <LabeledTextInput
        label="আপনার সমস্যা লিখুন"
        placeholder="যেমন: দুই দিন ধরে জ্বর, সাথে মাথাব্যথা"
        value={concern}
        onChangeText={setConcern}
        multiline
        maxLength={1000}
        numberOfLines={4}
        textAlignVertical="top"
        style={{ minHeight: 96 }}
        helperText="ডাক্তার নেওয়ার পরই শুধু তিনি এটা দেখবেন।"
      />

      {selected ? (
        <View className="flex-row items-start gap-2 rounded-2xl bg-primary-50 p-3">
          <ShieldCheck size={18} color={colors.primary} style={{ marginTop: 3 }} />
          <BanglaText variant="caption" className="flex-1 text-ink">
            {toBanglaDigits(selected.maxWaitMin)} মিনিটের মধ্যে কোনো ডাক্তার না পেলে পুরো টাকা ফেরত পাবেন। ডাক্তার যোগ দিলে{' '}
            {toBanglaDigits(selected.sessionMin)} মিনিট চ্যাট করা যাবে। জরুরি অবস্থায় হাসপাতালে যান।
          </BanglaText>
        </View>
      ) : null}
      <FormErrorBanner message={error} />
    </ScrollScreen>
  );
}
