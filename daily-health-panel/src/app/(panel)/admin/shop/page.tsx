"use client";

import { AlertTriangle, Boxes, ClipboardList, FileCheck2, PackageX, Settings2, Store } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, PageHeader, Skeleton, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useShopCounts, useShopSettings, useShopSettingsHistory, useUpdateShopSettings } from "@/features/shop-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant, money } from "@/lib/format";
import type { ShopSettingsResponse, UpdateShopSettingsRequest } from "@/shared-contracts/shop.contract";

const FIELD_LABEL: Record<string, string> = {
  enabled: "হেলথস্টোর",
  cashOnDeliveryEnabled: "ক্যাশ অন ডেলিভারি",
  minOrderAmount: "সর্বনিম্ন অর্ডার",
  freeDeliveryFrom: "ফ্রি ডেলিভারি",
  paymentHoldMinutes: "পেমেন্টের সময়",
};

function show(field: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "চালু" : "বন্ধ";
  if (value === null) return "নেই";
  if (field === "paymentHoldMinutes") return `${bn(Number(value))} মিনিট`;
  return money(Number(value));
}

function RulesForm({ settings }: { settings: ShopSettingsResponse }) {
  const toast = useToast();
  const update = useUpdateShopSettings();
  const [minOrder, setMinOrder] = useState(String(settings.minOrderAmount));
  const [freeFrom, setFreeFrom] = useState(settings.freeDeliveryFrom === null ? "" : String(settings.freeDeliveryFrom));
  const [hold, setHold] = useState(String(settings.paymentHoldMinutes));
  const save = (body: UpdateShopSettingsRequest, message = "সেভ হয়েছে") =>
    update.mutate(body, {
      onSuccess: () => toast(message),
      onError: (e) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error"),
    });

  return (
    <Card>
      <CardHeader title="নিয়ম" subtitle="নতুন অর্ডারে প্রযোজ্য; আগের অর্ডার বদলায় না।" />
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="সর্বনিম্ন অর্ডার (৳)" htmlFor="min-order" hint="০ = কোনো সীমা নেই">
          <Input id="min-order" type="number" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        </Field>
        <Field label="এত টাকার বেশি হলে ফ্রি ডেলিভারি (৳)" htmlFor="free-from" hint="খালি = কখনো ফ্রি নয়">
          <Input id="free-from" type="number" min={0} value={freeFrom} onChange={(e) => setFreeFrom(e.target.value)} />
        </Field>
        <Field label="অনলাইন পেমেন্টের সময় (মিনিট)" htmlFor="hold" hint="এর মধ্যে না দিলে অর্ডার বাতিল, স্টক ফেরত (৫–৬০)">
          <Input id="hold" type="number" min={5} max={60} value={hold} onChange={(e) => setHold(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <Switch
            label="ক্যাশ অন ডেলিভারি"
            checked={settings.cashOnDeliveryEnabled}
            disabled={update.isPending}
            onChange={(v) => save({ cashOnDeliveryEnabled: v }, v ? "ক্যাশ অন ডেলিভারি চালু" : "ক্যাশ অন ডেলিভারি বন্ধ")}
          />
          <span className="text-sm">ক্যাশ অন ডেলিভারি</span>
        </div>
        <Button
          loading={update.isPending}
          onClick={() =>
            save({
              minOrderAmount: Number(minOrder || 0),
              freeDeliveryFrom: freeFrom.trim() === "" ? null : Number(freeFrom),
              paymentHoldMinutes: Number(hold || 15),
            })
          }
        >
          নিয়ম সেভ করুন
        </Button>
      </div>
    </Card>
  );
}

/** ADMIN: switch the whole HealthStore on or off, set its rules, see what needs attention. */
export default function ShopSettingsPage() {
  const toast = useToast();
  const settings = useShopSettings();
  const counts = useShopCounts();
  const history = useShopSettingsHistory(true);
  const update = useUpdateShopSettings();
  const s = settings.data;

  return (
    <>
      <PageHeader
        title="হেলথস্টোর"
        subtitle="ওষুধ ও স্বাস্থ্যপণ্যের দোকান: নিজেদের স্টক, নিজেদের ডেলিভারি।"
      />
      {settings.isPending ? (
        <Skeleton className="h-40" />
      ) : settings.isError ? (
        <ErrorBox message={isApiError(settings.error) ? settings.error.userMessage : "লোড হয়নি"} onRetry={() => void settings.refetch()} />
      ) : s ? (
        <div className="space-y-5">
          <Card className={s.enabled ? "border-primary/40" : "border-warning/40"}>
            <div className="flex flex-wrap items-center gap-4 p-5">
              <Store className={s.enabled ? "size-10 text-primary" : "size-10 text-muted"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">হেলথস্টোর {s.enabled ? "চালু" : "বন্ধ"}</p>
                  <Badge tone={s.enabled ? "success" : "warning"}>{s.enabled ? "অ্যাপে দেখা যাচ্ছে" : "অ্যাপে লুকানো"}</Badge>
                </div>
                <p className="text-sm text-muted">
                  বন্ধ থাকলে অ্যাপে দোকানের কিছুই দেখা যায় না, কেউ অর্ডার করতে পারেন না। আগের অর্ডার ক্রেতারা দেখতে ও বাতিল
                  করতে পারেন, আর এই প্যানেল সবসময় চলে, তাই বন্ধ রেখেও পণ্য ও স্টক সাজিয়ে রাখা যায়।
                </p>
                <p className="mt-1 text-xs text-muted">
                  শেষ বদল {formatInstant(s.updatedAt)}
                  {s.updatedByName ? ` · ${s.updatedByName}` : ""}
                </p>
              </div>
              <Button
                variant={s.enabled ? "outline" : "primary"}
                loading={update.isPending}
                onClick={() => {
                  const next = !s.enabled;
                  if (!next && !window.confirm("হেলথস্টোর বন্ধ করবেন? অ্যাপ থেকে দোকান সাথে সাথে লুকিয়ে যাবে।")) return;
                  update.mutate(
                    { enabled: next },
                    {
                      onSuccess: () => toast(next ? "হেলথস্টোর চালু হয়েছে (অ্যাপে ১০ সেকেন্ডের মধ্যে)" : "হেলথস্টোর বন্ধ হয়েছে"),
                      onError: (e) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error"),
                    },
                  );
                }}
              >
                {s.enabled ? "বন্ধ করুন" : "চালু করুন"}
              </Button>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "যে অর্ডার দেখতে হবে", value: counts.data?.ordersToHandle, icon: ClipboardList, href: "/admin/shop/orders" },
              { label: "প্রেসক্রিপশন দেখতে হবে", value: counts.data?.prescriptionsToReview, icon: FileCheck2, href: "/admin/shop/orders?prescription=1" },
              { label: "স্টক কম", value: counts.data?.lowStockProducts, icon: AlertTriangle, href: "/admin/shop/products?stock=LOW" },
              { label: "স্টক শেষ", value: counts.data?.outOfStockProducts, icon: PackageX, href: "/admin/shop/products?stock=OUT" },
            ].map((c) => (
              <Link key={c.label} href={c.href}>
                <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-mint/40">
                  <c.icon className="size-6 text-primary" />
                  <div>
                    <p className="text-2xl font-semibold">{c.value === undefined ? "–" : bn(c.value)}</p>
                    <p className="text-sm text-muted">{c.label}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <RulesForm key={s.updatedAt} settings={s} />

          <div className="flex flex-wrap gap-3">
            <Link href="/admin/shop/products">
              <Button variant="outline" icon={Boxes}>পণ্য ও স্টক</Button>
            </Link>
            <Link href="/admin/shop/setup">
              <Button variant="outline" icon={Settings2}>ক্যাটাগরি, ব্র্যান্ড, ডেলিভারি, ব্যানার, পার্টনার</Button>
            </Link>
          </div>

          <Card>
            <CardHeader title="বদলের ইতিহাস" />
            <ul className="divide-y divide-line">
              {(history.data?.data ?? []).map((h) => (
                <li key={h.id} className="px-5 py-3 text-sm">
                  <span className="text-muted">{formatInstant(h.createdAt)} · {h.changedByName ?? "অ্যাডমিন"}: </span>
                  {Object.entries(h.changes)
                    .map(([field, [from, to]]) => `${FIELD_LABEL[field] ?? field} ${show(field, from)} → ${show(field, to)}`)
                    .join(", ")}
                </li>
              ))}
              {history.data && history.data.data.length === 0 ? (
                <li className="px-5 py-3 text-sm text-muted">এখনো কিছু বদলানো হয়নি।</li>
              ) : null}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}
