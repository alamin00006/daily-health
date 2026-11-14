"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { History, Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, PageHeader, Skeleton, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useQuickConsultHistory, useQuickConsultSettings, useUpdateQuickConsultSetting } from "@/features/consultation-queries";
import { QUICK_KIND_LABEL } from "@/features/labels";
import { isApiError } from "@/lib/api-client";
import { formatInstant, money } from "@/lib/format";
import type { QuickConsultSettingResponse } from "@/shared-contracts/consultation.contract";

const settingForm = z.object({
  price: z.coerce.number({ error: "দাম লিখুন" }).min(1, "কমপক্ষে ৳১").max(5000, "সর্বোচ্চ ৳৫,০০০").multipleOf(0.01, "পয়সা দুই ঘর পর্যন্ত"),
  isEnabled: z.boolean(),
  maxWaitMin: z.coerce.number().int("পূর্ণ সংখ্যা দিন").min(2, "কমপক্ষে ২ মিনিট").max(60, "সর্বোচ্চ ৬০ মিনিট"),
  sessionMin: z.coerce.number().int("পূর্ণ সংখ্যা দিন").min(5, "কমপক্ষে ৫ মিনিট").max(120, "সর্বোচ্চ ১২০ মিনিট"),
});
type SettingInput = z.input<typeof settingForm>;
type SettingValues = z.output<typeof settingForm>;

const KIND_HINT = {
  GENERAL: "যেকোনো অনলাইন ডাক্তার নিতে পারেন।",
  WOMENS_HEALTH: "শুধু নারী ডাক্তাররা নেন। অ্যাপের নারীস্বাস্থ্য অংশ থেকে আসে।",
} as const;

function SettingCard({ setting }: { setting: QuickConsultSettingResponse }) {
  const toast = useToast();
  const update = useUpdateQuickConsultSetting();
  const form = useForm<SettingInput, unknown, SettingValues>({
    resolver: zodResolver(settingForm),
    defaultValues: {
      price: setting.price,
      isEnabled: setting.isEnabled,
      maxWaitMin: setting.maxWaitMin,
      sessionMin: setting.sessionMin,
    },
  });
  const errors = form.formState.errors;
  const id = (name: string) => `${setting.kind}-${name}`;

  return (
    <Card>
      <CardHeader
        title={QUICK_KIND_LABEL[setting.kind]}
        subtitle={KIND_HINT[setting.kind]}
        action={<Badge tone={setting.isEnabled ? "success" : "neutral"}>{setting.isEnabled ? `চালু · ${money(setting.price)}` : "বন্ধ"}</Badge>}
      />
      <form
        noValidate
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={form.handleSubmit((values) =>
          update.mutate(
            { kind: setting.kind, body: values },
            {
              onSuccess: (saved) => {
                form.reset({ price: saved.price, isEnabled: saved.isEnabled, maxWaitMin: saved.maxWaitMin, sessionMin: saved.sessionMin });
                toast(`সেভ হয়েছে; নতুন পরামর্শে ${money(saved.price)} লাগবে`);
              },
              onError: (e) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error"),
            },
          ),
        )}
      >
        <Field label="দাম (৳)" htmlFor={id("price")} error={errors.price?.message} hint="আগে শুরু হওয়া পরামর্শের দাম বদলায় না">
          <Input id={id("price")} type="number" inputMode="decimal" step="0.01" min={1} {...form.register("price")} aria-invalid={Boolean(errors.price)} />
        </Field>
        <Field label="চালু আছে" htmlFor={id("enabled")} hint="বন্ধ করলে অ্যাপে এই পরামর্শ শুরু করা যাবে না">
          <Controller
            control={form.control}
            name="isEnabled"
            render={({ field }) => (
              <div className="flex min-h-11 items-center">
                <Switch label="চালু" checked={field.value} onChange={field.onChange} />
              </div>
            )}
          />
        </Field>
        <Field label="ডাক্তারের জন্য সর্বোচ্চ অপেক্ষা (মিনিট)" htmlFor={id("wait")} error={errors.maxWaitMin?.message} hint="এর মধ্যে কেউ না নিলে পুরো টাকা ফেরত যায়">
          <Input id={id("wait")} type="number" inputMode="numeric" {...form.register("maxWaitMin")} aria-invalid={Boolean(errors.maxWaitMin)} />
        </Field>
        <Field label="চ্যাটের সময় (মিনিট)" htmlFor={id("session")} error={errors.sessionMin?.message} hint="ডাক্তার নেওয়ার পর এতক্ষণ চ্যাট খোলা থাকে">
          <Input id={id("session")} type="number" inputMode="numeric" {...form.register("sessionMin")} aria-invalid={Boolean(errors.sessionMin)} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <p className="text-xs text-muted">
            শেষ বদল: {formatInstant(setting.updatedAt)}
            {setting.updatedByName ? ` · ${setting.updatedByName}` : ""}
          </p>
          <Button type="submit" icon={Save} loading={update.isPending} disabled={!form.formState.isDirty}>
            সেভ করুন
          </Button>
        </div>
      </form>
    </Card>
  );
}

function HistoryCard() {
  const history = useQuickConsultHistory();
  return (
    <Card className="mt-6">
      <CardHeader title="বদলের ইতিহাস" subtitle="কে কখন কী বদলেছেন" />
      {history.isPending ? (
        <Skeleton className="m-5 h-16" />
      ) : history.isError ? (
        <div className="p-5">
          <ErrorBox message={isApiError(history.error) ? history.error.userMessage : "লোড হয়নি"} onRetry={() => void history.refetch()} />
        </div>
      ) : !history.data.data.length ? (
        <EmptyState icon={History} title="এখনো কিছু বদলানো হয়নি" message="শুরুর দাম ৳১০।" />
      ) : (
        <ul className="divide-y divide-line">
          {history.data.data.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="font-semibold">{QUICK_KIND_LABEL[h.kind]}</span>
              <span>
                {h.oldPrice !== h.newPrice ? `${money(h.oldPrice)} → ${money(h.newPrice)}` : money(h.newPrice)}
              </span>
              {h.oldEnabled !== h.newEnabled ? <Badge tone={h.newEnabled ? "success" : "neutral"}>{h.newEnabled ? "চালু করা হয়েছে" : "বন্ধ করা হয়েছে"}</Badge> : null}
              <span className="ml-auto text-muted">
                {h.changedByName ?? "অ্যাডমিন"} · {formatInstant(h.changedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function QuickConsultSettingsPage() {
  const settings = useQuickConsultSettings();
  return (
    <>
      <PageHeader
        title="দ্রুত পরামর্শের দাম"
        subtitle="চ্যাটে দ্রুত পরামর্শের দাম আর নিয়ম। বদল সাথে সাথে অ্যাপে দেখা যায়; প্ল্যাটফর্ম ফি বাদে বাকিটা ডাক্তার পান।"
      />
      {settings.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : settings.isError ? (
        <ErrorBox message={isApiError(settings.error) ? settings.error.userMessage : "লোড হয়নি"} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {settings.data.map((s) => (
            <SettingCard key={s.kind} setting={s} />
          ))}
        </div>
      )}
      <HistoryCard />
    </>
  );
}
