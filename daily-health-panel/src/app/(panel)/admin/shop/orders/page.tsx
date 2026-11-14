"use client";

import { Ban, Check, ClipboardList, FileCheck2, PackageCheck, RotateCcw, Search, Truck, X } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_METHOD_LABEL, PRESCRIPTION_CHECK_LABEL } from "@/features/labels";
import { useMe } from "@/features/panel-queries";
import { useOrderActions, useStaffOrder, useStaffOrders } from "@/features/shop-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant, money } from "@/lib/format";
import { orderStatusSchema, type OrderStatus, type StaffOrderResponse } from "@/shared-contracts/shop.contract";

type Ask = { kind: "cancel" | "reject" | "return"; title: string } | null;

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const me = useMe();
  const isAdmin = me.data?.role === "ADMIN";
  const order = useStaffOrder(id);
  const actions = useOrderActions();
  const [ask, setAsk] = useState<Ask>(null);
  const [text, setText] = useState("");
  const [restock, setRestock] = useState(true);
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");
  const o: StaffOrderResponse | undefined = order.data;
  const busy = actions.step.isPending || actions.review.isPending || actions.cancel.isPending || actions.markReturned.isPending;

  const step = (s: "confirm" | "dispatch" | "deliver", message: string) =>
    actions.step.mutate({ id, step: s }, { onSuccess: () => toast(message), onError: fail });

  const submitAsk = () => {
    if (!ask) return;
    const done = () => (setAsk(null), setText(""));
    if (ask.kind === "cancel") {
      actions.cancel.mutate({ id, reason: text.trim() }, { onSuccess: () => (toast("অর্ডার বাতিল, স্টক ফেরত"), done()), onError: fail });
    } else if (ask.kind === "reject") {
      actions.review.mutate(
        { id, body: { approve: false, note: text.trim() } },
        { onSuccess: () => (toast("প্রেসক্রিপশন বাতিল, অর্ডারও বাতিল"), done()), onError: fail },
      );
    } else {
      actions.markReturned.mutate(
        { id, body: { reason: text.trim(), restock } },
        { onSuccess: () => (toast("ফেরত হিসেবে রাখা হয়েছে"), done()), onError: fail },
      );
    }
  };

  return (
    <Modal open wide onClose={onClose} title={o ? `অর্ডার ${o.code}` : "অর্ডার"}>
      {order.isPending ? (
        <Skeleton className="h-60" />
      ) : order.isError ? (
        <ErrorBox message={isApiError(order.error) ? order.error.userMessage : "লোড হয়নি"} onRetry={() => void order.refetch()} />
      ) : o ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            <Badge tone={o.isPaid ? "success" : "neutral"}>
              {PAYMENT_METHOD_LABEL[o.paymentMethod]}
              {o.paymentMethod === "ONLINE" ? (o.isPaid ? " · পরিশোধিত" : " · বাকি") : ""}
            </Badge>
            {o.prescriptionCheck !== "NOT_NEEDED" ? (
              <Badge tone={o.prescriptionCheck === "APPROVED" ? "success" : o.prescriptionCheck === "REJECTED" ? "danger" : "warning"}>
                {PRESCRIPTION_CHECK_LABEL[o.prescriptionCheck]}
              </Badge>
            ) : null}
            <span className="text-sm text-muted">{formatInstant(o.createdAt)}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4 text-sm">
              <p className="mb-1 font-semibold">কার জন্য</p>
              <p>{o.patientName ?? "—"} {o.patientCode ? <span className="text-muted">({o.patientCode})</span> : null}</p>
              <p className="text-muted">অর্ডার করেছেন: {o.buyerName ?? "—"}</p>
            </Card>
            <Card className="p-4 text-sm">
              <p className="mb-1 font-semibold">ডেলিভারি</p>
              <p>{o.address.recipientName} · <a className="text-primary underline" href={`tel:${o.address.phone}`}>{o.address.phone}</a></p>
              <p>{o.address.addressLine}, {o.address.area}</p>
              <p className="text-muted">{o.address.zoneName}</p>
              {o.note ? <p className="mt-1">নোট: {o.note}</p> : null}
            </Card>
          </div>

          <Card>
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-2">পণ্য</th>
                  <th className="px-4 py-2 text-right">দাম</th>
                  <th className="px-4 py-2 text-right">পরিমাণ</th>
                  <th className="px-4 py-2 text-right">মোট</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {o.items.map((i) => (
                  <tr key={i.productId}>
                    <td className="px-4 py-2">
                      {i.name}
                      {i.packSize ? <span className="text-muted"> · {i.packSize}</span> : null}
                      {i.requiresPrescription ? <Badge tone="warning" className="ml-2">Rx</Badge> : null}
                    </td>
                    <td className="px-4 py-2 text-right">{money(i.unitPrice)}</td>
                    <td className="px-4 py-2 text-right">{bn(i.qty)}</td>
                    <td className="px-4 py-2 text-right">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-right">
                <tr><td colSpan={3} className="px-4 pt-2 text-muted">সাবটোটাল</td><td className="px-4 pt-2">{money(o.subtotal)}</td></tr>
                <tr><td colSpan={3} className="px-4 text-muted">ডেলিভারি</td><td className="px-4">{money(o.deliveryCharge)}</td></tr>
                <tr className="font-semibold"><td colSpan={3} className="px-4 pb-3">মোট</td><td className="px-4 pb-3">{money(o.total)}</td></tr>
              </tfoot>
            </table>
          </Card>

          {o.prescriptionCheck !== "NOT_NEEDED" ? (
            <Card className="space-y-3 p-4 text-sm">
              <p className="font-semibold">প্রেসক্রিপশন</p>
              {o.prescription.code ? <p>অ্যাপে ইস্যু হওয়া প্রেসক্রিপশন: <strong>{o.prescription.code}</strong></p> : null}
              {o.prescription.photoUrl ? (
                <a href={o.prescription.photoUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private link, expires */}
                  <img src={o.prescription.photoUrl} alt="প্রেসক্রিপশনের ছবি" className="max-h-80 rounded-lg border border-line" />
                </a>
              ) : null}
              {!o.prescription.code && !o.prescription.photoUrl ? <p className="text-muted">ক্রেতা এখনো প্রেসক্রিপশন দেননি।</p> : null}
              {o.prescription.reviewNote ? <p>নোট: {o.prescription.reviewNote}</p> : null}
              {o.prescriptionCheck === "PENDING_REVIEW" && (o.status === "PLACED" || o.status === "PENDING_PAYMENT") ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    icon={FileCheck2}
                    loading={actions.review.isPending}
                    onClick={() =>
                      actions.review.mutate({ id, body: { approve: true } }, { onSuccess: () => toast("প্রেসক্রিপশন অনুমোদিত"), onError: fail })
                    }
                  >
                    অনুমোদন দিন
                  </Button>
                  <Button size="sm" variant="outline" icon={X} onClick={() => setAsk({ kind: "reject", title: "প্রেসক্রিপশন কেন বাতিল?" })}>
                    বাতিল করুন
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-semibold">টাইমলাইন</p>
            <ol className="space-y-1 text-sm">
              {o.timeline.map((t, i) => (
                <li key={i}>
                  <span className="text-muted">{formatInstant(t.at)}</span> · {ORDER_STATUS_LABEL[t.status]}
                  {t.note ? <span className="text-muted"> — {t.note}</span> : null}
                </li>
              ))}
            </ol>
            {o.cancelReason ? <p className="mt-2 text-sm text-danger">কারণ: {o.cancelReason}</p> : null}
          </div>

          {ask ? (
            <Card className="space-y-3 p-4">
              <Field label={ask.title} htmlFor="ask-text">
                <Textarea id="ask-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
              {ask.kind === "return" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                  পণ্য ভালো আছে, স্টকে ফেরত নিন
                </label>
              ) : null}
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={text.trim().length < 2} loading={busy} onClick={submitAsk}>
                  নিশ্চিত করুন
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAsk(null)}>
                  থাক
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {o.status === "PLACED" && (o.prescriptionCheck === "NOT_NEEDED" || o.prescriptionCheck === "APPROVED") ? (
                <Button icon={Check} loading={busy} onClick={() => step("confirm", "অর্ডার নিশ্চিত")}>নিশ্চিত করুন</Button>
              ) : null}
              {o.status === "CONFIRMED" ? (
                <Button icon={Truck} loading={busy} onClick={() => step("dispatch", "ডেলিভারিতে পাঠানো হয়েছে")}>ডেলিভারিতে পাঠান</Button>
              ) : null}
              {o.status === "DISPATCHED" ? (
                <Button icon={PackageCheck} loading={busy} onClick={() => step("deliver", "ডেলিভারি সম্পন্ন")}>ডেলিভারি হয়েছে</Button>
              ) : null}
              {o.canCancel ? (
                <Button variant="outline" icon={Ban} onClick={() => setAsk({ kind: "cancel", title: "বাতিলের কারণ (ক্রেতা দেখবেন)" })}>
                  বাতিল করুন
                </Button>
              ) : null}
              {o.status === "DELIVERED" && isAdmin ? (
                <Button variant="outline" icon={RotateCcw} onClick={() => setAsk({ kind: "return", title: "ফেরতের কারণ" })}>
                  ফেরত নিন
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

/** Orders for staff: check prescriptions, confirm, send out, mark delivered, cancel. */
function ShopOrders() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [rxOnly, setRxOnly] = useState(Boolean(useSearchParams().get("prescription")));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const orders = useStaffOrders({ status: status || undefined, prescription: rxOnly ? "PENDING_REVIEW" : undefined, q: search || undefined });
  const rows = orders.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader title="হেলথস্টোর অর্ডার" subtitle="নতুন অর্ডার নিশ্চিত করুন, প্রেসক্রিপশন দেখুন, ডেলিভারি আপডেট দিন।" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="অবস্থা" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | "")} className="w-auto">
          <option value="">সব অবস্থা</option>
          {orderStatusSchema.options.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rxOnly} onChange={(e) => setRxOnly(e.target.checked)} />
          শুধু যেগুলোর প্রেসক্রিপশন দেখতে হবে
        </label>
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), setSearch(q.trim()))}>
          <Input aria-label="অর্ডার নম্বর" placeholder="OD-2611-0042" value={q} onChange={(e) => setQ(e.target.value)} className="w-44" />
          <Button type="submit" variant="outline" icon={Search}>খুঁজুন</Button>
        </form>
      </div>
      {orders.isPending ? (
        <Skeleton className="h-40" />
      ) : orders.isError ? (
        <ErrorBox message={isApiError(orders.error) ? orders.error.userMessage : "লোড হয়নি"} onRetry={() => void orders.refetch()} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="কোনো অর্ডার নেই" message="এই ফিল্টারে কিছু পাওয়া যায়নি।" /></Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">অর্ডার</th>
                <th className="px-4 py-3">ক্রেতা ও এলাকা</th>
                <th className="px-4 py-3">পণ্য</th>
                <th className="px-4 py-3 text-right">মোট</th>
                <th className="px-4 py-3">অবস্থা</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-mint/40" onClick={() => setOpen(r.id)}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.code}</p>
                    <p className="text-xs text-muted">{formatInstant(r.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{r.recipientName}</p>
                    <p className="text-xs text-muted">{r.zoneName}</p>
                  </td>
                  <td className="px-4 py-3">
                    {r.firstItemName}
                    {r.itemCount > 1 ? <span className="text-muted"> + আরও</span> : null}
                    <span className="text-muted"> ({bn(r.itemCount)}টি)</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {money(r.total)}
                    <p className="text-xs text-muted">{r.paymentMethod === "ONLINE" ? (r.isPaid ? "পরিশোধিত" : "বাকি") : "ক্যাশ"}</p>
                  </td>
                  <td className="space-y-1 px-4 py-3">
                    <Badge tone={ORDER_STATUS_TONE[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Badge>
                    {r.prescriptionCheck === "PENDING_REVIEW" || r.prescriptionCheck === "AWAITING_PRESCRIPTION" ? (
                      <Badge tone="warning" className="block w-fit">{PRESCRIPTION_CHECK_LABEL[r.prescriptionCheck]}</Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {orders.hasNextPage ? (
        <Button className="mt-3" variant="outline" loading={orders.isFetchingNextPage} onClick={() => void orders.fetchNextPage()}>
          আরও দেখুন
        </Button>
      ) : null}
      {open ? <OrderDetail id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export default function ShopOrdersPage() {
  return (
    <Suspense>
      <ShopOrders />
    </Suspense>
  );
}
