"use client";

import { CheckCircle2, MapPin, Phone, Siren, Truck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  BLOOD_GROUP_LABEL,
  EMERGENCY_STATUS_LABEL,
  EMERGENCY_STATUS_TONE,
  EMERGENCY_TYPE_LABEL,
  GENDER_LABEL,
} from "@/features/labels";
import { useHandleEmergency, useStaffEmergencies } from "@/features/staff-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant, timeAgo } from "@/lib/format";
import type { StaffEmergencyRequestResponse } from "@/shared-contracts/emergency.contract";

/** "+8801711000111" → "01711-000111" */
function localPhone(e164: string): string {
  const local = e164.replace(/^\+88/, "");
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}

function HandleModal({
  request,
  action,
  onClose,
}: {
  request: StaffEmergencyRequestResponse;
  action: "dispatch" | "close";
  onClose: () => void;
}) {
  const toast = useToast();
  const handle = useHandleEmergency();
  const [note, setNote] = useState(request.handlerNote ?? "");
  const submit = () =>
    handle.mutate(
      { id: request.id, action, body: { note: note.trim() || null } },
      {
        onSuccess: () => {
          toast(action === "dispatch" ? "পরিবারকে জানানো হয়েছে: সাহায্য আসছে" : "অনুরোধটি শেষ করা হয়েছে");
          onClose();
        },
        onError: (e) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error"),
      },
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={action === "dispatch" ? `${request.code}: সাহায্য পাঠানো হয়েছে` : `${request.code}: শেষ করুন`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            পেছনে
          </Button>
          <Button variant={action === "dispatch" ? "danger" : "primary"} loading={handle.isPending} onClick={submit}>
            {action === "dispatch" ? "পরিবারকে জানান" : "শেষ করুন"}
          </Button>
        </>
      }
    >
      <Field
        label="পরিবারের জন্য বার্তা"
        htmlFor="handler-note"
        hint="অ্যাপে আর নোটিফিকেশনে দেখাবে, যেমন: অ্যাম্বুলেন্স রওনা হয়েছে, ১৫ মিনিটে পৌঁছাবে।"
      >
        <Textarea id="handler-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function RequestCard({ r }: { r: StaffEmergencyRequestResponse }) {
  const [action, setAction] = useState<"dispatch" | "close" | null>(null);
  const live = r.status === "OPEN" || r.status === "DISPATCHED";
  const mapUrl = r.lat !== null && r.lng !== null ? `https://maps.google.com/?q=${r.lat},${r.lng}` : null;
  return (
    <Card className={live && r.status === "OPEN" ? "border-danger/40 ring-2 ring-danger/15" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold">{EMERGENCY_TYPE_LABEL[r.type]}</p>
            <Badge tone={EMERGENCY_STATUS_TONE[r.status]}>{EMERGENCY_STATUS_LABEL[r.status]}</Badge>
          </div>
          <p className="text-sm text-muted">
            {r.code} · {formatInstant(r.createdAt)} ({timeAgo(r.createdAt)})
          </p>
        </div>
        {live ? (
          <div className="flex flex-wrap gap-2">
            {r.status === "OPEN" ? (
              <Button variant="danger" icon={Truck} onClick={() => setAction("dispatch")}>
                সাহায্য পাঠানো হয়েছে
              </Button>
            ) : null}
            <Button variant="outline" icon={CheckCircle2} onClick={() => setAction("close")}>
              শেষ করুন
            </Button>
          </div>
        ) : null}
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-3">
        <div className="space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase text-muted">রোগী</p>
          <p className="text-base font-semibold">{r.patientName}</p>
          <p>
            {r.patientCode} · {GENDER_LABEL[r.gender]}
            {r.age !== null ? ` · ${bn(r.age)} বছর` : ""}
            {r.bloodGroup ? ` · রক্ত ${BLOOD_GROUP_LABEL[r.bloodGroup]}` : ""}
          </p>
          {r.chronicConditions.length ? <p>রোগ: {r.chronicConditions.join(", ")}</p> : null}
          {r.allergies.length ? <p className="font-medium text-danger">অ্যালার্জি: {r.allergies.join(", ")}</p> : null}
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase text-muted">কোথায়</p>
          {mapUrl ? (
            <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline">
              <MapPin className="size-4" /> ম্যাপে দেখুন
            </a>
          ) : (
            <p className="text-muted">লোকেশন পাওয়া যায়নি</p>
          )}
          {r.address ? <p>{r.address}</p> : null}
          {r.note ? <p className="text-muted">“{r.note}”</p> : null}
          <p className="pt-1 text-muted">
            চেয়েছেন: {r.requestedBy.name ?? "পরিবারের সদস্য"}
            {r.requestedBy.email ? ` (${r.requestedBy.email})` : ""}
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase text-muted">জরুরি কন্টাক্ট</p>
          {r.contacts.length === 0 ? <p className="text-muted">কেউ নেই</p> : null}
          {r.contacts.map((c) => (
            <a key={c.id} href={`tel:${c.phone}`} className="flex items-center gap-2 hover:text-primary">
              <Phone className="size-4" /> {c.name} · {bn(localPhone(c.phone))}
            </a>
          ))}
          <p className="pt-1 text-xs text-muted">
            পরিবারের {bn(r.membersAlerted)} জনকে জানানো হয়েছে; SMS গেছে {bn(r.contactsNotified)}, যায়নি {bn(r.contactsFailed)}
          </p>
        </div>
      </div>
      {r.handlerNote || r.handledByName ? (
        <p className="border-t border-line px-5 py-3 text-sm">
          {r.handledByName ? <span className="font-medium">{r.handledByName}: </span> : null}
          {r.handlerNote ?? ""}
        </p>
      ) : null}
      {action ? <HandleModal request={r} action={action} onClose={() => setAction(null)} /> : null}
    </Card>
  );
}

/** The SOS queue: new requests arrive live over the socket. */
export default function EmergenciesPage() {
  const [state, setState] = useState<"active" | "closed">("active");
  const list = useStaffEmergencies(state);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="জরুরি সেবা"
        subtitle="অ্যাপের আকস্মিক সেবা বাটন থেকে আসা অনুরোধ। পরিবার আর কন্টাক্টকে ফোন করুন, সাহায্য পাঠান, তারপর শেষ করুন।"
        action={
          <div className="flex rounded-xl border border-line bg-white p-1">
            {(["active", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(s)}
                className={`min-h-9 rounded-lg px-4 text-sm font-medium ${state === s ? "bg-primary text-white" : "text-ink hover:bg-mint"}`}
              >
                {s === "active" ? "চলমান" : "পুরোনো"}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-4">
        {list.isPending ? (
          <Skeleton className="h-56" />
        ) : list.isError ? (
          <ErrorBox message={isApiError(list.error) ? list.error.userMessage : "লোড হয়নি"} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={Siren}
              title={state === "active" ? "এখন কোনো জরুরি অনুরোধ নেই" : "এখনো কোনো পুরোনো অনুরোধ নেই"}
              message="নতুন অনুরোধ এলে এই পাতায় সাথে সাথে দেখা যাবে, আর আপনি নোটিফিকেশনও পাবেন।"
            />
          </Card>
        ) : (
          rows.map((r) => <RequestCard key={r.id} r={r} />)
        )}
        {list.hasNextPage ? (
          <Button variant="outline" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            আরও দেখুন
          </Button>
        ) : null}
      </div>
    </>
  );
}
