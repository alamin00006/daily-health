"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_DOSE_UNIT, DOSE_UNIT_LABEL, MEAL_TIMING_LABEL, MEDICINE_FORM_LABEL } from "@/features/labels";
import { usePrescriptionActions } from "@/features/prescription-queries";
import { isApiError } from "@/lib/api-client";
import { bn, doseLabel } from "@/lib/format";
import {
  doseUnitSchema,
  mealTimingSchema,
  medicineFormSchema,
  type DoseUnit,
  type MealTiming,
  type MedicineForm,
} from "@/shared-contracts/medicine.contract";
import {
  doseTimesFromPattern,
  parseDosePattern,
  type PrescriptionResponse,
  type SavePrescriptionDraftRequest,
} from "@/shared-contracts/prescription.contract";
import { MedicinePicker } from "./medicine-picker";

const optionalDays = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365), "১ থেকে ৩৬৫ দিন");

const itemForm = z.object({
  medicineId: z.string().optional(),
  medicineName: z.string().trim().min(1, "ওষুধের নাম লিখুন").max(80),
  strength: z.string().trim().max(40),
  form: medicineFormSchema,
  doseUnit: doseUnitSchema,
  dosePattern: z
    .string()
    .trim()
    .refine((v) => parseDosePattern(v) !== null, "যেমন 1+0+1 বা 1+0+½"),
  mealTiming: mealTimingSchema,
  durationDays: optionalDays,
  instruction: z.string().trim().max(300),
});

const prescriptionForm = z.object({
  chiefComplaint: z.string().trim().max(1000),
  diagnosis: z.string().trim().max(1000),
  advice: z.string().trim().max(2000),
  followUpAfterDays: optionalDays,
  items: z.array(itemForm).max(20),
  tests: z.array(z.object({ testName: z.string().trim().min(2, "টেস্টের নাম লিখুন").max(80), note: z.string().trim().max(300) })).max(20),
});
type FormValues = z.infer<typeof prescriptionForm>;

const EMPTY_ITEM: FormValues["items"][number] = {
  medicineName: "",
  strength: "",
  form: "TABLET",
  doseUnit: "TABLET",
  dosePattern: "1+0+1",
  mealTiming: "AFTER_MEAL",
  durationDays: "7",
  instruction: "",
};
const PATTERNS = ["1+0+0", "0+0+1", "1+0+1", "1+1+1", "½+0+½", "1+1+1+1"];

function toValues(p: PrescriptionResponse): FormValues {
  return {
    chiefComplaint: p.chiefComplaint ?? "",
    diagnosis: p.diagnosis ?? "",
    advice: p.advice ?? "",
    followUpAfterDays: p.followUpAfterDays ? String(p.followUpAfterDays) : "",
    items: p.items.map((i) => ({
      medicineId: i.medicineId ?? undefined,
      medicineName: i.medicineName,
      strength: i.strength ?? "",
      form: i.form,
      doseUnit: i.doseUnit,
      dosePattern: i.dosePattern,
      mealTiming: i.mealTiming,
      durationDays: i.durationDays ? String(i.durationDays) : "",
      instruction: i.instruction ?? "",
    })),
    tests: p.tests.map((t) => ({ testName: t.testName, note: t.note ?? "" })),
  };
}

function toRequest(v: FormValues): SavePrescriptionDraftRequest {
  return {
    chiefComplaint: v.chiefComplaint || undefined,
    diagnosis: v.diagnosis || undefined,
    advice: v.advice || undefined,
    followUpAfterDays: v.followUpAfterDays ? Number(v.followUpAfterDays) : null,
    items: v.items.map((i) => ({
      medicineId: i.medicineId || undefined,
      medicineName: i.medicineName,
      strength: i.strength || undefined,
      form: i.form,
      doseUnit: i.doseUnit,
      dosePattern: i.dosePattern,
      mealTiming: i.mealTiming,
      durationDays: i.durationDays ? Number(i.durationDays) : null,
      instruction: i.instruction || undefined,
    })),
    tests: v.tests.map((t) => ({ testName: t.testName, note: t.note || undefined })),
  };
}

/** "সকাল ৮:০০ ১টি, রাত ৯:০০ ½টি" preview of what the patient's alarm will be. */
function PatternPreview({ control, index }: { control: Control<FormValues>; index: number }) {
  const pattern = useWatch({ control, name: `items.${index}.dosePattern` });
  const times = doseTimesFromPattern(pattern ?? "");
  if (!times) return null;
  const label = (t: string) => {
    const h = Number(t.slice(0, 2));
    return h < 12 ? "সকাল" : h < 16 ? "দুপুর" : h < 19 ? "বিকেল" : "রাত";
  };
  return (
    <p className="text-xs text-muted">
      অ্যালার্ম: {times.map((t) => `${label(t.time)} ${bn(t.time)} (${doseLabel(t.dose)})`).join(" · ")}
    </p>
  );
}

