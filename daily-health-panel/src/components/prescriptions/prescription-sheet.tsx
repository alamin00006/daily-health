import { DOSE_UNIT_LABEL, GENDER_LABEL, MEAL_TIMING_LABEL, MEDICINE_FORM_LABEL } from "@/features/labels";
import { bn, formatInstant } from "@/lib/format";
import type { PrescriptionResponse } from "@/shared-contracts/prescription.contract";

/**
 * The prescription as the patient gets it: read only and printable (the
 * panel's "প্রিন্ট" saves it as PDF too, with proper Bangla shaping).
 */
export function PrescriptionSheet({ p }: { p: PrescriptionResponse }) {
  const doctor = p.provider;
  const patientFacts = [
    p.patient.patientCode,
    p.patient.gender ? GENDER_LABEL[p.patient.gender as keyof typeof GENDER_LABEL] : null,
    p.patient.ageYears !== null ? `${bn(p.patient.ageYears)} বছর` : null,
  ].filter(Boolean);

  return (
    <article className="prescription-sheet rounded-2xl border border-line bg-white p-6 print:rounded-none print:border-0 print:p-0 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary pb-4">
        <div>
          <p className="font-display text-2xl font-bold text-primary">{doctor ? `ডা. ${doctor.displayName}` : "ডাক্তার"}</p>
          {doctor ? (
            <p className="text-sm text-muted">
              {doctor.qualifications}
              {doctor.designation ? ` · ${doctor.designation}` : ""}
              {doctor.bmdcNo ? ` · BMDC ${doctor.bmdcNo}` : ""}
            </p>
          ) : null}
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{p.code}</p>
          <p className="text-muted">{p.issuedAt ? formatInstant(p.issuedAt) : "খসড়া"}</p>
          {p.appointmentCode ? <p className="text-muted">বুকিং {p.appointmentCode}</p> : null}
        </div>
      </header>

      <section className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line py-3 text-sm">
        <p><span className="text-muted">রোগী:</span> <span className="font-semibold">{p.patient.fullName}</span></p>
        <p className="text-muted">{patientFacts.join(" · ")}</p>
      </section>

      <div className="grid gap-6 pt-4 md:grid-cols-[1fr_2fr] print:grid-cols-[1fr_2fr]">
        <aside className="flex flex-col gap-4 text-sm md:border-r md:border-line md:pr-6 print:border-r print:border-line print:pr-6">
          {p.chiefComplaint ? (
            <div><p className="font-semibold text-primary">সমস্যা</p><p className="whitespace-pre-wrap">{p.chiefComplaint}</p></div>
          ) : null}
          {p.diagnosis ? (
            <div><p className="font-semibold text-primary">রোগ নির্ণয়</p><p className="whitespace-pre-wrap">{p.diagnosis}</p></div>
          ) : null}
          {p.tests.length ? (
            <div>
              <p className="font-semibold text-primary">পরীক্ষা</p>
              <ul className="list-disc pl-5">
                {p.tests.map((t) => (
                  <li key={t.id}>{t.testName}{t.note ? ` (${t.note})` : ""}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <section>
          <p className="font-display text-3xl font-bold text-primary">℞</p>
          {p.items.length === 0 ? <p className="text-sm text-muted">কোনো ওষুধ নেই।</p> : null}
          <ol className="mt-2 flex flex-col gap-3">
            {p.items.map((item, i) => (
              <li key={item.id} className="break-inside-avoid">
                <p className="font-semibold">
                  {bn(i + 1)}. {MEDICINE_FORM_LABEL[item.form]} {item.medicineName}{item.strength ? ` ${item.strength}` : ""}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">{bn(item.dosePattern)}</span> {DOSE_UNIT_LABEL[item.doseUnit]} ·{" "}
                  {MEAL_TIMING_LABEL[item.mealTiming]} ·{" "}
                  {item.durationDays ? `${bn(item.durationDays)} দিন` : "চলবে"}
                  {item.instruction ? ` · ${item.instruction}` : ""}
                </p>
              </li>
            ))}
          </ol>
          {p.advice ? (
            <div className="mt-6 text-sm">
              <p className="font-semibold text-primary">উপদেশ</p>
              <p className="whitespace-pre-wrap">{p.advice}</p>
            </div>
          ) : null}
          {p.followUpAfterDays ? (
            <p className="mt-4 text-sm font-semibold">{bn(p.followUpAfterDays)} দিন পর আবার দেখা করবেন।</p>
          ) : null}
        </section>
      </div>

      <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
        দৈনিক স্বাস্থ্য অ্যাপে দেওয়া ডিজিটাল প্রেসক্রিপশন · {p.code}
      </footer>
    </article>
  );
}
