import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { FileText, ImagePlus, Lock, PhoneCall, SendHorizontal, Timer, Video } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import {
  CONSULT_STATUS_LABEL,
  CONSULT_STATUS_TONE,
  consultTitle,
} from '@/features/consultations/consultation-display';
import {
  useCancelConsultation,
  useConsultation,
  useEndConsultation,
  useMarkRead,
  useMessages,
  useSendImage,
  useSendMessage,
} from '@/features/consultations/use-consultations';
import { taka } from '@/features/doctors/doctor-display';
import { usePayForItem } from '@/features/payments/use-payments';
import { useMyProvider, usePrescriptionWriting } from '@/features/provider/use-provider';
import { useRealtimeEvent, useRealtimeStore } from '@/features/realtime/realtime-connection';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, dhakaTime } from '@/lib/bangla-format';
import { pickPhoto } from '@/lib/pick-upload-file';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { MessageResponse } from '@/shared-contracts/chat.contract';
import type { ConsultationResponse } from '@/shared-contracts/consultation.contract';
import { REALTIME_EVENTS, type ChatTypingEvent } from '@/shared-contracts/realtime.contract';
import { colors } from '@/theme/design-tokens';

const TYPING_SHOWN_MS = 4_000;
const TYPING_SEND_EVERY_MS = 2_500;