/** MedicinePicker bound to one line's name through useWatch. */
function WatchedMedicinePicker({
  control,
  index,
  ...props
}: { control: Control<FormValues>; index: number } & Omit<Parameters<typeof MedicinePicker>[0], "value">) {
  const value = useWatch({ control, name: `items.${index}.medicineName` });
  return <MedicinePicker {...props} value={value ?? ""} />;
}

/** The draft editor: medicines (with catalog search), tests and advice; save or issue. */
export function PrescriptionEditor({ prescription }: { prescription: PrescriptionResponse }) {
  const toast = useToast();
  const router = useRouter();
  const actions = usePrescriptionActions();
  const [confirmIssue, setConfirmIssue] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(prescriptionForm), defaultValues: toValues(prescription) });
  const items = useFieldArray({ control: form.control, name: "items" });
  const tests = useFieldArray({ control: form.control, name: "tests" });
  const errors = form.formState.errors;
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

  const save = form.handleSubmit((values) =>
    actions.save.mutate(
      { id: prescription.id, body: toRequest(values) },
      { onSuccess: (saved) => { form.reset(toValues(saved)); toast("খসড়া সেভ হয়েছে"); }, onError: fail },
    ),
  );

  const issue = form.handleSubmit(async (values) => {
    try {
      await actions.save.mutateAsync({ id: prescription.id, body: toRequest(values) });
      await actions.issue.mutateAsync(prescription.id);
      setConfirmIssue(false);
      toast("প্রেসক্রিপশন দেওয়া হয়েছে; রোগী অ্যাপে পাবেন");
    } catch (e) {
      setConfirmIssue(false);
      fail(e);
    }
  });

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-6">
      <Card>
        <CardHeader title="সমস্যা ও রোগ নির্ণয়" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="রোগীর সমস্যা (C/C)" htmlFor="cc">
            <Textarea id="cc" rows={3} {...form.register("chiefComplaint")} />
          </Field>
          <Field label="রোগ নির্ণয় (Diagnosis)" htmlFor="dx">
            <Textarea id="dx" rows={3} {...form.register("diagnosis")} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="ওষুধ (Rx)"
          subtitle="ডোজ সকাল+দুপুর+রাত হিসেবে লিখুন। রোগী এক চাপে এখান থেকে অ্যালার্ম চালু করবেন।"
          action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => items.append(EMPTY_ITEM)} disabled={items.fields.length >= 20}>ওষুধ যোগ</Button>}
        />
        <div className="flex flex-col divide-y divide-line">
          {items.fields.length === 0 ? <p className="p-5 text-sm text-muted">এখনো কোনো ওষুধ যোগ করা হয়নি।</p> : null}
          {items.fields.map((field, index) => {
            const e = errors.items?.[index];
            const id = (name: string) => `item-${index}-${name}`;
            return (
              <div key={field.id} className="grid gap-3 p-5 md:grid-cols-12">
                <div className="md:col-span-4">
                  <Field label={`${bn(index + 1)}. ওষুধের নাম`} htmlFor={id("name")} error={e?.medicineName?.message}>
                    <WatchedMedicinePicker
                      control={form.control}
                      index={index}
                      id={id("name")}
                      invalid={Boolean(e?.medicineName)}
                      onType={(name) => {
                        form.setValue(`items.${index}.medicineName`, name, { shouldDirty: true, shouldValidate: Boolean(e?.medicineName) });
                        form.setValue(`items.${index}.medicineId`, undefined);
                      }}
                      onPick={(m) => {
                        form.setValue(`items.${index}.medicineName`, m.brandName, { shouldDirty: true, shouldValidate: true });
                        form.setValue(`items.${index}.medicineId`, m.id);
                        form.setValue(`items.${index}.strength`, m.strength);
                        form.setValue(`items.${index}.form`, m.form);
                        form.setValue(`items.${index}.doseUnit`, m.suggestedDoseUnit);
                      }}
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="শক্তি" htmlFor={id("strength")}>
                    <Input id={id("strength")} placeholder="500 mg" {...form.register(`items.${index}.strength`)} />
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="ধরন" htmlFor={id("form")}>
                    <Select
                      id={id("form")}
                      {...form.register(`items.${index}.form`, {
                        onChange: (ev: { target: { value: MedicineForm } }) =>
                          form.setValue(`items.${index}.doseUnit`, DEFAULT_DOSE_UNIT[ev.target.value]),
                      })}
                    >
                      {(Object.keys(MEDICINE_FORM_LABEL) as MedicineForm[]).map((f) => (
                        <option key={f} value={f}>{MEDICINE_FORM_LABEL[f]}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="প্রতিবার কী হিসেবে" htmlFor={id("unit")}>
                    <Select id={id("unit")} {...form.register(`items.${index}.doseUnit`)}>
                      {(Object.keys(DOSE_UNIT_LABEL) as DoseUnit[]).map((u) => (
                        <option key={u} value={u}>{DOSE_UNIT_LABEL[u]}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="ডোজ (সকাল+দুপুর+রাত)" htmlFor={id("pattern")} error={e?.dosePattern?.message}>
                    <Input id={id("pattern")} list="dose-patterns" inputMode="text" {...form.register(`items.${index}.dosePattern`)} aria-invalid={Boolean(e?.dosePattern)} />
                  </Field>
                  <PatternPreview control={form.control} index={index} />
                </div>
                <div className="md:col-span-3">
                  <Field label="কখন" htmlFor={id("meal")}>
                    <Select id={id("meal")} {...form.register(`items.${index}.mealTiming`)}>
                      {(Object.keys(MEAL_TIMING_LABEL) as MealTiming[]).map((m) => (
                        <option key={m} value={m}>{MEAL_TIMING_LABEL[m]}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="কত দিন" htmlFor={id("days")} error={e?.durationDays?.message} hint="খালি = চলবে">
                    <Input id={id("days")} inputMode="numeric" {...form.register(`items.${index}.durationDays`)} aria-invalid={Boolean(e?.durationDays)} />
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="নির্দেশনা" htmlFor={id("note")}>
                    <Input id={id("note")} placeholder="যেমন: ব্যথা হলে" {...form.register(`items.${index}.instruction`)} />
                  </Field>
                </div>
                <div className="flex items-end md:col-span-1">
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" icon={Trash2} aria-label="ওষুধ বাদ দিন" onClick={() => items.remove(index)} />
                </div>
              </div>
            );
          })}
        </div>
        <datalist id="dose-patterns">
          {PATTERNS.map((p) => <option key={p} value={p} />)}
        </datalist>
      </Card>

      <Card>
        <CardHeader
          title="পরীক্ষা"
          action={<Button size="sm" variant="secondary" icon={FlaskConical} onClick={() => tests.append({ testName: "", note: "" })} disabled={tests.fields.length >= 20}>টেস্ট যোগ</Button>}
        />
        <div className="flex flex-col divide-y divide-line">
          {tests.fields.length === 0 ? <p className="p-5 text-sm text-muted">কোনো টেস্ট নেই।</p> : null}
          {tests.fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 p-5 md:grid-cols-12">
              <div className="md:col-span-5">
                <Field label="টেস্টের নাম" htmlFor={`test-${index}`} error={errors.tests?.[index]?.testName?.message}>
                  <Input id={`test-${index}`} placeholder="CBC" {...form.register(`tests.${index}.testName`)} aria-invalid={Boolean(errors.tests?.[index]?.testName)} />
                </Field>
              </div>
              <div className="md:col-span-6">
                <Field label="নোট" htmlFor={`test-note-${index}`}>
                  <Input id={`test-note-${index}`} placeholder="যেমন: খালি পেটে" {...form.register(`tests.${index}.note`)} />
                </Field>
              </div>
              <div className="flex items-end md:col-span-1">
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" icon={Trash2} aria-label="টেস্ট বাদ দিন" onClick={() => tests.remove(index)} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="উপদেশ ও ফলো-আপ" />
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_200px]">
          <Field label="উপদেশ" htmlFor="advice">
            <Textarea id="advice" rows={4} placeholder="যেমন: লবণ কম খাবেন, প্রতিদিন ৩০ মিনিট হাঁটবেন" {...form.register("advice")} />
          </Field>
          <Field label="কত দিন পর আবার আসবেন" htmlFor="fu" error={errors.followUpAfterDays?.message} hint="খালি রাখা যায়">
            <Input id="fu" inputMode="numeric" {...form.register("followUpAfterDays")} aria-invalid={Boolean(errors.followUpAfterDays)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          variant="ghost"
          className="mr-auto text-danger hover:bg-danger-soft"
          icon={Trash2}
          loading={actions.remove.isPending}
          onClick={() =>
            actions.remove.mutate(prescription.id, {
              onSuccess: () => { toast("খসড়া মুছে ফেলা হয়েছে"); router.push("/prescriptions"); },
              onError: fail,
            })
          }
        >
          খসড়া মুছুন
        </Button>
        <Button type="submit" variant="outline" icon={Save} loading={actions.save.isPending && !confirmIssue}>সেভ</Button>
        <Button icon={Send} onClick={() => setConfirmIssue(true)}>দিন (ইস্যু)</Button>
      </div>

      <Modal
        open={confirmIssue}
        onClose={() => setConfirmIssue(false)}
        title="প্রেসক্রিপশন দেবেন?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmIssue(false)}>না</Button>
            <Button icon={Send} loading={actions.issue.isPending || actions.save.isPending} onClick={() => void issue()}>দিন</Button>
          </>
        }
      >
        <p className="text-sm text-muted">দেওয়ার পর আর বদলানো যাবে না। রোগী আর পরিবার অ্যাপে নোটিফিকেশন পাবেন। ভুল থাকলে পরে বাতিল করে নতুন লিখতে হবে।</p>
      </Modal>
    </form>
  );
}
