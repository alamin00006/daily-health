"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Apple, Plus, Send, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api-client";
import { bn, dhakaDate, formatDate, formatInstant } from "@/lib/format";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import {
  mealTypeSchema,
  type DietPlanCandidateResponse,
  type DietPlanStatus,
  type MealType,
  type ProviderDietPlanResponse,
} from "@/shared-contracts/nutrition.contract";

const MEAL_LABEL: Record<MealType, string> = { BREAKFAST: "সকালের নাস্তা", LUNCH: "দুপুরের খাবার", SNACKS: "বিকেলের নাস্তা", DINNER: "রাতের খাবার" };
const STATUS_LABEL: Record<DietPlanStatus, string> = { DRAFT: "খসড়া", ACTIVE: "চালু", ENDED: "শেষ" };
const STATUS_TONE: Record<DietPlanStatus, "warning" | "success" | "neutral"> = { DRAFT: "warning", ACTIVE: "success", ENDED: "neutral" };
const DEFAULT_MEALS = [
  { mealType: "BREAKFAST" as const, time: "08:00", description: "", approxKcal: "" },
  { mealType: "LUNCH" as const, time: "13:30", description: "", approxKcal: "" },
  { mealType: "SNACKS" as const, time: "17:00", description: "", approxKcal: "" },
  { mealType: "DINNER" as const, time: "20:30", description: "", approxKcal: "" },
];

const planForm = z
  .object({
    title: z.string().trim().min(2, "শিরোনাম দিন").max(120),
    calorieTargetKcal: z.coerce.number().int().min(500, "৫০০–৬০০০").max(6000, "৫০০–৬০০০"),
    waterTargetMl: z.coerce.number().int().min(500, "৫০০–৮০০০ মিলি").max(8000, "৫০০–৮০০০ মিলি"),
    startDate: z.string().min(10, "শুরুর তারিখ দিন"),
    endDate: z.string(),
    notes: z.string().trim().max(3000),
    meals: z
      .array(
        z.object({
          mealType: mealTypeSchema,
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "সময় দিন"),
          description: z.string().trim().min(2, "কী খাবেন লিখুন").max(1000),
          approxKcal: z.union([z.literal(""), z.coerce.number().int().min(0).max(5000)]),
        }),
      )
      .min(1, "অন্তত একটি খাবার")
      .max(6),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "শুরুর আগে শেষ হতে পারে না" });
type PlanValues = z.input<typeof planForm>;

function toRequest(v: z.output<typeof planForm>) {
  return {
    title: v.title,
    calorieTargetKcal: v.calorieTargetKcal,
    waterTargetMl: v.waterTargetMl,
    startDate: v.startDate,
    endDate: v.endDate || null,
    notes: v.notes || null,
    meals: v.meals.map((m) => ({ ...m, approxKcal: m.approxKcal === "" ? null : m.approxKcal })),
  };
}

