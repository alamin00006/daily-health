"use client";

import { clsx } from "clsx";
import { BellRing, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useCallActions } from "@/features/consultation-queries";
import { isApiError } from "@/lib/api-client";
import { useRealtimeEvent } from "@/lib/realtime";
import { REALTIME_EVENTS, type CallAnsweredEvent } from "@/shared-contracts/realtime.contract";

type Phase = "idle" | "joining" | "in-call";

interface CallSession {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack | null;
  camera: ICameraVideoTrack | null;
}

/**
 * The doctor's side of a video consult (Agora Web SDK). Starting the call
 * gets a token from the API, which also rings the patient's phone.
 */
export function VideoCall({ consultationId, patientName, canCall }: { consultationId: string; patientName: string; canCall: boolean }) {
  const toast = useToast();
  const actions = useCallActions(consultationId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [remoteIn, setRemoteIn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<CallSession | null>(null);
  const localView = useRef<HTMLDivElement>(null);
  const remoteView = useRef<HTMLDivElement>(null);

  useRealtimeEvent<CallAnsweredEvent>(REALTIME_EVENTS.CALL_ANSWERED, (e) => {
    if (e.consultationId !== consultationId) return;
    setNotice(e.answer === "JOINED" ? "রোগী যোগ দিচ্ছেন…" : "রোগী এখন কল ধরতে পারছেন না");
  });

  // Leave the channel if the page closes mid-call.
  useEffect(() => () => void teardown(session.current), []);

  async function start() {
    setPhase("joining");
    setNotice(null);
    try {
      const join = await actions.join.mutateAsync();
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
      AgoraRTC.setLogLevel(3);
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      session.current = { client, mic: null, camera: null };

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video" && remoteView.current) user.videoTrack?.play(remoteView.current);
        if (mediaType === "audio") user.audioTrack?.play();
        setRemoteIn(true);
        setNotice(null);
      });
      client.on("user-left", () => {
        setRemoteIn(false);
        setNotice("রোগী কল থেকে বেরিয়ে গেছেন");
      });
      client.on("token-privilege-will-expire", async () => {
        const fresh = await actions.join.mutateAsync().catch(() => null);
        if (fresh) await client.renewToken(fresh.token);
      });

      await client.join(join.appId, join.channel, join.token, join.uid);
      const [mic, camera] = await AgoraRTC.createMicrophoneAndCameraTracks();
      session.current = { client, mic, camera };
      if (localView.current) camera.play(localView.current);
      await client.publish([mic, camera]);
      setMicOn(true);
      setCameraOn(true);
      setPhase("in-call");
      setNotice(`${patientName}-কে কল যাচ্ছে…`);
    } catch (error) {
      await teardown(session.current);
      session.current = null;
      setPhase("idle");
      const name = (error as { name?: string; code?: string }).code ?? (error as Error).name;
      toast(
        isApiError(error)
          ? error.userMessage
          : name === "PERMISSION_DENIED" || name === "NotAllowedError"
            ? "ক্যামেরা/মাইকের অনুমতি দিন (ব্রাউজারের ঠিকানার পাশে)"
            : "কল শুরু করা যায়নি",
        "error",
      );
    }
  }

  async function hangUp() {
    await teardown(session.current);
    session.current = null;
    setPhase("idle");
    setRemoteIn(false);
    setNotice(null);
    actions.leave.mutate();
  }

  async function toggleMic() {
    const mic = session.current?.mic;
    if (!mic) return;
    await mic.setEnabled(!micOn);
    setMicOn(!micOn);
  }

  async function toggleCamera() {
    const camera = session.current?.camera;
    if (!camera) return;
    await camera.setEnabled(!cameraOn);
    setCameraOn(!cameraOn);
  }

  return (
    <div className="flex flex-col self-start overflow-hidden rounded-2xl border border-line bg-ink text-white">
      <div className="relative aspect-video w-full bg-ink">
        <div ref={remoteView} className="absolute inset-0" />
        {!remoteIn ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-lg font-semibold">{phase === "in-call" ? "রোগীর অপেক্ষায়" : "ভিডিও কল"}</p>
            <p className="max-w-sm text-sm text-white/70">
              {notice ?? (canCall ? "কল শুরু করলে রোগীর ফোনে রিং যাবে।" : "পরামর্শ শেষ।")}
            </p>
          </div>
        ) : notice ? (
          <p className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs">{notice}</p>
        ) : null}
        <div
          ref={localView}
          className={clsx(
            "absolute bottom-3 right-3 aspect-video w-1/4 min-w-28 overflow-hidden rounded-xl border border-white/30 bg-black",
            phase === "in-call" ? "block" : "hidden",
          )}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 bg-ink px-4 py-3">
        {phase === "in-call" ? (
          <>
            <button type="button" onClick={() => void toggleMic()} aria-label={micOn ? "মাইক বন্ধ" : "মাইক চালু"} className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5 text-danger" />}
            </button>
            <button type="button" onClick={() => void toggleCamera()} aria-label={cameraOn ? "ক্যামেরা বন্ধ" : "ক্যামেরা চালু"} className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              {cameraOn ? <Video className="size-5" /> : <VideoOff className="size-5 text-danger" />}
            </button>
            {!remoteIn ? (
              <Button size="sm" variant="secondary" icon={BellRing} loading={actions.ring.isPending} onClick={() => actions.ring.mutate(undefined, { onSuccess: () => setNotice("আবার রিং করা হয়েছে…") })}>
                আবার রিং
              </Button>
            ) : null}
            <Button size="sm" variant="danger" icon={PhoneOff} onClick={() => void hangUp()}>
              কল রাখুন
            </Button>
          </>
        ) : (
          <Button icon={Video} loading={phase === "joining"} disabled={!canCall} onClick={() => void start()}>
            কল শুরু করুন
          </Button>
        )}
      </div>
    </div>
  );
}

async function teardown(session: CallSession | null): Promise<void> {
  if (!session) return;
  session.mic?.close();
  session.camera?.close();
  await session.client.leave().catch(() => undefined);
}
