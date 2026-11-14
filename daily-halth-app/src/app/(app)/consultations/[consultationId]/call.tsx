import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  BellRing,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, Pressable, Vibration, View } from 'react-native';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  RtcSurfaceView,
  type IRtcEngine,
} from 'react-native-agora';
import { SafeAreaView } from 'react-native-safe-area-context';

import { consultationsEndpoints } from '@/api/consultations-endpoints';
import { providerWorkEndpoints } from '@/api/provider-work-endpoints';
import { apiErrorMessage } from '@/api/api-error-messages';
import { BanglaText } from '@/components/ui/bangla-text';
import { consultTitle } from '@/features/consultations/consultation-display';
import { useConsultation } from '@/features/consultations/use-consultations';
import { setOpenCall, useRealtimeEvent } from '@/features/realtime/realtime-connection';
import { REALTIME_EVENTS, type CallAnsweredEvent } from '@/shared-contracts/realtime.contract';
import { showToast } from '@/lib/user-feedback';
import { colors } from '@/theme/design-tokens';

type Phase = 'ringing' | 'joining' | 'in-call' | 'ended';
const RING_TIMEOUT_MS = 45_000;
const RING_PATTERN = [0, 900, 700];

async function grantCallPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

function RoundButton({
  label,
  onPress,
  tone = 'dim',
  children,
}: {
  label: string;
  onPress: () => void;
  tone?: 'dim' | 'danger' | 'accept';
  children: React.ReactNode;
}) {
  const bg = tone === 'danger' ? 'bg-danger' : tone === 'accept' ? 'bg-success' : 'bg-white/15';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`h-16 w-16 items-center justify-center rounded-full ${bg} active:opacity-70`}>
      {children}
    </Pressable>
  );
}

/**
 * The patient's side of a video consult (Agora). Opened by the doctor's ring
 * (socket or push, `incoming=1`) or from the chat's "যোগ দিন". The doctor
 * opens the call; the patient can only join while the doctor is in it.
 */