function PlanEditor({
  plan,
  visit,
  onClose,
}: {
  plan: ProviderDietPlanResponse | null;
  visit: DietPlanCandidateResponse | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ["provider", "diet-plans"] });
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");
  const editable = !plan || plan.status !== "ENDED";
  const form = useForm<PlanValues>({
    resolver: zodResolver(planForm),
    defaultValues: plan
      ? {
          title: plan.title,
          calorieTargetKcal: plan.calorieTargetKcal,
          waterTargetMl: plan.waterTargetMl,
          startDate: plan.startDate,
          endDate: plan.endDate ?? "",
          notes: plan.notes ?? "",
          meals: plan.meals.map((m) => ({ mealType: m.mealType, time: m.time, description: m.description, approxKcal: m.approxKcal ?? "" })),
        }
      : { title: "", calorieTargetKcal: 1800, waterTargetMl: 3000, startDate: dhakaDate(), endDate: "", notes: "", meals: DEFAULT_MEALS },
  });
  const meals = useFieldArray({ control: form.control, name: "meals" });
  const e = form.formState.errors;

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toRequest>) =>
      plan
        ? api.put<ProviderDietPlanResponse>(`/provider/me/diet-plans/${plan.id}`, body)
        : api.post<ProviderDietPlanResponse>("/provider/me/diet-plans", { ...body, appointmentId: visit!.appointmentId }),
    onSuccess: refresh,
  });
  const step = useMutation({
    mutationFn: (action: "publish" | "end" | "delete") =>
      action === "delete" ? api.delete(`/provider/me/diet-plans/${plan!.id}`) : api.post(`/provider/me/diet-plans/${plan!.id}/${action}`),
    onSuccess: refresh,
  });
  const submit = form.handleSubmit((raw) =>
    save.mutate(toRequest(planForm.parse(raw)), {
      onSuccess: () => (toast(plan ? "সেভ হয়েছে" : "খসড়া তৈরি হয়েছে; দেখে নিয়ে রোগীকে দিন"), onClose()),
      onError: fail,
    }),
  );
  const who = plan ? `${plan.patientName ?? "রোগী"} (${plan.patientCode ?? ""}) · ${plan.appointmentCode ?? ""}` : `${visit?.patientName ?? "রোগী"} (${visit?.patientCode ?? ""}) · ${visit?.appointmentCode ?? ""}`;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={plan ? "ডায়েট চার্ট" : "নতুন ডায়েট চার্ট"}
      footer={
        <>
          {plan?.status === "DRAFT" ? (
            <Button variant="ghost" icon={Trash2} className="mr-auto text-danger" onClick={() => window.confirm("খসড়া মুছবেন?") && step.mutate("delete", { onSuccess: () => (toast("মুছে ফেলা হয়েছে"), onClose()), onError: fail })}>
              মুছুন
            </Button>
          ) : null}
          {plan?.status === "ACTIVE" ? (
            <Button variant="outline" icon={Square} className="mr-auto" onClick={() => window.confirm("প্ল্যান শেষ করবেন? রোগী আর আজকের পর থেকে এটি দেখবেন না।") && step.mutate("end", { onSuccess: () => (toast("প্ল্যান শেষ"), onClose()), onError: fail })}>
              প্ল্যান শেষ করুন
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>বন্ধ</Button>
          {editable ? <Button loading={save.isPending} onClick={() => void submit()}>সেভ করুন</Button> : null}
          {plan?.status === "DRAFT" ? (
            <Button icon={Send} loading={step.isPending} onClick={() => step.mutate("publish", { onSuccess: () => (toast("রোগীকে দেওয়া হয়েছে"), onClose()), onError: fail })}>
              রোগীকে দিন
            </Button>
          ) : null}
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">{who}</p>
      <fieldset disabled={!editable} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="শিরোনাম" htmlFor="d-title" error={e.title?.message}>
            <Input id="d-title" placeholder="যেমন: ওজন কমানো ও সুগার নিয়ন্ত্রণ" {...form.register("title")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="দিনে ক্যালরি (kcal)" htmlFor="d-kcal" error={e.calorieTargetKcal?.message}>
              <Input id="d-kcal" type="number" {...form.register("calorieTargetKcal")} />
            </Field>
            <Field label="দিনে পানি (মিলি)" htmlFor="d-water" error={e.waterTargetMl?.message}>
              <Input id="d-water" type="number" step={250} {...form.register("waterTargetMl")} />
            </Field>
          </div>
          <Field label="শুরু" htmlFor="d-start" error={e.startDate?.message}>
            <Input id="d-start" type="date" {...form.register("startDate")} />
          </Field>
          <Field label="শেষ (ঐচ্ছিক)" htmlFor="d-end" error={e.endDate?.message} hint="খালি = যতদিন না নতুন প্ল্যান দেন">
            <Input id="d-end" type="date" {...form.register("endDate")} />
          </Field>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold">খাবার</p>
          {meals.fields.map((field, i) => (
            <Card key={field.id} className="grid gap-3 p-3 sm:grid-cols-[160px_110px_1fr_110px_auto] sm:items-start">
              <Select aria-label="বেলা" {...form.register(`meals.${i}.mealType`)}>
                {mealTypeSchema.options.map((t) => <option key={t} value={t}>{MEAL_LABEL[t]}</option>)}
              </Select>
              <Input aria-label="সময়" type="time" {...form.register(`meals.${i}.time`)} />
              <div>
                <Textarea aria-label="কী খাবেন" rows={2} placeholder="কী, কতটুকু" {...form.register(`meals.${i}.description`)} />
                {e.meals?.[i]?.description ? <p className="text-sm text-danger">{e.meals[i]?.description?.message}</p> : null}
              </div>
              <Input aria-label="আনুমানিক ক্যালরি" type="number" placeholder="kcal" {...form.register(`meals.${i}.approxKcal`)} />
              <Button variant="ghost" icon={Trash2} aria-label="খাবার বাদ দিন" disabled={meals.fields.length <= 1} onClick={() => meals.remove(i)} />
            </Card>
          ))}
          {meals.fields.length < 6 ? (
            <Button variant="outline" size="sm" icon={Plus} onClick={() => meals.append({ mealType: "SNACKS", time: "11:00", description: "", approxKcal: "" })}>
              খাবার যোগ করুন
            </Button>
          ) : null}
        </div>
        <Field label="পরামর্শ (রোগী দেখবেন)" htmlFor="d-notes">
          <Textarea id="d-notes" rows={3} placeholder="যা বাদ দেবেন, ব্যায়াম, পরের ভিজিট…" {...form.register("notes")} />
        </Field>
      </fieldset>
    </Modal>
  );
}

/** Diet charts for my visits: write, give to the patient, correct, end. */
export default function DietPlansPage() {
  const [status, setStatus] = useState<DietPlanStatus | "">("");
  const [open, setOpen] = useState<{ plan: ProviderDietPlanResponse | null; visit: DietPlanCandidateResponse | null } | null>(null);
  const [picking, setPicking] = useState(false);
  const plans = useQuery({
    queryKey: ["provider", "diet-plans", status],
    queryFn: () => api.get<PaginatedResponse<ProviderDietPlanResponse>>("/provider/me/diet-plans", { status: status || undefined, limit: 50 }),
  });
  const candidates = useQuery({
    queryKey: ["provider", "diet-plans", "candidates"],
    enabled: picking,
    queryFn: () => api.get<DietPlanCandidateResponse[]>("/provider/me/diet-plans/candidates"),
  });
  const rows = plans.data?.data ?? [];
  const free = (candidates.data ?? []).filter((c) => !c.existingPlanId);

  return (
    <>
      <PageHeader
        title="ডায়েট চার্ট"
        subtitle="ভিজিটের পর রোগীর জন্য ৪ বেলার খাবার, ক্যালরি আর পানির লক্ষ্য লিখুন। রোগী অ্যাপে প্রতিদিন টিক দেন।"
        action={<Button icon={Plus} onClick={() => setPicking(true)}>নতুন চার্ট</Button>}
      />
      <Select aria-label="অবস্থা" value={status} onChange={(ev) => setStatus(ev.target.value as DietPlanStatus | "")} className="mb-4 w-auto">
        <option value="">সব</option>
        <option value="DRAFT">খসড়া</option>
        <option value="ACTIVE">চালু</option>
        <option value="ENDED">শেষ</option>
      </Select>
      {plans.isPending ? (
        <Skeleton className="h-40" />
      ) : plans.isError ? (
        <ErrorBox message={isApiError(plans.error) ? plans.error.userMessage : "লোড হয়নি"} onRetry={() => void plans.refetch()} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Apple} title="এখনো কোনো চার্ট নেই" message="একটি ভিজিট বেছে নতুন চার্ট লিখুন।" /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-mint/40" onClick={() => setOpen({ plan: p, visit: null })}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-sm text-muted">
                      {p.patientName ?? "রোগী"} ({p.patientCode}) · {p.appointmentCode} · {bn(p.calorieTargetKcal)} kcal · {bn(p.waterTargetMl / 1000)} লিটার
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(p.startDate)}
                      {p.endDate ? ` – ${formatDate(p.endDate)}` : " থেকে"} · শেষ বদল {formatInstant(p.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {picking ? (
        <Modal open onClose={() => setPicking(false)} title="কোন ভিজিটের জন্য?">
          {candidates.isPending ? (
            <Skeleton className="h-24" />
          ) : free.length === 0 ? (
            <p className="text-sm text-muted">গত ৬০ দিনের সব নিশ্চিত বা দেখা হয়ে যাওয়া ভিজিটের চার্ট লেখা হয়ে গেছে।</p>
          ) : (
            <ul className="divide-y divide-line">
              {free.map((c) => (
                <li key={c.appointmentId}>
                  <button
                    type="button"
                    className="w-full px-2 py-3 text-left hover:bg-mint/40"
                    onClick={() => (setPicking(false), setOpen({ plan: null, visit: c }))}
                  >
                    <p className="font-medium">{c.patientName ?? "রোগী"} <span className="text-muted">({c.patientCode})</span></p>
                    <p className="text-sm text-muted">{c.appointmentCode} · {formatInstant(c.scheduledAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
      {open ? <PlanEditor key={open.plan?.id ?? open.visit?.appointmentId} plan={open.plan} visit={open.visit} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
