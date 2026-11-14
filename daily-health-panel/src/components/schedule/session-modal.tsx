"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { MODE_LABEL } from "@/features/labels";
import { useCreateSchedules, useUpdateSchedule } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { BANGLA_WEEKDAYS, bn } from "@/lib/format";
import type { ConsultationMode, MyProviderProfileResponse, ScheduleResponse } from "@/shared-contracts/doctors.contract";

/** Saturday first, the Bangladeshi work week. */
const WEEK = [6, 0, 1, 2, 3, 4, 5];

/** New weekly session(s) for several days, or edit one day's hours. */
export function SessionModal({
  open,
  ...props
}: {
  open: boolean;
  profile: MyProviderProfileResponse;
  schedule: ScheduleResponse | null;
  onClose: () => void;
}) {
  // Mounted fresh on every open, so the form starts from the schedule being edited.
  return open ? <SessionModalBody {...props} /> : null;
}

function SessionModalBody({
  profile,
  schedule,
  onClose,
}: {
  profile: MyProviderProfileResponse;
  schedule: ScheduleResponse | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateSchedules();
  const update = useUpdateSchedule();
  const chambers = profile.allChambers.filter((c) => c.isActive);
  const [mode, setMode] = useState<ConsultationMode>(schedule?.mode ?? (chambers.length ? "IN_PERSON" : "VIDEO"));
  const [chamberId, setChamberId] = useState(schedule?.chamberId ?? chambers[0]?.id ?? "");
  const [days, setDays] = useState<number[]>(schedule ? [schedule.dayOfWeek] : []);
  const [start, setStart] = useState(schedule?.startTime ?? "17:00");
  const [end, setEnd] = useState(schedule?.endTime ?? "20:00");
  const [maxPatients, setMaxPatients] = useState(String(schedule?.maxPatients ?? 20));
  const [slotMinutes, setSlotMinutes] = useState(String(schedule?.slotMinutes ?? 15));
  const [error, setError] = useState<string | null>(null);

  const feeFor: Record<ConsultationMode, number | null> = {
    IN_PERSON: null,
    VIDEO: profile.fees.video,
    CHAT: profile.fees.chat,
    HOME_VISIT: profile.fees.homeVisit,
  };
  const modeAvailable = (m: ConsultationMode) => (m === "IN_PERSON" ? chambers.length > 0 : feeFor[m] !== null);
  const inPerson = mode === "IN_PERSON";
  const valid = end > start && (schedule || days.length > 0) && (!inPerson || chamberId) && modeAvailable(mode);

  async function save() {
    setError(null);
    try {
      if (schedule) {
        await update.mutateAsync({
          id: schedule.id,
          startTime: start,
          endTime: end,
          ...(inPerson ? { maxPatients: Number(maxPatients) } : { slotMinutes: Number(slotMinutes) }),
        });
      } else {
        await create.mutateAsync({
          mode,
          chamberId: inPerson ? chamberId : null,
          days,
          startTime: start,
          endTime: end,
          maxPatients: inPerson ? Number(maxPatients) : null,
          slotMinutes: inPerson ? null : Number(slotMinutes),
        });
      }
      toast("সময়সূচি সেভ হয়েছে");
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : "সেভ হয়নি");
    }
  }

  const slots = !inPerson && end > start ? Math.floor((toMin(end) - toMin(start)) / Math.max(5, Number(slotMinutes) || 15)) : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={schedule ? `${BANGLA_WEEKDAYS[schedule.dayOfWeek]}-এর সেশন` : "নতুন সাপ্তাহিক সেশন"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button disabled={!valid} loading={create.isPending || update.isPending} onClick={save}>সেভ করুন</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!schedule ? (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">কীভাবে দেখবেন?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["IN_PERSON", "VIDEO", "CHAT", "HOME_VISIT"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!modeAvailable(m)}
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${mode === m ? "border-primary bg-mint text-primary" : "border-line bg-white"}`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              {!modeAvailable("VIDEO") || !modeAvailable("CHAT") || !chambers.length ? (
                <p className="mt-2 text-xs text-muted">ধূসর মোডের জন্য আগে চেম্বার যোগ করুন বা প্রোফাইলে অনলাইন ফি দিন।</p>
              ) : null}
            </div>
            {inPerson ? (
              <Field label="চেম্বার" htmlFor="chamber">
                <Select id="chamber" value={chamberId} onChange={(e) => setChamberId(e.target.value)}>
                  {chambers.map((c) => (
                    <option key={c.id} value={c.id}>{c.hospital.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <div>
              <p className="mb-2 text-sm font-medium">কোন কোন দিন?</p>
              <div className="flex flex-wrap gap-2">
                {WEEK.map((day) => {
                  const on = days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDays(on ? days.filter((d) => d !== day) : [...days, day])}
                      className={`min-h-9 rounded-full border px-3.5 text-sm ${on ? "border-primary bg-primary text-white" : "border-line bg-white"}`}
                    >
                      {BANGLA_WEEKDAYS[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="শুরু" htmlFor="start">
            <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="শেষ" htmlFor="end" error={end <= start ? "শুরুর পরে হতে হবে" : undefined}>
            <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {inPerson ? (
          <Field label="সর্বোচ্চ রোগী (সিরিয়াল)" htmlFor="max" hint="এর বেশি সিরিয়াল দেওয়া হবে না">
            <Input id="max" type="number" min={1} max={300} value={maxPatients} onChange={(e) => setMaxPatients(e.target.value)} />
          </Field>
        ) : (
          <Field label="প্রতি রোগীর সময় (মিনিট)" htmlFor="slot" hint={slots ? `এই সেশনে ${bn(slots)}টি স্লট হবে` : undefined}>
            <Select id="slot" value={slotMinutes} onChange={(e) => setSlotMinutes(e.target.value)}>
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>{bn(m)} মিনিট</option>
              ))}
            </Select>
          </Field>
        )}
        {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}
