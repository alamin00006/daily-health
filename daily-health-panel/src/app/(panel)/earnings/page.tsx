"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, CircleDollarSign, Clock3, Landmark, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useEarnings, useEarningsSummary, useMyPayouts, usePayoutAccount, useSavePayoutAccount } from "@/features/payment-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatDate, formatInstant, money } from "@/lib/format";

const accountForm = z
  .object({
    method: z.enum(["BKASH", "NAGAD", "BANK"]),
    accountName: z.string().trim().min(2, "নাম লিখুন"),
    accountNumber: z.string().trim().min(8, "নম্বর লিখুন"),
    bankName: z.string().trim(),
    branchName: z.string().trim(),
    routingNumber: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const digits = v.accountNumber.replace(/[\s-]/g, "");
    if (v.method !== "BANK" && !/^01[3-9]\d{8}$/.test(digits)) {
      ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "১১ সংখ্যার মোবাইল নম্বর (01XXXXXXXXX)" });
    }
    if (v.method === "BANK") {
      if (!/^\d{8,20}$/.test(digits)) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "শুধু সংখ্যা" });
      if (!v.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "ব্যাংকের নাম লিখুন" });
      if (!v.branchName) ctx.addIssue({ code: "custom", path: ["branchName"], message: "শাখার নাম লিখুন" });
      if (v.routingNumber && !/^\d{9}$/.test(v.routingNumber)) ctx.addIssue({ code: "custom", path: ["routingNumber"], message: "৯ সংখ্যা" });
    }
  });
type AccountValues = z.infer<typeof accountForm>;

const METHOD = { BKASH: "বিকাশ", NAGAD: "নগদ", BANK: "ব্যাংক" } as const;

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="flex size-11 items-center justify-center rounded-xl bg-mint text-primary">{icon}</div>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-xl font-bold">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}