export default function CallScreen() {
  const { consultationId, incoming, caller, as } = useLocalSearchParams<{
    consultationId: string;
    incoming?: string;
    caller?: string;
    /** "provider": the doctor opens the call and rings the patient. */
    as?: string;
  }>();
  const asProvider = as === 'provider';
  const consultation = useConsultation(consultationId);
  const [phase, setPhase] = useState<Phase>(incoming === '1' ? 'ringing' : 'joining');
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const engine = useRef<IRtcEngine | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const callerName =
    caller ??
    (consultation.data ? (asProvider ? consultation.data.patient.fullName : consultTitle(consultation.data)) : 'ডাক্তার');

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/consultations/[consultationId]', params: { consultationId } });
  }, [consultationId]);

  const leave = useCallback(() => {
    const e = engine.current;
    engine.current = null;
    if (e) {
      e.leaveChannel();
      e.release();
    }
  }, []);

  const join = useCallback(async () => {
    Vibration.cancel();
    setPhase('joining');
    if (!(await grantCallPermissions())) {
      showToast('ক্যামেরা আর মাইকের অনুমতি দিলে কল করা যাবে।');
      close();
      return;
    }
    try {
      const token = await consultationsEndpoints.joinCall(consultationId);
      const e = createAgoraRtcEngine();
      engine.current = e;
      e.initialize({
        appId: token.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });
      e.registerEventHandler({
        onJoinChannelSuccess: () => setPhase('in-call'),
        onUserJoined: (_connection, uid) => setRemoteUid(uid),
        onUserOffline: () => {
          setRemoteUid(null);
          // The patient dropping out does not end the doctor's call: they can rejoin or be rung again.
          if (asProvider) setNotice('রোগী কল থেকে বেরিয়ে গেছেন');
          else setPhase('ended');
        },
        onTokenPrivilegeWillExpire: () => {
          void consultationsEndpoints
            .joinCall(consultationId)
            .then((fresh) => engine.current?.renewToken(fresh.token))
            .catch(() => undefined);
        },
        onError: () => undefined,
      });
      e.enableVideo();
      e.startPreview();
      e.setEnableSpeakerphone(true);
      e.joinChannel(token.token, token.channel, token.uid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: true,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
    } catch (error) {
      leave();
      showToast(apiErrorMessage(error));
      close();
    }
  }, [consultationId, close, leave, asProvider]);

  useRealtimeEvent<CallAnsweredEvent>(REALTIME_EVENTS.CALL_ANSWERED, (e) => {
    if (!asProvider || e.consultationId !== consultationId) return;
    setNotice(e.answer === 'JOINED' ? 'রোগী যোগ দিচ্ছেন…' : 'রোগী এখন কল ধরতে পারছেন না');
  });

  /** The doctor hangs up: the API closes the call (the consultation and chat stay open). */
  function hangUp() {
    leave();
    if (asProvider) void providerWorkEndpoints.leaveCall(consultationId).catch(() => undefined);
    close();
  }

  // Ring: vibrate until answered, declined or timed out.
  useEffect(() => {
    if (phase !== 'ringing') return;
    Vibration.vibrate(RING_PATTERN, true);
    const timeout = setTimeout(() => {
      Vibration.cancel();
      close();
    }, RING_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      Vibration.cancel();
    };
  }, [phase, close]);

  // Opened from "যোগ দিন": join right away (after the first paint).
  useEffect(() => {
    if (incoming === '1') return;
    const timer = setTimeout(() => void join(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on open
  }, []);

  useEffect(() => {
    setOpenCall(consultationId);
    return () => {
      setOpenCall(null);
      Vibration.cancel();
      leave();
    };
  }, [consultationId, leave]);

  // The doctor hung up or ended the consultation.
  const status = consultation.data?.status;
  const callActive = consultation.data?.call?.active;
  const doctorGone = status !== undefined && (status !== 'ONGOING' || (!asProvider && callActive === false));
  const ended = phase === 'ended' || (phase === 'in-call' && doctorGone);
  useEffect(() => {
    if (phase === 'ringing' && doctorGone) close();
  }, [phase, doctorGone, close]);

  useEffect(() => {
    if (!ended) return;
    leave();
    showToast('কল শেষ হয়েছে');
    const timer = setTimeout(close, 1200);
    return () => clearTimeout(timer);
  }, [ended, leave, close]);

  function decline() {
    Vibration.cancel();
    void consultationsEndpoints.declineCall(consultationId).catch(() => undefined);
    close();
  }

  function toggleMic() {
    engine.current?.muteLocalAudioStream(micOn);
    setMicOn(!micOn);
  }

  function toggleCamera() {
    engine.current?.muteLocalVideoStream(cameraOn);
    engine.current?.enableLocalVideo(!cameraOn);
    setCameraOn(!cameraOn);
  }

  return (
    <SafeAreaView className="flex-1 bg-ink" edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View className="flex-1">
        {phase === 'in-call' && !ended && remoteUid !== null ? (
          <RtcSurfaceView canvas={{ uid: remoteUid }} style={{ flex: 1 }} />
        ) : (
          <View className="flex-1 items-center justify-center gap-3 px-8">
            {phase === 'joining' ? <ActivityIndicator color={colors.white} size="large" /> : null}
            <BanglaText className="text-center font-bangla-bold text-[26px] leading-[38px] text-white">
              {callerName}
            </BanglaText>
            <BanglaText className="text-center text-white/80">
              {phase === 'ringing'
                ? 'ভিডিও কল করছেন…'
                : phase === 'joining'
                  ? 'যোগ দেওয়া হচ্ছে…'
                  : ended
                    ? 'কল শেষ'
                    : notice ?? (asProvider ? 'রোগীর অপেক্ষায়; ফোনে রিং যাচ্ছে…' : 'ডাক্তারের ভিডিওর অপেক্ষায়…')}
            </BanglaText>
          </View>
        )}
        {phase === 'in-call' && cameraOn ? (
          <View className="absolute right-4 top-4 h-44 w-32 overflow-hidden rounded-2xl border border-white/30">
            <RtcSurfaceView canvas={{ uid: 0 }} zOrderMediaOverlay style={{ flex: 1 }} />
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center justify-center gap-6 px-6 pb-6 pt-4">
        {phase === 'ringing' ? (
          <>
            <RoundButton label="কল কাটুন" tone="danger" onPress={decline}>
              <PhoneOff size={28} color={colors.white} />
            </RoundButton>
            <RoundButton label="কল ধরুন" tone="accept" onPress={() => void join()}>
              <Phone size={28} color={colors.white} />
            </RoundButton>
          </>
        ) : (
          <>
            <RoundButton label={micOn ? 'মাইক বন্ধ' : 'মাইক চালু'} onPress={toggleMic}>
              {micOn ? <Mic size={24} color={colors.white} /> : <MicOff size={24} color="#ff8a8a" />}
            </RoundButton>
            <RoundButton label={cameraOn ? 'ক্যামেরা বন্ধ' : 'ক্যামেরা চালু'} onPress={toggleCamera}>
              {cameraOn ? <Video size={24} color={colors.white} /> : <VideoOff size={24} color="#ff8a8a" />}
            </RoundButton>
            <RoundButton label="ক্যামেরা ঘোরান" onPress={() => engine.current?.switchCamera()}>
              <SwitchCamera size={24} color={colors.white} />
            </RoundButton>
            {asProvider && remoteUid === null && phase === 'in-call' ? (
              <RoundButton
                label="আবার রিং"
                onPress={() =>
                  void providerWorkEndpoints
                    .ring(consultationId)
                    .then(() => setNotice('আবার রিং করা হয়েছে…'))
                    .catch((e: unknown) => showToast(apiErrorMessage(e)))
                }>
                <BellRing size={24} color={colors.white} />
              </RoundButton>
            ) : null}
            <RoundButton label="কল রাখুন" tone="danger" onPress={hangUp}>
              <PhoneOff size={26} color={colors.white} />
            </RoundButton>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
