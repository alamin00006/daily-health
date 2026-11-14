import { router } from 'expo-router';
import {
  Ambulance,
  ChevronRight,
  PhoneCall,
  Siren,
  Stethoscope,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { SectionHeader } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { sosLocation } from '@/features/emergency/current-location';
import { EMERGENCY_STATUS_META, EMERGENCY_TYPE_META, localPhone } from '@/features/emergency/emergency-display';
import { useActiveEmergency, useEmergencyActions, useEmergencyContacts } from '@/features/emergency/use-emergency';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import {
  EMERGENCY_HELPLINES,
  type EmergencyRequestResponse,
  type EmergencyType,
} from '@/shared-contracts/emergency.contract';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme/design-tokens';

const TYPE_ICONS: Record<EmergencyType, LucideIcon> = {
  AMBULANCE: Ambulance,
  DOCTOR_CALL: Stethoscope,
  SOS: Siren,
};

const call = (number: string) => void Linking.openURL(`tel:${number}`);

function CallRow({ title, subtitle, number }: { title: string; subtitle: string; number: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}-কে ফোন করুন`}
      onPress={() => call(number)}
      className="flex-row items-center gap-3 border-b border-line/60 py-3 active:opacity-70">
      <View className="flex-1">
        <BanglaText variant="body-strong">{title}</BanglaText>
        <BanglaText variant="caption">{subtitle}</BanglaText>
      </View>
      <View className="h-11 w-11 items-center justify-center rounded-full bg-success-soft">
        <PhoneCall size={20} color={colors.success} />
      </View>
    </Pressable>
  );
}

function Helplines() {
  return (
    <SurfaceCard className="py-1">
      {EMERGENCY_HELPLINES.map((h) => (
        <CallRow key={h.number} title={toBanglaDigits(h.number)} subtitle={h.label} number={h.number} />
      ))}
    </SurfaceCard>
  );
}

function ActiveRequestCard({ profileId, request }: { profileId: string; request: EmergencyRequestResponse }) {
  const actions = useEmergencyActions(profileId);
  const status = EMERGENCY_STATUS_META[request.status];
  const cancel = async () => {
    const ok = await confirmAction({
      title: 'অনুরোধ বাতিল করবেন?',
      message: 'ভুল করে চাপ লাগলে বা আর সাহায্য না লাগলে বাতিল করুন। পরিবারকে জানানো হবে।',
      confirmLabel: 'বাতিল করুন',
      destructive: true,
    });
    if (!ok) return;
    actions.cancel.mutate(request.id, {
      onSuccess: () => showToast('অনুরোধ বাতিল হয়েছে'),
      onError: (e) => showToast(apiErrorMessage(e)),
    });
  };
  return (
    <View className="gap-3 rounded-3xl bg-danger p-5">
      <View className="flex-row items-center justify-between">
        <BanglaText className="font-bangla-bold text-[20px] leading-[30px] text-white">
          {EMERGENCY_TYPE_META[request.type].label}
        </BanglaText>
        <StatusPill label={status.label} tone={request.status === 'DISPATCHED' ? 'warning' : 'neutral'} />
      </View>
      <BanglaText className="text-white/90">
        নম্বর {request.code} · {formatDateTime(request.createdAt)}
      </BanglaText>
      {request.handlerNote ? (
        <View className="rounded-2xl bg-white/15 p-3">
          <BanglaText variant="body-strong" className="text-white">
            {request.handlerNote}
          </BanglaText>
        </View>
      ) : (
        <BanglaText className="text-white">
          আমাদের সহায়তা দল অনুরোধটি দেখছে। এর মধ্যে দরকার হলে নিচের নম্বরে নিজেও ফোন করুন।
        </BanglaText>
      )}
      <BanglaText variant="caption" className="text-white/90">
        পরিবারের {toBanglaDigits(request.membersAlerted)} জনকে জানানো হয়েছে
        {request.contactsNotified ? ` · ${toBanglaDigits(request.contactsNotified)} জন কন্টাক্টকে SMS গেছে` : ''}
      </BanglaText>
      {request.contactsFailed ? (
        <View className="rounded-2xl bg-white p-3">
          <BanglaText variant="label" className="text-danger">
            {toBanglaDigits(request.contactsFailed)} জন কন্টাক্টকে SMS পাঠানো যায়নি। নিচে থেকে নিজে ফোন করুন।
          </BanglaText>
        </View>
      ) : null}
      <ActionButton
        label="অনুরোধ বাতিল করুন"
        variant="outline"
        size="sm"
        loading={actions.cancel.isPending}
        onPress={() => void cancel()}
      />
    </View>
  );
}

function RaisePanel({ profileId, patientName }: { profileId: string; patientName: string }) {
  const actions = useEmergencyActions(profileId);
  const [busy, setBusy] = useState<EmergencyType | null>(null);
  const [address, setAddress] = useState('');

  const raise = async (type: EmergencyType) => {
    const ok = await confirmAction({
      title: `${patientName}-এর জন্য সাহায্য চাইবেন?`,
      message: 'পরিবারের সদস্য, জরুরি কন্টাক্ট আর আমাদের সহায়তা দলকে সাথে সাথে জানানো হবে। আপনার অবস্থানও পাঠানো হবে।',
      confirmLabel: 'হ্যাঁ, সাহায্য চাই',
      destructive: true,
    });
    if (!ok) return;
    setBusy(type);
    const { quick, later } = await sosLocation();
    actions.raise.mutate(
      {
        type,
        lat: quick?.lat ?? null,
        lng: quick?.lng ?? null,
        address: address.trim() || null,
      },
      {
        onSuccess: (r) => {
          showToast(r.alreadyOpen ? 'আগের অনুরোধটি এখনো চালু আছে' : 'সাহায্য চাওয়া হয়েছে। সবাইকে জানানো হয়েছে।');
          // GPS was slower than the SOS: send the position when it arrives.
          if (!quick && later && r.request.lat === null) {
            void later.then((pos) => {
              if (pos) actions.addLocation.mutate({ requestId: r.request.id, ...pos });
            });
          }
        },
        onError: (e) => showToast(apiErrorMessage(e)),
        onSettled: () => setBusy(null),
      }
    );
  };

  return (
    <View className="gap-3">
      {(Object.keys(EMERGENCY_TYPE_META) as EmergencyType[]).map((type) => {
        const Icon = TYPE_ICONS[type];
        const meta = EMERGENCY_TYPE_META[type];
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            disabled={busy !== null}
            onPress={() => void raise(type)}
            className={`min-h-[76px] flex-row items-center gap-4 rounded-3xl p-4 ${
              type === 'AMBULANCE' ? 'bg-danger active:opacity-90' : 'border-2 border-danger/30 bg-danger-soft active:opacity-80'
            }`}>
            <View
              className={`h-12 w-12 items-center justify-center rounded-2xl ${type === 'AMBULANCE' ? 'bg-white/20' : 'bg-white'}`}>
              {busy === type ? (
                <ActivityIndicator color={type === 'AMBULANCE' ? colors.white : colors.danger} />
              ) : (
                <Icon size={26} color={type === 'AMBULANCE' ? colors.white : colors.danger} />
              )}
            </View>
            <View className="flex-1">
              <BanglaText
                className={`font-bangla-bold text-[18px] leading-[28px] ${type === 'AMBULANCE' ? 'text-white' : 'text-danger'}`}>
                {meta.label}
              </BanglaText>
              <BanglaText variant="caption" className={type === 'AMBULANCE' ? 'text-white/90' : 'text-ink'}>
                {busy === type ? 'অবস্থান নেওয়া হচ্ছে…' : meta.hint}
              </BanglaText>
            </View>
          </Pressable>
        );
      })}
      <LabeledTextInput
        label="ঠিকানা বা চেনার মতো জায়গা (ইচ্ছা হলে)"
        placeholder="যেমন: বাড়ি ১২, রোড ৫, ধানমন্ডি; মসজিদের পাশে"
        value={address}
        onChangeText={setAddress}
        maxLength={300}
      />
    </View>
  );
}

/** আকস্মিক সেবা: SOS for the selected profile, helplines, and the family's emergency contacts. */
export default function EmergencyScreen() {
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? false);
  const { profile } = useActiveProfile();
  const profileId = isGuest ? undefined : profile?.id;
  const active = useActiveEmergency(profileId);
  const contacts = useEmergencyContacts(profileId);

  return (
    <ScrollScreen
      header={<ScreenHeader title="আকস্মিক সেবা" fallbackHref="/home" />}
      onRefresh={profileId ? () => Promise.all([active.refetch(), contacts.refetch()]) : undefined}>
      {!profile || isGuest ? (
        <InlineAlert
          tone="info"
          message="অ্যাকাউন্ট আর প্রোফাইল থাকলে এক চাপে পরিবার আর আমাদের সহায়তা দলকে জানাতে পারবেন। এখন নিচের নম্বরে সরাসরি ফোন করুন।"
        />
      ) : (
        <>
          <CurrentProfileChip />
          {active.isLoading ? (
            <SkeletonBlock className="h-56" />
          ) : active.isError ? (
            <ErrorState error={active.error} onRetry={() => void active.refetch()} />
          ) : active.data ? (
            <ActiveRequestCard profileId={profile.id} request={active.data} />
          ) : (
            <RaisePanel profileId={profile.id} patientName={profile.fullName} />
          )}
        </>
      )}

      <View className="gap-3">
        <SectionHeader title="এখনই ফোন করুন" />
        <Helplines />
      </View>

      {profile && !isGuest ? (
        <View className="gap-3">
          <SectionHeader
            title="জরুরি কন্টাক্ট"
            actionLabel={canEdit(profile) ? 'বদলান' : undefined}
            onAction={canEdit(profile) ? () => router.push('/emergency/contacts') : undefined}
          />
          {contacts.isLoading ? (
            <SkeletonBlock className="h-24" />
          ) : (contacts.data ?? []).length === 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={!canEdit(profile)}
              onPress={() => router.push('/emergency/contacts')}
              className="flex-row items-center gap-3 rounded-3xl border border-dashed border-line-strong bg-surface-card/60 p-4 active:bg-primary-50">
              <UserRoundPlus size={22} color={colors.primary} />
              <BanglaText variant="label" className="flex-1 font-bangla text-ink-muted">
                প্রতিবেশী বা কাছের আত্মীয়কে জরুরি কন্টাক্ট হিসেবে রাখুন। বিপদে তাঁরা SMS পাবেন।
              </BanglaText>
              <ChevronRight size={20} color={colors.inkMuted} />
            </Pressable>
          ) : (
            <SurfaceCard className="py-1">
              {contacts.data!.map((c) => (
                <CallRow
                  key={c.id}
                  title={c.name}
                  subtitle={`${c.relation ? `${c.relation} · ` : ''}${toBanglaDigits(localPhone(c.phone))}`}
                  number={c.phone}
                />
              ))}
            </SurfaceCard>
          )}
        </View>
      ) : null}
    </ScrollScreen>
  );
}
