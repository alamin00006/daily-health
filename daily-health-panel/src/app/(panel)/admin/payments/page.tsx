"use client";

import { Banknote, Copy, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usePayoutActions, usePayouts, usePayoutsDue, useRefundActions, useRefunds } from "@/features/payment-queries";
import { isApiError } from "@/lib/api-client";
import { addDays, dhakaDate, formatDate, formatInstant, money } from "@/lib/format";
import type { AdminRefundResponse, PayoutResponse, RefundStatus } from "@/shared-contracts/payments.contract";

const METHOD = { BKASH: "বিকাশ", NAGAD: "নগদ", BANK: "ব্যাংক" } as const;
const GATEWAY = { SHURJOPAY: "shurjoPay", SSLCOMMERZ: "SSLCommerz" } as const;

function RefundsCard() {
  const toast = useToast();
  const [status, setStatus] = useState<RefundStatus>("REQUESTED");
  const refunds = useRefunds(status);
  const actions = useRefundActions();
  const [marking, setMarking] = useState<AdminRefundResponse | null>(null);
  const [refId, setRefId] = useState("");
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

  return (
    <Card>
      <CardHeader
        title="টাকা ফেরত"
        subtitle="SSLCommerz-এ নিজে থেকে হয়; shurjoPay-এ মার্চেন্ট প্যানেল থেকে ফেরত দিয়ে এখানে রেফারেন্স লিখুন"
        action={
          <div className="inline-flex rounded-xl bg-mint p-1 text-sm">
            {(["REQUESTED", "FAILED", "PROCESSED"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-lg px-3 py-1.5 ${status === s ? "bg-white font-semibold text-primary" : "text-muted"}`}>
                {s === "REQUESTED" ? "অপেক্ষায়" : s === "FAILED" ? "ব্যর্থ" : "সম্পন্ন"}
              </button>
            ))}
          </div>
        }
      />
      {refunds.isPending ? (
        <Skeleton className="m-5 h-20" />
      ) : !refunds.data?.data.length ? (
        <EmptyState icon={Undo2} title="কিছু নেই" />
      ) : (
        <ul className="divide-y divide-line">
          {refunds.data.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{money(r.amount)} · {r.invoiceNo}</p>
                <p className="truncate text-sm text-muted">{r.description}</p>
                <p className="text-xs text-muted">
                  {GATEWAY[r.gateway]}{r.gatewayTrxId ? ` · ট্রানজেকশন ${r.gatewayTrxId}` : ""} · {r.reason} · {formatInstant(r.createdAt)}
                  {r.failureReason && r.status === "FAILED" ? ` · ${r.failureReason}` : ""}
                </p>
              </div>
              {r.status === "REQUESTED" && !r.automatic ? <Badge tone="warning">হাতে ফেরত দিতে হবে</Badge> : null}
              {r.status === "REQUESTED" && r.automatic ? <Badge tone="info">গেটওয়েতে চলছে</Badge> : null}
              {r.status !== "PROCESSED" ? (
                <Button size="sm" variant="outline" onClick={() => { setMarking(r); setRefId(""); }}>ফেরত দেওয়া হয়েছে</Button>
              ) : <Badge tone="success">{r.gatewayRefundId}</Badge>}
              {r.status === "FAILED" ? (
                <Button size="sm" variant="ghost" icon={RotateCcw} loading={actions.retry.isPending} onClick={() => actions.retry.mutate(r.id, { onError: fail })}>আবার চেষ্টা</Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={Boolean(marking)}
        onClose={() => setMarking(null)}
        title="টাকা ফেরত দেওয়া হয়েছে"
        footer={
          <>
            <Button variant="outline" onClick={() => setMarking(null)}>বাতিল</Button>
            <Button
              disabled={refId.trim().length < 2}
              loading={actions.markProcessed.isPending}
              onClick={() =>
                marking &&
                actions.markProcessed.mutate(
                  { id: marking.id, gatewayRefundId: refId.trim() },
                  { onSuccess: () => { toast("রোগীকে জানানো হয়েছে; ডাক্তারের আয় থেকে কাটা হবে"); setMarking(null); }, onError: fail },
                )
              }
            >
              নিশ্চিত করুন
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {marking ? `${GATEWAY[marking.gateway]} মার্চেন্ট প্যানেলে ${marking.invoiceNo} (${money(marking.amount)}) ফেরত দিয়ে সেখানকার রেফারেন্স লিখুন।` : ""}
        </p>
        <Field label="গেটওয়ের রিফান্ড রেফারেন্স" htmlFor="ref">
          <Input id="ref" value={refId} onChange={(e) => setRefId(e.target.value)} />
        </Field>
      </Modal>
    </Card>
  );
}

function PayoutsCard() {
  const toast = useToast();
  const [until, setUntil] = useState(addDays(dhakaDate(), -1));
  const due = usePayoutsDue(until);
  const pending = usePayouts("PENDING");
  const paid = usePayouts("PAID");
  const actions = usePayoutActions();
  const [paying, setPaying] = useState<PayoutResponse | null>(null);
  const [reference, setReference] = useState("");
  const [fullNumber, setFullNumber] = useState<string | null>(null);
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

  function openPay(p: PayoutResponse) {
    setPaying(p);
    setReference("");
    setFullNumber(null);
    actions.account.mutate(p.id, { onSuccess: (a) => setFullNumber(a.accountNumber), onError: fail });
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="ডাক্তারদের পেআউট"
        subtitle="যে দিন পর্যন্ত আয় হিসাব হবে সেটি বেছে পেআউট তৈরি করুন, টাকা পাঠিয়ে রেফারেন্স দিন"
        action={
          <label className="flex items-center gap-2 text-sm">
            পর্যন্ত
            <Input type="date" className="min-h-9 w-auto" max={dhakaDate()} value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        }
      />
      <div className="p-5">
        <p className="mb-2 text-sm font-semibold">পাওনা</p>
        {due.isPending ? (
          <Skeleton className="h-16" />
        ) : !due.data?.length ? (
          <p className="text-sm text-muted">{formatDate(until)} পর্যন্ত কারো পাওনা নেই।</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {due.data.map((d) => (
              <li key={d.providerId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="font-semibold">{d.providerName} <span className="font-normal text-muted">· {d.providerCode}</span></p>
                  <p className="text-sm text-muted">
                    {d.earningsCount}টি পেমেন্ট · {d.account ? `${METHOD[d.account.method]} ${d.account.accountMasked}` : "পেআউট অ্যাকাউন্ট দেননি"}
                  </p>
                </div>
                <p className="text-lg font-bold">{money(d.amount)}</p>
                <Button
                  size="sm"
                  icon={Banknote}
                  disabled={!d.account}
                  loading={actions.create.isPending && actions.create.variables?.providerId === d.providerId}
                  onClick={() => actions.create.mutate({ providerId: d.providerId, until }, { onSuccess: () => toast("পেআউট তৈরি হয়েছে"), onError: fail })}
                >
                  পেআউট তৈরি
                </Button>
              </li>
            ))}
          </ul>
        )}

        <p className="mb-2 mt-6 text-sm font-semibold">পাঠানো বাকি</p>
        {!pending.data?.data.length ? (
          <p className="text-sm text-muted">কিছু নেই।</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {pending.data.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="font-semibold">{p.payoutNo} · {p.providerName}</p>
                  <p className="text-sm text-muted">{METHOD[p.method]} {p.accountMasked} · {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</p>
                </div>
                <p className="text-lg font-bold">{money(p.amount)}</p>
                <Button size="sm" onClick={() => openPay(p)}>পাঠিয়েছি</Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => actions.cancel.mutate(p.id, { onSuccess: () => toast("বাতিল; আয় আবার পাওনায় ফিরেছে"), onError: fail })}>বাতিল</Button>
              </li>
            ))}
          </ul>
        )}

        <p className="mb-2 mt-6 text-sm font-semibold">সম্প্রতি পাঠানো</p>
        {!paid.data?.data.length ? (
          <p className="text-sm text-muted">কিছু নেই।</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {paid.data.data.slice(0, 10).map((p) => (
              <li key={p.id} className="flex flex-wrap gap-3 px-4 py-2.5">
                <span className="flex-1">{p.payoutNo} · {p.providerName}</span>
                <span>{money(p.amount)}</span>
                <span className="text-muted">রেফ {p.reference}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="টাকা পাঠানো হয়েছে"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>বাতিল</Button>
            <Button
              disabled={reference.trim().length < 3}
              loading={actions.markPaid.isPending}
              onClick={() =>
                paying &&
                actions.markPaid.mutate(
                  { id: paying.id, reference: reference.trim() },
                  { onSuccess: () => { toast("পেআউট সম্পন্ন; ডাক্তারকে জানানো হয়েছে"); setPaying(null); }, onError: fail },
                )
              }
            >
              নিশ্চিত করুন
            </Button>
          </>
        }
      >
        {paying ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-mint p-4">
              <p className="text-sm text-muted">{paying.providerName} · {METHOD[paying.method]}</p>
              <p className="flex items-center gap-2 font-mono text-xl font-bold">
                {fullNumber ?? "…"}
                {fullNumber ? (
                  <button type="button" aria-label="কপি" className="text-primary" onClick={() => { void navigator.clipboard.writeText(fullNumber); toast("কপি হয়েছে"); }}>
                    <Copy className="size-4" />
                  </button>
                ) : null}
              </p>
              <p className="text-2xl font-bold text-primary">{money(paying.amount)}</p>
            </div>
            <Field label="ট্রানজেকশন আইডি / ব্যাংক রেফারেন্স" htmlFor="reference">
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

export default function AdminPaymentsPage() {
  return (
    <>
      <PageHeader title="পেমেন্ট, রিফান্ড ও পেআউট" />
      <RefundsCard />
      <PayoutsCard />
    </>
  );
}
