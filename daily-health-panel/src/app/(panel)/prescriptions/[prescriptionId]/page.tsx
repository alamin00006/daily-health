"use client";

import { ArrowLeft, Ban, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PrescriptionEditor } from "@/components/prescriptions/prescription-editor";
import { PrescriptionSheet } from "@/components/prescriptions/prescription-sheet";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, ErrorBox, Field, Skeleton, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PRESCRIPTION_STATUS_LABEL, PRESCRIPTION_STATUS_TONE } from "@/features/labels";
import { usePrescription, usePrescriptionActions } from "@/features/prescription-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant } from "@/lib/format";

export default function PrescriptionPage() {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const toast = useToast();
  const prescription = usePrescription(prescriptionId);
  const actions = usePrescriptionActions();
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");

  if (prescription.isPending) return <Skeleton className="h-96" />;
  if (prescription.isError) {
    return <ErrorBox message={isApiError(prescription.error) ? prescription.error.userMessage : "লোড হয়নি"} onRetry={() => void prescription.refetch()} />;
  }
  const p = prescription.data;
  const patient = [p.patient.patientCode, p.patient.ageYears !== null ? `${bn(p.patient.ageYears)} বছর` : null].filter(Boolean).join(" · ");

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/prescriptions" aria-label="পেছনে" className="flex size-10 items-center justify-center rounded-xl border border-line bg-white hover:bg-mint">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold sm:text-2xl">প্রেসক্রিপশন · {p.patient.fullName}</h1>
          <p className="text-sm text-muted">{p.code} · {patient}</p>
        </div>
        <Badge tone={PRESCRIPTION_STATUS_TONE[p.status]}>{PRESCRIPTION_STATUS_LABEL[p.status]}</Badge>
        {p.status !== "DRAFT" ? (
          <Button size="sm" variant="outline" icon={Printer} onClick={() => window.print()}>প্রিন্ট / PDF</Button>
        ) : null}
        {p.status === "ISSUED" ? (
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" icon={Ban} onClick={() => { setReason(""); setRevoking(true); }}>
            বাতিল করুন
          </Button>
        ) : null}
      </div>

      {p.status === "REVOKED" ? (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger print:hidden">
          {p.revokedAt ? `${formatInstant(p.revokedAt)}-এ বাতিল হয়েছে` : "বাতিল"}
          {p.revokeReason ? ` · কারণ: ${p.revokeReason}` : ""}
        </p>
      ) : null}

      {p.status === "DRAFT" ? <PrescriptionEditor key={p.id} prescription={p} /> : <PrescriptionSheet p={p} />}

      <Modal
        open={revoking}
        onClose={() => setRevoking(false)}
        title="প্রেসক্রিপশন বাতিল করবেন?"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevoking(false)}>না</Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={actions.revoke.isPending}
              onClick={() =>
                actions.revoke.mutate(
                  { id: p.id, reason: reason.trim() },
                  {
                    onSuccess: () => { setRevoking(false); toast("বাতিল হয়েছে; রোগীকে জানানো হয়েছে। দরকার হলে নতুন লিখুন।"); },
                    onError: (e) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error"),
                  },
                )
              }
            >
              বাতিল নিশ্চিত করুন
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">রোগী নোটিফিকেশনে কারণ জানবেন। এর থেকে চালু করা ওষুধের অ্যালার্ম তাঁরা নিজে বন্ধ করবেন।</p>
        <Field label="কারণ" htmlFor="revoke-reason">
          <Textarea id="revoke-reason" rows={3} maxLength={300} placeholder="যেমন: ডোজ ভুল লেখা হয়েছিল" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