/** "১২:০৫" until `iso`, ticking every second (null when there is no deadline). */
function useCountdown(iso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  const left = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  return toBanglaDigits(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
}

function Bubble({ message: m, mine, patientId, asProvider }: { message: MessageResponse; mine: boolean; patientId: string; asProvider: boolean }) {
  const time = banglaClock(dhakaTime(new Date(m.createdAt)));
  if (m.type === 'PRESCRIPTION' && m.refId) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          asProvider
            ? router.push({ pathname: '/provider/prescriptions/[prescriptionId]', params: { prescriptionId: m.refId! } })
            : router.push({
                pathname: '/prescriptions/[prescriptionId]',
                params: { prescriptionId: m.refId!, profileId: patientId },
              })
        }
        className="my-1 max-w-[86%] flex-row items-center gap-3 self-start rounded-3xl border border-primary/30 bg-primary-50 px-4 py-3 active:opacity-80">
        <FileText size={22} color={colors.primary} />
        <View className="flex-1">
          <BanglaText variant="body-strong" className="text-primary">
            {m.body}
          </BanglaText>
          <BanglaText variant="caption">
            {asProvider ? 'খুলে দেখুন' : 'খুলে এক চাপে ওষুধের অ্যালার্ম চালু করুন'} · {time}
          </BanglaText>
        </View>
      </Pressable>
    );
  }
  if (m.senderRole === 'SYSTEM') {
    return (
      <View className="my-1 self-center rounded-full bg-primary-50 px-3 py-1">
        <BanglaText variant="caption" className="text-center">
          {m.body} · {time}
        </BanglaText>
      </View>
    );
  }
  return (
    <View className={`my-1 max-w-[82%] gap-1 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
      <View
        className={`rounded-3xl px-4 py-2.5 ${mine ? 'rounded-br-md bg-primary' : 'rounded-bl-md bg-surface-card border border-line'}`}>
        {m.attachment ? (
          <Image
            source={{ uri: m.attachment.previewUrl ?? m.attachment.url }}
            style={{ width: 220, height: 220, borderRadius: 16 }}
            contentFit="cover"
            accessibilityLabel={m.body ?? 'ছবি'}
          />
        ) : null}
        {m.body ? (
          <BanglaText className={mine ? 'text-white' : 'text-ink'} selectable>
            {m.body}
          </BanglaText>
        ) : null}
      </View>
      <BanglaText variant="caption" className="px-1 text-[11px] leading-[16px]">
        {time}
      </BanglaText>
    </View>
  );
}

/** The doctor's controls: open the call, write the prescription, end. */
function ProviderPanel({ c }: { c: ConsultationResponse }) {
  const end = useEndConsultation();
  const rx = usePrescriptionWriting();
  const fail = (e: unknown) => showToast(apiErrorMessage(e));
  if (c.status !== 'ONGOING' && c.status !== 'ENDED') return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {c.status === 'ONGOING' && c.call ? (
        <ActionButton
          label={c.call.active ? 'কলে ফিরুন' : 'কল করুন'}
          size="sm"
          icon={PhoneCall}
          onPress={() =>
            router.push({ pathname: '/consultations/[consultationId]/call', params: { consultationId: c.id, as: 'provider' } })
          }
        />
      ) : null}
      <ActionButton
        label="প্রেসক্রিপশন"
        size="sm"
        variant="secondary"
        icon={FileText}
        loading={rx.start.isPending}
        onPress={() =>
          rx.start.mutate(c.appointmentId ? { appointmentId: c.appointmentId } : { consultationId: c.id }, {
            onSuccess: (p) => router.push({ pathname: '/provider/prescriptions/[prescriptionId]', params: { prescriptionId: p.id } }),
            onError: fail,
          })
        }
      />
      {c.status === 'ONGOING' ? (
        <ActionButton
          label="শেষ করুন"
          size="sm"
          variant="outline"
          loading={end.isPending}
          onPress={() =>
            void confirmAction({
              title: 'পরামর্শ শেষ করবেন?',
              message: 'কল বন্ধ হবে আর চ্যাট শুধু পড়া যাবে। রোগী জানবেন।',
              confirmLabel: 'শেষ করুন',
            }).then((ok) => ok && end.mutate(c.id, { onError: fail }))
          }
        />
      ) : null}
    </View>
  );
}

/** What sits above the chat: payment, waiting, the call, or how it ended. */
function StatusPanel({ c }: { c: ConsultationResponse }) {
  const pay = usePayForItem(c.patient.id);
  const cancel = useCancelConsultation();
  const end = useEndConsultation();
  const waitLeft = useCountdown(c.status === 'WAITING' ? c.waitingUntil : null);
  const fail = (e: unknown) => showToast(apiErrorMessage(e));

  const cancelButton = (
    <ActionButton
      label="বাতিল করুন"
      size="sm"
      variant="outline"
      loading={cancel.isPending}
      onPress={() =>
        void confirmAction({
          title: 'পরামর্শ বাতিল করবেন?',
          message: c.status === 'WAITING' ? 'পুরো টাকা ফেরত দেওয়া হবে।' : 'এখনো টাকা কাটা হয়নি।',
          confirmLabel: 'বাতিল করুন',
          destructive: true,
        }).then((ok) => ok && cancel.mutate(c.id, { onError: fail }))
      }
    />
  );

  if (c.status === 'PENDING_PAYMENT') {
    return (
      <View className="gap-3 rounded-3xl border border-line bg-surface-card p-4">
        <BanglaText variant="body-strong">পেমেন্ট বাকি: {taka(c.fee)}</BanglaText>
        <BanglaText variant="caption">পেমেন্টের পর প্রথম যে ডাক্তার ফাঁকা থাকবেন, তিনি চ্যাটে আসবেন।</BanglaText>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <ActionButton
              label={`${taka(c.fee)} পেমেন্ট করুন`}
              size="sm"
              loading={pay.isPending}
              onPress={() =>
                pay.mutate(
                  { purpose: 'QUICK_CONSULT', referenceId: c.id },
                  {
                    onSuccess: (o) =>
                      showToast(o.kind === 'paid' ? 'পেমেন্ট হয়েছে। ডাক্তার খোঁজা হচ্ছে…' : o.kind === 'failed' ? 'পেমেন্ট হয়নি।' : 'পেমেন্ট যাচাই হচ্ছে…'),
                    onError: fail,
                  }
                )
              }
            />
          </View>
          {cancelButton}
        </View>
      </View>
    );
  }
  if (c.status === 'WAITING') {
    return (
      <View className="gap-3 rounded-3xl border border-warning/30 bg-surface-card p-4">
        <View className="flex-row items-center gap-3">
          <ActivityIndicator color={colors.primary} />
          <View className="flex-1">
            <BanglaText variant="body-strong">ডাক্তার খোঁজা হচ্ছে…</BanglaText>
            <BanglaText variant="caption">
              {waitLeft ? `${waitLeft} মিনিটের মধ্যে কেউ না নিলে পুরো টাকা ফেরত।` : 'একটু অপেক্ষা করুন।'} চাইলে আরও লিখে রাখুন।
            </BanglaText>
          </View>
        </View>
        <View className="items-start">{cancelButton}</View>
      </View>
    );
  }
  if (c.status === 'ONGOING' && c.call) {
    return (
      <View className="flex-row items-center gap-3 rounded-3xl bg-primary p-4">
        <Video size={22} color={colors.white} />
        <BanglaText className="flex-1 text-white">
          {c.call.active ? 'ডাক্তার ভিডিও কলে আছেন' : 'ডাক্তার কল শুরু করলে এখানে যোগ দিতে পারবেন'}
        </BanglaText>
        {c.call.active ? (
          <ActionButton
            label="যোগ দিন"
            size="sm"
            variant="secondary"
            icon={PhoneCall}
            onPress={() => router.push({ pathname: '/consultations/[consultationId]/call', params: { consultationId: c.id } })}
          />
        ) : null}
      </View>
    );
  }
  if (c.status === 'ONGOING' && c.tier === 'QUICK') {
    return (
      <View className="flex-row items-center justify-end">
        <ActionButton
          label="শেষ করুন"
          size="sm"
          variant="outline"
          loading={end.isPending}
          onPress={() =>
            void confirmAction({
              title: 'পরামর্শ শেষ করবেন?',
              message: 'শেষ করলে আর বার্তা পাঠানো যাবে না।',
              confirmLabel: 'শেষ করুন',
            }).then((ok) => ok && end.mutate(c.id, { onError: fail }))
          }
        />
      </View>
    );
  }
  const endedText =
    c.status === 'MISSED'
      ? 'এবার কোনো ডাক্তার পাওয়া যায়নি। পুরো টাকা ফেরত দেওয়া হচ্ছে।'
      : c.status === 'CANCELLED'
        ? c.paymentStatus ? 'বাতিল হয়েছে। পুরো টাকা ফেরত দেওয়া হচ্ছে।' : 'বাতিল হয়েছে।'
        : c.status === 'EXPIRED'
          ? 'সময়মতো পেমেন্ট হয়নি।'
          : null;
  return endedText ? (
    <View className="rounded-3xl border border-line bg-surface-card p-4">
      <BanglaText variant="caption" className="text-ink">
        {endedText}
      </BanglaText>
    </View>
  ) : null;
}

/** A consultation's chat with its doctor (quick or booked), with the call banner. */
export default function ConsultationChatScreen() {
  const { consultationId } = useLocalSearchParams<{ consultationId: string }>();
  const consultation = useConsultation(consultationId);
  const c = consultation.data;
  const myProvider = useMyProvider();
  // The doctor of this consultation sees it from the other side.
  const asProvider = Boolean(c?.provider && myProvider.data && c.provider.id === myProvider.data.id);
  const conversationId = c?.conversationId ?? null;
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId ?? '');
  const sendImage = useSendImage(conversationId ?? '');
  const markRead = useMarkRead(conversationId);
  const socket = useRealtimeStore((s) => s.socket);
  const [draft, setDraft] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const endsIn = useCountdown(c?.status === 'ONGOING' ? c.endsAt : null);

  const rows = useMemo(() => messages.data?.pages.flatMap((p) => p.data) ?? [], [messages.data]);
  const newestId = rows[0]?.id;

  useRealtimeEvent<ChatTypingEvent>(REALTIME_EVENTS.CHAT_TYPING, (e) => {
    if (e.conversationId !== conversationId) return;
    setOtherTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_SHOWN_MS);
  });

  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    []
  );

  useEffect(() => {
    if (newestId && conversationId) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per newest message
  }, [newestId, conversationId]);

  function submit() {
    const body = draft.trim();
    if (!body || !conversationId) return;
    setDraft('');
    send.mutate(
      { body },
      {
        onError: (e) => {
          setDraft(body);
          showToast(apiErrorMessage(e));
        },
      }
    );
  }

  function onType(text: string) {
    setDraft(text);
    const now = Date.now();
    if (socket && conversationId && now - lastTypingSent.current > TYPING_SEND_EVERY_MS) {
      lastTypingSent.current = now;
      socket.emit(REALTIME_EVENTS.CHAT_TYPING, { conversationId });
    }
  }

  function attach() {
    const run = async (source: 'camera' | 'library') => {
      const file = await pickPhoto(source);
      if (file) sendImage.mutate(file, { onError: (e) => showToast(apiErrorMessage(e)) });
    };
    Alert.alert('ছবি পাঠান', 'রিপোর্ট, প্রেসক্রিপশন বা সমস্যার ছবি', [
      { text: 'ক্যামেরা', onPress: () => void run('camera') },
      { text: 'গ্যালারি', onPress: () => void run('library') },
      { text: 'বাতিল', style: 'cancel' },
    ]);
  }

  const canWrite = Boolean(c?.chatOpen && conversationId);
  const subtitle = c
    ? `${asProvider ? `${c.patient.patientCode} · ` : ''}${CONSULT_STATUS_LABEL[c.status]}${endsIn ? ` · ${endsIn} বাকি` : ''}`
    : undefined;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScreenHeader
        title={c ? (asProvider ? c.patient.fullName : consultTitle(c)) : 'পরামর্শ'}
        subtitle={subtitle}
        fallbackHref={asProvider ? '/provider' : '/consultations'}
        actions={c ? <StatusPill label={CONSULT_STATUS_LABEL[c.status]} tone={CONSULT_STATUS_TONE[c.status]} /> : null}
      />
      {consultation.isLoading ? (
        <View className="gap-3 px-5">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-40" />
        </View>
      ) : consultation.isError || !c ? (
        <View className="px-5">
          <ErrorState error={consultation.error} onRetry={() => void consultation.refetch()} />
        </View>
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="px-4 pb-2">
            {asProvider ? <ProviderPanel c={c} /> : <StatusPanel c={c} />}
            {endsIn ? (
              <View className="mt-2 flex-row items-center gap-1 self-start rounded-full bg-primary-50 px-3 py-1">
                <Timer size={14} color={colors.primary} />
                <BanglaText variant="caption" className="text-primary">
                  চ্যাট আর {endsIn} মিনিট খোলা
                </BanglaText>
              </View>
            ) : null}
          </View>
          <FlatList
            data={rows}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <Bubble
                message={item}
                mine={item.senderRole === (asProvider ? 'PROVIDER' : 'PATIENT')}
                patientId={c.patient.id}
                asProvider={asProvider}
              />
            )}
            contentContainerClassName="px-4 py-2"
            onEndReached={() => {
              if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={messages.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
            keyboardShouldPersistTaps="handled"
          />
          {otherTyping ? (
            <BanglaText variant="caption" className="px-5 pb-1">
              {asProvider ? 'রোগী লিখছেন…' : 'ডাক্তার লিখছেন…'}
            </BanglaText>
          ) : null}
          {canWrite ? (
            <View className="flex-row items-end gap-2 border-t border-line bg-surface-card px-3 py-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ছবি পাঠান"
                onPress={attach}
                disabled={sendImage.isPending}
                className="h-11 w-11 items-center justify-center rounded-full active:bg-primary-50">
                {sendImage.isPending ? <ActivityIndicator color={colors.primary} /> : <ImagePlus size={22} color={colors.primary} />}
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={onType}
                placeholder="বার্তা লিখুন…"
                placeholderTextColor={colors.inkSubtle}
                multiline
                maxLength={2000}
                className="max-h-32 min-h-11 flex-1 rounded-3xl border border-line bg-surface px-4 py-2.5 font-bangla text-[16px] text-ink"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="পাঠান"
                onPress={submit}
                disabled={!draft.trim() || send.isPending}
                className={`h-11 w-11 items-center justify-center rounded-full ${draft.trim() ? 'bg-primary' : 'bg-line'}`}>
                <SendHorizontal size={20} color={colors.white} />
              </Pressable>
            </View>
          ) : c.status !== 'PENDING_PAYMENT' ? (
            <View className="flex-row items-center justify-center gap-2 border-t border-line py-3">
              <Lock size={16} color={colors.inkMuted} />
              <BanglaText variant="caption">চ্যাট এখন শুধু পড়া যাবে</BanglaText>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
