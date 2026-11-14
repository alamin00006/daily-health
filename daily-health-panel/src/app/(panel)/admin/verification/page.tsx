"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBox, PageHeader, Skeleton } from "@/components/ui/primitives";
import { PROVIDER_TYPE_LABEL, providerTitle, VERIFICATION_LABEL } from "@/features/labels";
import { useReviewQueue } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";
import type { VerificationStatus } from "@/shared-contracts/doctors.contract";

const TABS: VerificationStatus[] = ["PENDING", "REJECTED", "VERIFIED"];

export default function VerificationQueuePage() {
  const [status, setStatus] = useState<VerificationStatus>("PENDING");
  const queue = useReviewQueue(status);

  return (
    <>
      <PageHeader title="সেবাদাতা যাচাই" subtitle="BMDC নম্বর আর কাগজপত্র মিলিয়ে দেখে যাচাই করুন; যাচাইয়ের পরেই রোগীরা দেখতে পান" />
      <div role="tablist" className="mb-4 inline-flex rounded-xl bg-mint p-1 text-sm font-medium">
        {TABS.map((tab) => (
          <button key={tab} role="tab" type="button" aria-selected={status === tab} onClick={() => setStatus(tab)} className={`rounded-lg px-4 py-2 ${status === tab ? "bg-white text-primary shadow-sm" : "text-muted"}`}>
            {VERIFICATION_LABEL[tab]}
          </button>
        ))}
      </div>
      <Card>
        {queue.isPending ? (
          <div className="flex flex-col gap-3 p-5"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : queue.isError ? (
          <div className="p-5"><ErrorBox message={isApiError(queue.error) ? queue.error.userMessage : "লোড হয়নি"} onRetry={() => void queue.refetch()} /></div>
        ) : queue.data.data.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="তালিকা খালি" message={status === "PENDING" ? "যাচাইয়ের অপেক্ষায় কেউ নেই।" : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {queue.data.data.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/verification/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-primary-50">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-mint font-bold text-primary">{p.displayName.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{providerTitle(p.type, p.displayName)}</p>
                    <p className="truncate text-sm text-muted">
                      {PROVIDER_TYPE_LABEL[p.type]} · {p.providerCode}{p.bmdcNo ? ` · BMDC ${p.bmdcNo}` : ""} · {p.accountEmail}
                    </p>
                  </div>
                  {p.missingForVerification.length ? <Badge tone="warning">কাগজ বাকি</Badge> : <Badge tone="primary">{p.documents.length}টি কাগজ</Badge>}
                  <span className="hidden text-sm text-muted sm:inline">{timeAgo(p.submittedAt)}</span>
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
