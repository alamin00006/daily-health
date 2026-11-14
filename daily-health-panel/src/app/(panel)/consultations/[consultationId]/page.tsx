"use client";

import { ArrowLeft, CircleStop, Timer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/consultations/chat-panel";
import { VideoCall } from "@/components/consultations/video-call";
import { StartPrescriptionButton } from "@/components/prescriptions/start-prescription-button";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, ErrorBox, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useConsultation, useEndConsultation } from "@/features/consultation-queries";
import { CONSULT_STATUS_LABEL, CONSULT_STATUS_TONE, GENDER_LABEL, QUICK_KIND_LABEL } from "@/features/labels";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant, money } from "@/lib/format";
import type { ConsultationResponse } from "@/shared-contracts/consultation.contract";

/** "১২:০৫" left until `iso`, ticking each second. */
function useCountdown(iso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  const left = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  return bn(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
}

function PatientLine({ c }: { c: ConsultationResponse }) {
  const facts = [
    c.patient.patientCode,
    c.patient.gender ? GENDER_LABEL[c.patient.gender as keyof typeof GENDER_LABEL] : null,
    c.patient.ageYears !== null ? `${bn(c.patient.ageYears)} বছর` : null,
  ].filter(Boolean);
  return <p className="text-sm text-muted">{facts.join(" · ")}</p>;
}

export default function ConsultationRoomPage() {
  const { consultationId } = useParams<{ consultationId: string }>();
  const toast = useToast();
  const consultation = useConsultation(consultationId);
  const end = useEndConsultation();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const countdown = useCountdown(consultation.data?.endsAt ?? null);

  if (consultation.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (consultation.isError) {
    return <ErrorBox message={isApiError(consultation.error) ? consultation.error.userMessage : "লোড হয়নি"} onRetry={() => void consultation.refetch()} />;
  }

  const c = consultation.data;
  const ongoing = c.status === "ONGOING";
  const isVideo = c.channel === "VIDEO";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/consultations" aria-label="পেছনে" className="flex size-10 items-center justify-center rounded-xl border border-line bg-white hover:bg-mint">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{c.patient.fullName}</h1>
          <PatientLine c={c} />
        </div>
        <Badge tone={CONSULT_STATUS_TONE[c.status]}>{CONSULT_STATUS_LABEL[c.status]}</Badge>
        {c.tier === "QUICK" ? (
          <Badge tone={c.quickKind === "WOMENS_HEALTH" ? "rose" : "info"}>{QUICK_KIND_LABEL[c.quickKind ?? "GENERAL"]}</Badge>
        ) : c.appointmentCode ? (
          <Badge tone="neutral">{c.appointmentCode}</Badge>
        ) : null}
        {ongoing && countdown ? (
          <span className="flex items-center gap-1 rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
            <Timer className="size-4" /> {countdown}
          </span>
        ) : null}
        {c.status === "ONGOING" || c.status === "ENDED" ? (
          <StartPrescriptionButton
            source={c.appointmentId ? { appointmentId: c.appointmentId } : { consultationId: c.id }}
          />
        ) : null}
        {ongoing ? (
          <Button variant="danger" size="sm" icon={CircleStop} onClick={() => setConfirmEnd(true)}>
            শেষ করুন
          </Button>
        ) : null}
      </div>

      {!ongoing ? (
        <p className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
          {c.endedAt ? `${formatInstant(c.endedAt)}-এ শেষ হয়েছে` : CONSULT_STATUS_LABEL[c.status]}
          {c.durationSec ? ` · ${bn(Math.round(c.durationSec / 60))} মিনিট` : ""} · ফি {money(c.fee)}
          {c.appointmentId ? " · অ্যাপয়েন্টমেন্ট পাতা থেকে “দেখা হয়েছে” দিন" : ""}
        </p>
      ) : null}

      <div className={isVideo ? "grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}>
        {isVideo ? <VideoCall consultationId={c.id} patientName={c.patient.fullName} canCall={ongoing} /> : null}
        {c.conversationId ? (
          <ChatPanel conversationId={c.conversationId} open={c.chatOpen} className={isVideo ? "h-[32rem] lg:h-[calc(100vh-12rem)]" : "h-[calc(100vh-14rem)] min-h-[28rem]"} />
        ) : (
          <p className="text-sm text-muted">চ্যাট নেই।</p>
        )}
      </div>

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="পরামর্শ শেষ করবেন?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>না</Button>
            <Button
              variant="danger"
              loading={end.isPending}
              onClick={() =>
                end.mutate(c.id, {
                  onSuccess: () => { setConfirmEnd(false); toast("পরামর্শ শেষ হয়েছে"); },
                  onError: (e) => toast(isApiError(e) ? e.userMessage : "শেষ করা যায়নি", "error"),
                })
              }
            >
              শেষ করুন
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">শেষ করলে কল বন্ধ হবে আর চ্যাট শুধু পড়া যাবে। রোগী জানবেন।</p>
      </Modal>
    </>
  );
}
