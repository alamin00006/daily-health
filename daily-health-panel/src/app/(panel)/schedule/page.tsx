"use client";

import { Building2, CalendarOff, Home, MessageSquareText, Pencil, Plus, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { ChamberModal } from "@/components/schedule/chamber-modal";
import { DayOffModal } from "@/components/schedule/day-off-modal";
import { SessionModal } from "@/components/schedule/session-modal";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { MODE_LABEL } from "@/features/labels";
import { useExceptions, useMyProvider, useRemoveException, useUpdateChamber, useUpdateSchedule } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { BANGLA_WEEKDAYS, banglaClock, bn, formatDayLong, money } from "@/lib/format";
import type { ChamberResponse, ScheduleResponse } from "@/shared-contracts/doctors.contract";

const WEEK = [6, 0, 1, 2, 3, 4, 5];
const MODE_ICON = { IN_PERSON: Building2, VIDEO: Video, CHAT: MessageSquareText, HOME_VISIT: Home } as const;

export default function SchedulePage() {
  const toast = useToast();
  const provider = useMyProvider();
  const exceptions = useExceptions();
  const updateSchedule = useUpdateSchedule();
  const updateChamber = useUpdateChamber();
  const removeException = useRemoveException();
  const [chamberModal, setChamberModal] = useState<{ open: boolean; chamber: ChamberResponse | null }>({ open: false, chamber: null });
  const [sessionModal, setSessionModal] = useState<{ open: boolean; schedule: ScheduleResponse | null }>({ open: false, schedule: null });
  const [dayOffOpen, setDayOffOpen] = useState(false);
  const p = provider.data;
  if (!p) return <Skeleton className="h-96" />;

  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error");
  const chamberName = (id: string | null) => p.allChambers.find((c) => c.id === id)?.hospital.name ?? "";

  return (
    <>
      <PageHeader
        title="চেম্বার ও সময়সূচি"
        subtitle="রোগীরা এই সময়গুলোতেই সিরিয়াল বা স্লট নিতে পারেন (৩০ দিন আগে পর্যন্ত)"
        action={
          <div className="flex gap-2">
            <Button variant="outline" icon={CalendarOff} onClick={() => setDayOffOpen(true)}>ছুটি দিন</Button>
            <Button icon={Plus} onClick={() => setSessionModal({ open: true, schedule: null })}>নতুন সেশন</Button>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="চেম্বার"
          subtitle="যেসব হাসপাতাল বা সেন্টারে বসেন, তার ফি সহ"
          action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setChamberModal({ open: true, chamber: null })}>চেম্বার যোগ</Button>}
        />
        {p.allChambers.length === 0 ? (
          <EmptyState icon={Building2} title="কোনো চেম্বার নেই" message="শুধু অনলাইনে দেখলে চেম্বার লাগবে না; প্রোফাইলে ভিডিও বা চ্যাট ফি দিন।" />
        ) : (
          <ul className="divide-y divide-line">
            {p.allChambers.map((c) => (
              <li key={c.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${c.isActive ? "" : "opacity-60"}`}>
                <Building2 className="size-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.hospital.name}{c.room ? <span className="font-normal text-muted"> · {c.room}</span> : null}</p>
                  <p className="text-sm text-muted">{c.hospital.address}, {c.hospital.district}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{money(c.fee)}</p>
                  {c.followUpFee !== null ? <p className="text-muted">ফলো-আপ {money(c.followUpFee)}</p> : null}
                </div>
                <Switch label="চেম্বার চালু" checked={c.isActive} onChange={(isActive) => updateChamber.mutate({ id: c.id, isActive }, { onError: fail })} />
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setChamberModal({ open: true, chamber: c })}>বদলান</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="সাপ্তাহিক সেশন" subtitle="বন্ধ করা সেশনে নতুন বুকিং হয় না; আগের বুকিং থাকে" />
        <div className="divide-y divide-line">
          {WEEK.map((day) => {
            const sessions = p.allSchedules.filter((s) => s.dayOfWeek === day);
            return (
              <div key={day} className="grid gap-3 px-5 py-4 sm:grid-cols-[120px_1fr]">
                <p className="font-semibold">{BANGLA_WEEKDAYS[day]}</p>
                {sessions.length === 0 ? (
                  <p className="text-sm text-muted">কোনো সেশন নেই</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sessions.map((s) => {
                      const Icon = MODE_ICON[s.mode];
                      return (
                        <div key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2 ${s.isActive ? "bg-white" : "bg-surface opacity-60"}`}>
                          <Icon className="size-4 text-primary" />
                          <span className="font-medium">{banglaClock(s.startTime)} – {banglaClock(s.endTime)}</span>
                          <Badge tone={s.mode === "IN_PERSON" ? "primary" : "info"}>{s.mode === "IN_PERSON" ? chamberName(s.chamberId) : MODE_LABEL[s.mode]}</Badge>
                          <span className="text-sm text-muted">{s.maxPatients ? `সর্বোচ্চ ${bn(s.maxPatients)} জন` : `${bn(s.slotMinutes ?? 0)} মিনিটের স্লট`}</span>
                          <div className="ml-auto flex items-center gap-2">
                            <Switch label="সেশন চালু" checked={s.isActive} onChange={(isActive) => updateSchedule.mutate({ id: s.id, isActive }, { onError: fail })} />
                            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setSessionModal({ open: true, schedule: s })}>বদলান</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="সামনের ছুটি ও সময় বদল" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setDayOffOpen(true)}>যোগ করুন</Button>} />
        {exceptions.isPending ? (
          <Skeleton className="m-5 h-16" />
        ) : !exceptions.data?.length ? (
          <EmptyState icon={CalendarOff} title="কোনো ছুটি দেওয়া নেই" />
        ) : (
          <ul className="divide-y divide-line">
            {exceptions.data.map((e) => {
              const s = p.allSchedules.find((x) => x.id === e.scheduleId);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <CalendarOff className="size-5 text-warning" />
                  <div className="flex-1">
                    <p className="font-medium">{formatDayLong(e.date)}</p>
                    <p className="text-sm text-muted">
                      {s ? `${s.mode === "IN_PERSON" ? chamberName(s.chamberId) : MODE_LABEL[s.mode]} (${banglaClock(s.startTime)})` : "সারা দিন"}
                      {e.isOff ? " বন্ধ" : ` নতুন সময় ${banglaClock(e.startTime!)}–${banglaClock(e.endTime!)}`}
                      {e.note ? ` · “${e.note}”` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon={Trash2} className="text-danger hover:bg-danger-soft" loading={removeException.isPending && removeException.variables === e.id} onClick={() => removeException.mutate(e.id, { onError: fail })}>
                    মুছুন
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ChamberModal open={chamberModal.open} chamber={chamberModal.chamber} onClose={() => setChamberModal({ open: false, chamber: null })} />
      <SessionModal open={sessionModal.open} profile={p} schedule={sessionModal.schedule} onClose={() => setSessionModal({ open: false, schedule: null })} />
      <DayOffModal open={dayOffOpen} profile={p} onClose={() => setDayOffOpen(false)} />
    </>
  );
}
