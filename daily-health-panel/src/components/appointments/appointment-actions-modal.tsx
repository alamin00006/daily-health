"use client";

import { CheckCircle2, MessagesSquare, UserX, Video, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, STATUS_TONE } from "@/features/labels";
import { useStartBookedConsult } from "@/features/consultation-queries";
import { useCompleteAppointment, useNoShow, useProviderCancel } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { bn } from "@/lib/format";
import type { ProviderAppointmentResponse } from "@/shared-contracts/appointments.contract";
import { StartPrescriptionButton } from "@/components/prescriptions/start-prescription-button";
import { AppointmentMeta } from "./appointment-meta";

const FOLLOW_UP_PRESETS = [7, 14, 30, 90];

/** Details and the three things a provider does with a booking. */
export function AppointmentActionsModal({
  appointment,
  onClose,
}: {
  appointment: ProviderAppointmentResponse | null;
  onClose: () => void;
}) {
  // Mounted fresh for each appointment, so no state leaks between them.
  return appointment ? <ActionsBody key={appointment.id} appointment={appointment} onClose={onClose} /> : null;
}

function ActionsBody({
  appointment,
  onClose: close,
}: {
  appointment: ProviderAppointmentResponse;
  onClose: () => void;
}) {
  const toast = useToast();
  const complete = useCompleteAppointment();
  const noShow = useNoShow();
  const cancel = useProviderCancel();
  const startConsult = useStartBookedConsult();
  const router = useRouter();
  const [step, setStep] = useState<"view" | "complete" | "cancel">("view");
  const [followUpDays, setFollowUpDays] = useState<number | "">("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [openedAt] = useState(() => Date.now());
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "করা যায়নি", "error");

  const started = Date.parse(appointment.scheduledAt) <= openedAt;
  const actionable = appointment.status === "CONFIRMED";
  const online = appointment.mode === "VIDEO" || appointment.mode === "CHAT";
  // Opens from 15 minutes before (the API checks the full window).
  const canOpenConsult = actionable && online && Date.parse(appointment.scheduledAt) - 15 * 60_000 <= openedAt;

  return (
    <Modal
      open
      onClose={close}
      title={appointment.patient.fullName}
      footer={
        step === "complete" ? (
          <>
            <Button variant="outline" onClick={() => setStep("view")}>পেছনে</Button>
            <Button
              icon={CheckCircle2}
              loading={complete.isPending}
              onClick={() =>
                complete.mutate(
                  {
                    id: appointment.id,
                    followUpInDays: followUpDays === "" ? undefined : followUpDays,
                    followUpNote: followUpNote.trim() || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast(followUpDays ? `দেখা হয়েছে; ${bn(followUpDays)} দিন পর ফলো-আপের রিমাইন্ডার যাবে` : "দেখা হয়েছে");
                      close();
                    },
                    onError: fail,
                  },
                )
              }
            >
              সম্পন্ন করুন
            </Button>
          </>
        ) : step === "cancel" ? (
          <>
            <Button variant="outline" onClick={() => setStep("view")}>পেছনে</Button>
            <Button
              variant="danger"
              icon={XCircle}
              disabled={cancelReason.trim().length < 3}
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { id: appointment.id, reason: cancelReason.trim() },
                  { onSuccess: () => { toast("বাতিল হয়েছে; রোগীকে SMS আর নোটিফিকেশন পাঠানো হয়েছে"); close(); }, onError: fail },
                )
              }
            >
              বাতিল নিশ্চিত করুন
            </Button>
          </>
        ) : actionable || appointment.status === "PENDING_PAYMENT" ? (
          <>
            <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft" icon={XCircle} onClick={() => setStep("cancel")}>
              বাতিল
            </Button>
            {actionable ? (
              <>
                <Button
                  variant="outline"
                  icon={UserX}
                  disabled={!started}
                  title={started ? undefined : "ভিজিটের সময় এলে চাপা যাবে"}
                  loading={noShow.isPending}
                  onClick={() => noShow.mutate(appointment.id, { onSuccess: () => { toast("“আসেননি” লেখা হয়েছে"); close(); }, onError: fail })}
                >
                  আসেননি
                </Button>
                <Button icon={CheckCircle2} disabled={!started} title={started ? undefined : "ভিজিটের সময় এলে চাপা যাবে"} onClick={() => setStep("complete")}>
                  দেখা হয়েছে
                </Button>
              </>
            ) : null}
          </>
        ) : null
      }
    >
      {step === "view" ? (
        <div className="flex flex-col gap-4">
          <div><Badge tone={STATUS_TONE[appointment.status]}>{STATUS_LABEL[appointment.status]}</Badge></div>
          <AppointmentMeta appointment={appointment} />
          {appointment.status === "PENDING_PAYMENT" ? (
            <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">রোগী এখনো পেমেন্ট করেননি। ১০ মিনিটের মধ্যে না করলে সিরিয়ালটি খুলে যাবে।</p>
          ) : null}
          {actionable && !started ? <p className="text-sm text-muted">ভিজিটের সময় হলে “দেখা হয়েছে” বা “আসেননি” চাপতে পারবেন।</p> : null}
          {(actionable && Date.parse(appointment.scheduledAt) - 60 * 60_000 <= openedAt) || appointment.status === "COMPLETED" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <p className="min-w-0 flex-1 text-sm text-muted">ওষুধ, টেস্ট আর উপদেশ লিখুন; রোগী অ্যাপে পাবেন।</p>
              <StartPrescriptionButton source={{ appointmentId: appointment.id }} onOpened={close} />
            </div>
          ) : null}
          {actionable && online ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-mint px-4 py-3">
              <p className="min-w-0 flex-1 text-sm text-primary">
                {canOpenConsult
                  ? appointment.mode === "VIDEO" ? "কল আর চ্যাট খুলুন; কল শুরু করলে রোগীর ফোনে রিং যাবে।" : "চ্যাট খুলে রোগীর সাথে কথা বলুন।"
                  : "নির্ধারিত সময়ের ১৫ মিনিট আগে থেকে শুরু করা যাবে।"}
              </p>
              <Button
                size="sm"
                icon={appointment.mode === "VIDEO" ? Video : MessagesSquare}
                disabled={!canOpenConsult}
                loading={startConsult.isPending}
                onClick={() =>
                  startConsult.mutate(appointment.id, {
                    onSuccess: (c) => { close(); router.push(`/consultations/${c.id}`); },
                    onError: fail,
                  })
                }
              >
                পরামর্শ শুরু করুন
              </Button>
            </div>
          ) : null}
        </div>
      ) : step === "complete" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">আবার দেখাতে বললে দিন বেছে নিন; রোগীর পরিবারকে ২৪ ঘণ্টা আর ২ ঘণ্টা আগে মনে করানো হবে, আর আপনি তাদের “আমার ডাক্তার” তালিকায় যোগ হবেন।</p>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UP_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={followUpDays === days}
                onClick={() => setFollowUpDays(followUpDays === days ? "" : days)}
                className={`min-h-9 rounded-full border px-4 text-sm ${followUpDays === days ? "border-primary bg-primary text-white" : "border-line bg-white"}`}
              >
                {bn(days)} দিন পর
              </button>
            ))}
          </div>
          <Field label="অথবা দিন লিখুন (ঐচ্ছিক)" htmlFor="days">
            <Input id="days" type="number" min={1} max={365} value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value ? Number(e.target.value) : "")} />
          </Field>
          {followUpDays ? (
            <Field label="ফলো-আপের জন্য নোট (ঐচ্ছিক)" htmlFor="note" hint="যেমন: CBC রিপোর্ট নিয়ে আসবেন">
              <Textarea id="note" rows={2} maxLength={300} value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
            </Field>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">রোগী SMS আর নোটিফিকেশনে কারণসহ জানবেন। পেমেন্ট করা থাকলে টাকা ফেরত যাবে।</p>
          <Field label="কারণ" htmlFor="reason">
            <Textarea id="reason" rows={3} maxLength={200} placeholder="যেমন: জরুরি অপারেশনে আছি" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