function PayoutAccountCard() {
  const toast = useToast();
  const account = usePayoutAccount();
  const save = useSavePayoutAccount();
  const [editing, setEditing] = useState(false);
  const form = useForm<AccountValues>({
    resolver: zodResolver(accountForm),
    defaultValues: { method: "BKASH", accountName: "", accountNumber: "", bankName: "", branchName: "", routingNumber: "" },
  });
  const method = useWatch({ control: form.control, name: "method" });
  const errors = form.formState.errors;

  if (account.isPending) return <Skeleton className="h-40" />;
  const current = account.data;

  return (
    <Card>
      <CardHeader
        title="যেখানে টাকা পাবেন"
        subtitle="নম্বরটি এনক্রিপ্ট করে রাখা হয়; শুধু অ্যাডমিন পেআউটের সময় দেখেন"
        action={current && !editing ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>বদলান</Button> : null}
      />
      <div className="p-5">
        {current && !editing ? (
          <div className="flex items-center gap-3">
            {current.method === "BANK" ? <Landmark className="size-6 text-primary" /> : <Wallet className="size-6 text-primary" />}
            <div>
              <p className="font-semibold">{METHOD[current.method]} · {current.accountMasked}</p>
              <p className="text-sm text-muted">{current.accountName}{current.bankName ? ` · ${current.bankName}, ${current.branchName}` : ""}</p>
            </div>
          </div>
        ) : (
          <form
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={form.handleSubmit((v) =>
              save.mutate(
                {
                  method: v.method,
                  accountName: v.accountName,
                  accountNumber: v.accountNumber,
                  ...(v.method === "BANK" ? { bankName: v.bankName, branchName: v.branchName, routingNumber: v.routingNumber || undefined } : {}),
                },
                {
                  onSuccess: () => { toast("সেভ হয়েছে"); setEditing(false); },
                  onError: (e) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error"),
                },
              ),
            )}
          >
            <Field label="কীভাবে" htmlFor="method">
              <Select id="method" {...form.register("method")}>
                <option value="BKASH">বিকাশ (পার্সোনাল)</option>
                <option value="NAGAD">নগদ</option>
                <option value="BANK">ব্যাংক অ্যাকাউন্ট</option>
              </Select>
            </Field>
            <Field label="অ্যাকাউন্টের নাম" htmlFor="accountName" error={errors.accountName?.message}>
              <Input id="accountName" {...form.register("accountName")} aria-invalid={Boolean(errors.accountName)} />
            </Field>
            <Field label={method === "BANK" ? "অ্যাকাউন্ট নম্বর" : "মোবাইল নম্বর"} htmlFor="accountNumber" error={errors.accountNumber?.message}>
              <Input id="accountNumber" inputMode="numeric" {...form.register("accountNumber")} aria-invalid={Boolean(errors.accountNumber)} />
            </Field>
            {method === "BANK" ? (
              <>
                <Field label="ব্যাংক" htmlFor="bankName" error={errors.bankName?.message}>
                  <Input id="bankName" placeholder="ডাচ-বাংলা ব্যাংক" {...form.register("bankName")} />
                </Field>
                <Field label="শাখা" htmlFor="branchName" error={errors.branchName?.message}>
                  <Input id="branchName" {...form.register("branchName")} />
                </Field>
                <Field label="রাউটিং নম্বর (ঐচ্ছিক)" htmlFor="routingNumber" error={errors.routingNumber?.message}>
                  <Input id="routingNumber" inputMode="numeric" {...form.register("routingNumber")} />
                </Field>
              </>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={save.isPending}>সেভ করুন</Button>
              {current ? <Button variant="outline" onClick={() => setEditing(false)}>বাতিল</Button> : null}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

export default function EarningsPage() {
  const summary = useEarningsSummary();
  const earnings = useEarnings();
  const payouts = useMyPayouts();
  const rows = earnings.data?.pages.flatMap((p) => p.data) ?? [];
  const s = summary.data;

  return (
    <>
      <PageHeader title="আয় ও পেআউট" subtitle={s ? `প্রতিটি পেমেন্ট থেকে প্ল্যাটফর্ম ফি ${bn(s.platformFeePercent)}%; বাকিটা আপনার` : undefined} />
      {summary.isError ? <ErrorBox message="লোড হয়নি" onRetry={() => void summary.refetch()} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<CircleDollarSign className="size-5" />} label="পরের পেআউটে যাবে" value={s ? money(s.unsettled) : "—"} />
        <Stat icon={<Clock3 className="size-5" />} label="পেআউট প্রক্রিয়াধীন" value={s ? money(s.inPendingPayouts) : "—"} />
        <Stat icon={<Banknote className="size-5" />} label="এ পর্যন্ত পেয়েছেন" value={s ? money(s.paidOut) : "—"} />
        <Stat icon={<Wallet className="size-5" />} label="এই মাসের আয়" value={s ? money(s.thisMonth) : "—"} />
      </div>

      <div className="mt-6"><PayoutAccountCard /></div>

      <Card className="mt-6">
        <CardHeader title="পেআউট" subtitle="অ্যাডমিন মাস শেষে পাঠান; রেফারেন্স দিয়ে মিলিয়ে নিন" />
        {payouts.isPending ? (
          <Skeleton className="m-5 h-16" />
        ) : !payouts.data?.length ? (
          <EmptyState icon={Banknote} title="এখনো কোনো পেআউট হয়নি" />
        ) : (
          <ul className="divide-y divide-line">
            {payouts.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <p className="font-semibold">{p.payoutNo} · {money(p.amount)}</p>
                  <p className="text-sm text-muted">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)} · {METHOD[p.method]} {p.accountMasked}{p.reference ? ` · রেফ ${p.reference}` : ""}</p>
                </div>
                <Badge tone={p.status === "PAID" ? "success" : p.status === "PENDING" ? "warning" : "neutral"}>
                  {p.status === "PAID" ? "পাঠানো হয়েছে" : p.status === "PENDING" ? "প্রক্রিয়াধীন" : "বাতিল"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="প্রতিটি পেমেন্টের হিসাব" />
        {earnings.isPending ? (
          <Skeleton className="m-5 h-24" />
        ) : rows.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="এখনো আয় নেই" message="রোগী অ্যাপে পেমেন্ট করলে এখানে দেখাবে।" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="px-5 py-2 font-medium">তারিখ</th>
                  <th className="px-3 py-2 font-medium">বিবরণ</th>
                  <th className="px-3 py-2 text-right font-medium">পেমেন্ট</th>
                  <th className="px-3 py-2 text-right font-medium">ফি</th>
                  <th className="px-5 py-2 text-right font-medium">আপনার</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => (
                  <tr key={e.id} className={e.kind === "REFUND_ADJUSTMENT" ? "bg-danger-soft/40" : ""}>
                    <td className="whitespace-nowrap px-5 py-2.5">{formatInstant(e.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {e.kind === "REFUND_ADJUSTMENT" ? <Badge tone="danger" className="mr-2">ফেরত</Badge> : null}
                      {e.description}
                      <span className="block text-xs text-muted">{e.invoiceNo}{e.payoutNo ? ` · ${e.payoutNo}` : ""}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{money(e.gross)}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{money(e.platformFee)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold">{money(e.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {earnings.hasNextPage ? (
              <div className="p-4 text-center">
                <Button variant="ghost" loading={earnings.isFetchingNextPage} onClick={() => void earnings.fetchNextPage()}>আরও দেখুন</Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}
