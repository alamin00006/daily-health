"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { MODE_LABEL } from "@/features/labels";
import { useCreateException } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { BANGLA_WEEKDAYS, banglaClock, dhakaDate, weekdayOf } from "@/lib/format";
import type { MyProviderProfileResponse } from "@/shared-contracts/doctors.contract";

/** A day off (whole day or one session) or changed hours for one date. */
export function DayOffModal({ open, profile, onClose }: { open: boolean; profile: MyProviderProfileResponse; onClose: () => void }) {
  return open ? <DayOffModalBody profile={profile} onClose={onClose} /> : null;
}

function DayOffModalBody({ profile, onClose }: { profile: MyProviderProfileResponse; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateException();
  const [date, setDate] = useState(dhakaDate());
  const [scheduleId, setScheduleId] = useState("");
  const [kind, setKind] = useState<"off" | "hours">("off");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const sessionsThatDay = profile.allSchedules.filter((s) => s.isActive && s.dayOfWeek === weekdayOf(date));
  const chamberName = (id: string | null) => profile.allChambers.find((c) => c.id === id)?.hospital.name;
  const valid = date >= dhakaDate() && (kind === "off" || (scheduleId && start && end && end > start));

  return (
    <Modal
      open
      onClose={onClose}
      title="ছুটি বা সময় বদল"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button
            disabled={!valid}
            loading={create.isPending}
            onClick={() =>
              create.mutate(
                {
                  date,
                  scheduleId: scheduleId || undefined,
                  isOff: kind === "off",
                  startTime: kind === "hours" ? start : undefined,
                  endTime: kind === "hours" ? end : undefined,
                  note: note.trim() || undefined,
                },
                {
                  onSuccess: () => { toast("সেভ হয়েছে; ওই দিন রোগীরা নতুন বুকিং করতে পারবেন না"); onClose(); },
                  onError: (e) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error"),
                },
              )
            }
          >
            সেভ করুন
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="তারিখ" htmlFor="date" hint={BANGLA_WEEKDAYS[weekdayOf(date)]}>
          <Input id="date" type="date" min={dhakaDate()} value={date} onChange={(e) => { setDate(e.target.value); setScheduleId(""); }} />
        </Field>
        <Field label="কোন সেশন" htmlFor="session">
          <Select id="session" value={scheduleId} onChange={(e) => { setScheduleId(e.target.value); if (!e.target.value) setKind("off"); }}>
            <option value="">সারা দিন (সব সেশন)</option>
            {sessionsThatDay.map((s) => (
              <option key={s.id} value={s.id}>
                {s.mode === "IN_PERSON" ? chamberName(s.chamberId) : MODE_LABEL[s.mode]} · {banglaClock(s.startTime)}–{banglaClock(s.endTime)}
              </option>
            ))}
          </Select>
        </Field>
        {scheduleId ? (
          <div className="grid grid-cols-2 gap-2">
            {(["off", "hours"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-10 rounded-xl border text-sm font-medium ${kind === k ? "border-primary bg-mint text-primary" : "border-line bg-white"}`}>
                {k === "off" ? "বন্ধ থাকবে" : "সময় বদলাবে"}
              </button>
            ))}
          </div>
        ) : null}
        {kind === "hours" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="নতুন শুরু" htmlFor="ns"><Input id="ns" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="নতুন শেষ" htmlFor="ne"><Input id="ne" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        ) : null}
        <Field label="রোগীদের জন্য নোট (ঐচ্ছিক)" htmlFor="note" hint="যেমন: কনফারেন্সে আছি">
          <Input id="note" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">আগে থেকে বুক করা রোগীদের বুকিং থেকে যাবে। দরকার হলে অ্যাপয়েন্টমেন্ট পাতা থেকে কারণসহ বাতিল করুন, তাঁরা SMS পাবেন।</p>
      </div>
    </Modal>
  );
}
