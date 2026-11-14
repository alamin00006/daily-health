"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Skeleton } from "@/components/ui/primitives";
import { PRESCRIPTION_STATUS_LABEL, PRESCRIPTION_STATUS_TONE } from "@/features/labels";
import { usePrescriptions } from "@/features/prescription-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant } from "@/lib/format";
import type { PrescriptionStatus } from "@/shared-contracts/prescription.contract";

const TABS: { value: PrescriptionStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "সব" },
  { value: "DRAFT", label: "খসড়া" },
  { value: "ISSUED", label: "দেওয়া" },
  { value: "REVOKED", label: "বাতিল" },
];

export default function PrescriptionsPage() {
  const [status, setStatus] = useState<PrescriptionStatus | "ALL">("ALL");
  const list = usePrescriptions(status);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="প্রেসক্রিপশন"
        subtitle="অ্যাপয়েন্টমেন্ট বা পরামর্শের পাতা থেকে নতুন লিখুন"
        action={
          <div className="inline-flex rounded-xl bg-mint p-1 text-sm">
            {TABS.map((t) => (
              <button key={t.value} type="button" onClick={() => setStatus(t.value)} className={`rounded-lg px-3 py-1.5 ${status === t.value ? "bg-white font-semibold text-primary" : "text-muted"}`}>
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      <Card>
        {list.isPending ? (
          <Skeleton className="m-5 h-20" />
        ) : list.isError ? (
          <div className="p-5">
            <ErrorBox message={isApiError(list.error) ? list.error.userMessage : "লোড হয়নি"} onRetry={() => void list.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title="কোনো প্রেসক্রিপশন নেই" message="অ্যাপয়েন্টমেন্টে “প্রেসক্রিপশন লিখুন” বা পরামর্শের পাতা থেকে শুরু করুন।" />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={`/prescriptions/${p.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-primary-50">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-mint text-primary">
                      <FileText className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {p.patient.fullName} <span className="font-normal text-muted">· {p.patient.patientCode}</span>
                      </p>
                      <p className="text-sm text-muted">
                        {p.code} · {bn(p.items.length)}টি ওষুধ · {formatInstant(p.issuedAt ?? p.updatedAt)}
                        {p.diagnosis ? ` · ${p.diagnosis}` : ""}
                      </p>
                    </div>
                    <Badge tone={PRESCRIPTION_STATUS_TONE[p.status]}>{PRESCRIPTION_STATUS_LABEL[p.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            {list.hasNextPage ? (
              <div className="border-t border-line p-3 text-center">
                <Button size="sm" variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>আরও দেখুন</Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
