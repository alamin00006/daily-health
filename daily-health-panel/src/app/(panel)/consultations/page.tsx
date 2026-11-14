"use client";

import { Clock3, Hourglass, MessagesSquare, Video, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAcceptQuickConsult, useProviderConsultations, useQuickQueue } from "@/features/consultation-queries";
import { CONSULT_STATUS_LABEL, CONSULT_STATUS_TONE, GENDER_LABEL, QUICK_KIND_LABEL } from "@/features/labels";
import { useMyProvider } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant, money, timeAgo } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import type { ConsultationResponse } from "@/shared-contracts/consultation.contract";

function QueueCard() {
  const toast = useToast();
  const router = useRouter();
  const provider = useMyProvider();
  const { connected } = useRealtime();
  const p = provider.data;
  const canTake = Boolean(p && p.verificationStatus === "VERIFIED" && p.acceptsQuickConsult && p.isOnline);
  const queue = useQuickQueue(canTake);
  const accept = useAcceptQuickConsult();

  return (
    <Card>
      <CardHeader
        title="দ্রুত পরামর্শের কিউ"
        subtitle="রোগী টাকা দিয়ে অপেক্ষা করছেন; যিনি আগে নেবেন তিনি পাবেন। নেওয়ার আগে নাম বা প্রশ্ন দেখা যায় না।"
        action={canTake ? <Badge tone={connected ? "success" : "warning"}>{connected ? "লাইভ" : "সংযোগ হচ্ছে…"}</Badge> : null}
      />
      <div className="p-5">
        {!p ? (
          <Skeleton className="h-16" />
        ) : !p.acceptsQuickConsult ? (
          <p className="text-sm text-muted">
            আপনি দ্রুত পরামর্শ নিচ্ছেন না। <Link href="/profile" className="font-semibold text-primary underline">প্রোফাইলে</Link> চালু করলে এখানে রোগী দেখবেন।
          </p>
        ) : !p.isOnline ? (
          <p className="text-sm text-muted">উপরের সুইচ দিয়ে অনলাইন হলে কিউ দেখা যাবে।</p>
        ) : queue.isPending ? (
          <Skeleton className="h-16" />
        ) : queue.isError ? (
          <ErrorBox message={isApiError(queue.error) ? queue.error.userMessage : "লোড হয়নি"} onRetry={() => void queue.refetch()} />
        ) : !queue.data.length ? (
          <EmptyState icon={Hourglass} title="এখন কেউ অপেক্ষায় নেই" message="নতুন রোগী এলে এখানে সাথে সাথে দেখাবে।" />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {queue.data.map((q) => (
              <li key={q.consultationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-mint text-primary">
                  <Zap className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {QUICK_KIND_LABEL[q.kind]} · {money(q.fee)}
                  </p>
                  <p className="text-sm text-muted">
                    {[q.patientGender ? GENDER_LABEL[q.patientGender as keyof typeof GENDER_LABEL] : null, q.patientAgeYears !== null ? `${bn(q.patientAgeYears)} বছর` : null]
                      .filter(Boolean)
                      .join(", ") || "রোগী"}{" "}
                    · {timeAgo(q.waitingSince)} থেকে অপেক্ষায়
                  </p>
                </div>
                {q.kind === "WOMENS_HEALTH" ? <Badge tone="rose">নারীস্বাস্থ্য</Badge> : null}
                <Button
                  size="sm"
                  loading={accept.isPending && accept.variables === q.consultationId}
                  onClick={() =>
                    accept.mutate(q.consultationId, {
                      onSuccess: (c) => router.push(`/consultations/${c.id}`),
                      onError: (e) => toast(isApiError(e) ? e.userMessage : "নেওয়া যায়নি", "error"),
                    })
                  }
                >
                  নিন
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ConsultationRow({ c }: { c: ConsultationResponse }) {
  const Icon = c.channel === "VIDEO" ? Video : MessagesSquare;
  return (
    <li>
      <Link href={`/consultations/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-primary-50">
        <div className="flex size-10 items-center justify-center rounded-xl bg-mint text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {c.patient.fullName} <span className="font-normal text-muted">· {c.patient.patientCode}</span>
          </p>
          <p className="text-sm text-muted">
            {c.tier === "QUICK" ? QUICK_KIND_LABEL[c.quickKind ?? "GENERAL"] : `${c.channel === "VIDEO" ? "ভিডিও" : "চ্যাট"} অ্যাপয়েন্টমেন্ট ${c.appointmentCode ?? ""}`}
            {" · "}
            {formatInstant(c.startedAt ?? c.createdAt)}
          </p>
        </div>
        <Badge tone={CONSULT_STATUS_TONE[c.status]}>{CONSULT_STATUS_LABEL[c.status]}</Badge>
      </Link>
    </li>
  );
}

function ConsultationsCard({ state }: { state: "active" | "past" }) {
  const list = useProviderConsultations(state);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Card className="mt-6">
      <CardHeader title={state === "active" ? "চলমান পরামর্শ" : "আগের পরামর্শ"} />
      {list.isPending ? (
        <Skeleton className="m-5 h-16" />
      ) : list.isError ? (
        <div className="p-5">
          <ErrorBox message={isApiError(list.error) ? list.error.userMessage : "লোড হয়নি"} onRetry={() => void list.refetch()} />
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={state === "active" ? MessagesSquare : Clock3}
          title={state === "active" ? "এখন কোনো পরামর্শ চলছে না" : "এখনো কোনো পরামর্শ হয়নি"}
          message={state === "active" ? "ভিডিও/চ্যাট অ্যাপয়েন্টমেন্ট পাতা থেকে শুরু করুন, বা কিউ থেকে দ্রুত পরামর্শ নিন।" : undefined}
        />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <ConsultationRow key={c.id} c={c} />
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="border-t border-line p-3 text-center">
              <Button size="sm" variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                আরও দেখুন
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export default function ConsultationsPage() {
  return (
    <>
      <PageHeader title="পরামর্শ" subtitle="ভিডিও/চ্যাট অ্যাপয়েন্টমেন্ট আর দ্রুত পরামর্শ" />
      <QueueCard />
      <ConsultationsCard state="active" />
      <ConsultationsCard state="past" />
    </>
  );
}
