"use client";

import { clsx } from "clsx";
import { Building2, CalendarX2, Home, MessageSquareText, Video } from "lucide-react";
import { useState } from "react";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { GENDER_LABEL, MODE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/features/labels";
import { banglaClock, bn, dhakaTime, money } from "@/lib/format";
import type { ProviderAppointmentResponse } from "@/shared-contracts/appointments.contract";
import { AppointmentActionsModal } from "./appointment-actions-modal";

const MODE_ICON = { IN_PERSON: Building2, VIDEO: Video, CHAT: MessageSquareText, HOME_VISIT: Home } as const;

/** Groups a day's bookings by session (chamber evening or online block). */
function groupBySession(rows: ProviderAppointmentResponse[]) {
  const groups = new Map<string, ProviderAppointmentResponse[]>();
  for (const row of rows) {
    const key = row.mode === "IN_PERSON" ? `${row.chamber?.id}:${row.sessionStartTime}` : `${row.mode}:${row.sessionStartTime.slice(0, 2)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

export function AppointmentList({ rows, emptyText }: { rows: ProviderAppointmentResponse[]; emptyText: string }) {
  const [selected, setSelected] = useState<ProviderAppointmentResponse | null>(null);
  if (rows.length === 0) {
    return <EmptyState icon={CalendarX2} title="কোনো অ্যাপয়েন্টমেন্ট নেই" message={emptyText} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {groupBySession(rows).map((group) => {
        const first = group[0]!;
        const Icon = MODE_ICON[first.mode];
        const live = group.filter((r) => r.status === "CONFIRMED" || r.status === "PENDING_PAYMENT").length;
        return (
          <section key={first.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <Icon className="size-4 text-primary" />
              <span className="font-semibold">
                {first.mode === "IN_PERSON" ? first.chamber?.hospital.name : MODE_LABEL[first.mode]}
              </span>
              {first.mode === "IN_PERSON" ? (
                <span className="text-muted">
                  · {banglaClock(first.sessionStartTime)} – {banglaClock(first.sessionEndTime)}
                </span>
              ) : null}
              <span className="text-muted">· {bn(live)} জন বাকি</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              {group.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelected(row)}
                  className={clsx(
                    "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-primary-50",
                    index > 0 && "border-t border-line",
                    (row.status === "CANCELLED" || row.status === "NO_SHOW") && "opacity-60",
                  )}
                >
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-mint text-primary">
                    {row.serialNo ? (
                      <>
                        <span className="text-[10px] leading-none">সিরিয়াল</span>
                        <span className="text-lg font-bold leading-tight">{bn(row.serialNo)}</span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold">{bn(dhakaTime(row.scheduledAt))}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {row.patient.fullName}
                      {row.kind === "FOLLOW_UP" ? <Badge tone="info" className="ml-2 align-middle">ফলো-আপ</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {row.patient.patientCode} · {GENDER_LABEL[row.patient.gender]}
                      {row.patient.age !== null ? `, ${bn(row.patient.age)} বছর` : ""}
                      {row.estimatedAt ? ` · আনুমানিক ${banglaClock(dhakaTime(row.estimatedAt))}` : ""}
                    </p>
                    {row.reason ? <p className="mt-0.5 line-clamp-1 text-sm text-ink/80">“{row.reason}”</p> : null}
                  </div>
                  <div className="hidden text-right sm:block">
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    <p className="mt-1 text-xs text-muted">{money(row.fee)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <AppointmentActionsModal appointment={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
