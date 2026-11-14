"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { BANNER_LINK_LABEL, CATEGORY_BADGE_LABEL } from "@/features/labels";
import { useMe } from "@/features/panel-queries";
import { SETUP_IMAGE_PATH, useSetupActions, useSetupList, type SetupKind } from "@/features/shop-queries";
import { isApiError } from "@/lib/api-client";
import { bn, money } from "@/lib/format";
import {
  bannerLinkTypeSchema,
  categoryBadgeSchema,
  createBrandRequestSchema,
  createDeliveryZoneRequestSchema,
  createDiscountPartnerRequestSchema,
  createProductCategoryRequestSchema,
  createShopBannerRequestSchema,
} from "@/shared-contracts/shop.contract";

type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select" | "datetime";
  options?: { value: string; label: string }[];
  hint?: string;
};

type Row = { id: string; [key: string]: unknown };

interface TabDef {
  kind: SetupKind;
  label: string;
  schema: z.ZodType;
  fields: FieldDef[];
  empty: Record<string, unknown>;
  title: (row: Row) => string;
  details: (row: Row) => string;
  image: (row: Row) => string | null;
}

const TABS: TabDef[] = [
  {
    kind: "categories",
    label: "ক্যাটাগরি",
    schema: createProductCategoryRequestSchema,
    fields: [
      { name: "name", label: "নাম", type: "text" },
      { name: "slug", label: "স্লাগ", type: "text", hint: "ইংরেজি ছোট হাতের, যেমন baby-care" },
      {
        name: "badge",
        label: "ট্যাগ",
        type: "select",
        options: [{ value: "", label: "নেই" }, ...categoryBadgeSchema.options.map((b) => ({ value: b, label: CATEGORY_BADGE_LABEL[b] }))],
      },
      { name: "sortOrder", label: "ক্রম", type: "number" },
      { name: "showOnHome", label: "হোমে আলাদা সেকশন হিসেবে দেখান", type: "checkbox" },
      { name: "isActive", label: "চালু", type: "checkbox" },
    ],
    empty: { name: "", slug: "", badge: "", sortOrder: 0, showOnHome: false, isActive: true },
    title: (r) => String(r.name),
    details: (r) =>
      [`${bn(Number(r.productCount))}টি পণ্য`, r.badge ? CATEGORY_BADGE_LABEL[r.badge as keyof typeof CATEGORY_BADGE_LABEL] : null, r.showOnHome ? "হোমে সেকশন" : null]
        .filter(Boolean)
        .join(" · "),
    image: (r) => (r.imageThumbnailUrl as string | null) ?? null,
  },
  {
    kind: "brands",
    label: "ব্র্যান্ড",
    schema: createBrandRequestSchema,
    fields: [
      { name: "name", label: "নাম", type: "text" },
      { name: "slug", label: "স্লাগ", type: "text" },
      { name: "sortOrder", label: "ক্রম", type: "number" },
      { name: "isFeatured", label: "হোমে 'ফিচার্ড ব্র্যান্ড'", type: "checkbox" },
      { name: "isActive", label: "চালু", type: "checkbox" },
    ],
    empty: { name: "", slug: "", sortOrder: 0, isFeatured: false, isActive: true },
    title: (r) => String(r.name),
    details: (r) => [`${bn(Number(r.productCount))}টি পণ্য`, r.isFeatured ? "ফিচার্ড" : null].filter(Boolean).join(" · "),
    image: (r) => (r.logoThumbnailUrl as string | null) ?? null,
  },
  {
    kind: "delivery-zones",
    label: "ডেলিভারি এলাকা",
    schema: createDeliveryZoneRequestSchema,
    fields: [
      { name: "name", label: "এলাকা", type: "text", hint: "যেমন ঢাকা সিটির ভেতরে" },
      { name: "charge", label: "চার্জ (৳)", type: "number" },
      { name: "estimate", label: "কত দিনে", type: "text", hint: "যেমন ১–২ দিন" },
      { name: "sortOrder", label: "ক্রম", type: "number" },
      { name: "isActive", label: "চালু", type: "checkbox" },
    ],
    empty: { name: "", charge: 0, estimate: "", sortOrder: 0, isActive: true },
    title: (r) => String(r.name),
    details: (r) => [money(Number(r.charge)), r.estimate as string | null].filter(Boolean).join(" · "),
    image: () => null,
  },
  {
    kind: "banners",
    label: "ব্যানার",
    schema: createShopBannerRequestSchema,
    fields: [
      { name: "title", label: "শিরোনাম (ভেতরের নাম)", type: "text" },
      {
        name: "linkType",
        label: "চাপলে যাবে",
        type: "select",
        options: bannerLinkTypeSchema.options.map((t) => ({ value: t, label: BANNER_LINK_LABEL[t] })),
      },
      { name: "linkValue", label: "লিংক / আইডি", type: "text", hint: "ওয়েব লিংক (https://…) বা ক্যাটাগরি/পণ্য/ব্র্যান্ডের আইডি" },
      { name: "startsAt", label: "শুরু", type: "datetime" },
      { name: "endsAt", label: "শেষ", type: "datetime" },
      { name: "sortOrder", label: "ক্রম", type: "number" },
      { name: "isActive", label: "চালু", type: "checkbox" },
    ],
    empty: { title: "", linkType: "NONE", linkValue: "", startsAt: null, endsAt: null, sortOrder: 0, isActive: true },
    title: (r) => String(r.title),
    details: (r) => [BANNER_LINK_LABEL[r.linkType as keyof typeof BANNER_LINK_LABEL], r.imageUrl ? null : "ছবি নেই, অ্যাপে দেখাবে না"].filter(Boolean).join(" · "),
    image: (r) => (r.imageUrl as string | null) ?? null,
  },
  {
    kind: "partners",
    label: "ডিসকাউন্ট পার্টনার",
    schema: createDiscountPartnerRequestSchema,
    fields: [
      { name: "name", label: "নাম", type: "text" },
      { name: "offerText", label: "অফার", type: "text", hint: "যেমন সব টেস্টে ২০% ছাড়" },
      { name: "address", label: "ঠিকানা", type: "text" },
      { name: "phone", label: "ফোন", type: "text" },
      { name: "description", label: "বিস্তারিত", type: "text" },
      { name: "sortOrder", label: "ক্রম", type: "number" },
      { name: "isActive", label: "চালু", type: "checkbox" },
    ],
    empty: { name: "", offerText: "", address: "", phone: null, description: "", sortOrder: 0, isActive: true },
    title: (r) => String(r.name),
    details: (r) => [r.offerText as string, r.address as string | null].filter(Boolean).join(" · "),
    image: (r) => (r.logoThumbnailUrl as string | null) ?? null,
  },
];

/** ISO ↔ <input type="datetime-local"> in the browser's time (Asia/Dhaka for staff). */
const toLocalInput = (iso: unknown) => {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function SetupModal({ tab, row, onClose }: { tab: TabDef; row: Row | null; onClose: () => void }) {
  const toast = useToast();
  const actions = useSetupActions(tab.kind);
  const initial = Object.fromEntries(
    tab.fields.map((f) => {
      const value = row ? (row[f.name] ?? tab.empty[f.name]) : tab.empty[f.name];
      if (f.type === "datetime") return [f.name, toLocalInput(value)];
      return [f.name, value ?? ""];
    }),
  );
  // Inputs give strings; the request wants ISO times and nulls. Convert, then let zod check.
  const toRequest = (values: Record<string, unknown>) => {
    const body = { ...values };
    for (const f of tab.fields) {
      if (f.type === "datetime") body[f.name] = body[f.name] ? new Date(String(body[f.name])).toISOString() : null;
    }
    if (body.badge === "") body.badge = null;
    if (body.phone === "") body.phone = null;
    return body;
  };
  const zod = zodResolver(tab.schema as never) as Resolver<Record<string, unknown>>;
  const resolver: Resolver<Record<string, unknown>> = (values, context, options) => zod(toRequest(values), context, options);
  const form = useForm<Record<string, unknown>>({ resolver, defaultValues: initial });
  const errors = form.formState.errors;
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error");
  const submit = form.handleSubmit((body) => {
    if (row) {
      actions.update.mutate({ id: row.id, body: body as never }, { onSuccess: () => (toast("সেভ হয়েছে"), onClose()), onError: fail });
    } else {
      actions.create.mutate(body as never, { onSuccess: () => (toast("যোগ হয়েছে"), onClose()), onError: fail });
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`${tab.label}: ${row ? "বদলান" : "নতুন"}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button loading={actions.create.isPending || actions.update.isPending} onClick={() => void submit()}>সেভ করুন</Button>
        </>
      }
    >
      <form noValidate className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void submit())}>
        {tab.fields.map((f) => {
          const error = errors[f.name]?.message as string | undefined;
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register(f.name)} />
                {f.label}
              </label>
            );
          }
          return (
            <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} error={error} hint={f.hint}>
              {f.type === "select" ? (
                <Select id={`f-${f.name}`} {...form.register(f.name)}>
                  {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : (
                <Input
                  id={`f-${f.name}`}
                  type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : "text"}
                  {...form.register(f.name)}
                  aria-invalid={Boolean(error)}
                />
              )}
            </Field>
          );
        })}
      </form>
    </Modal>
  );
}

function SetupTab({ tab, canEdit }: { tab: TabDef; canEdit: boolean }) {
  const toast = useToast();
  const list = useSetupList(tab.kind);
  const actions = useSetupActions(tab.kind);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFor, setImageFor] = useState<string | null>(null);
  const rows = (list.data ?? []) as unknown as Row[];
  const hasImage = Boolean(SETUP_IMAGE_PATH[tab.kind]);
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

  return (
    <div className="space-y-3">
      {canEdit ? <Button icon={Plus} onClick={() => setEditing("new")}>নতুন {tab.label}</Button> : null}
      {list.isPending ? (
        <Skeleton className="h-32" />
      ) : list.isError ? (
        <ErrorBox message={isApiError(list.error) ? list.error.userMessage : "লোড হয়নি"} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Settings2} title={`কোনো ${tab.label} নেই`} message="নতুন যোগ করুন।" /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className={`flex items-center gap-4 px-4 py-3 ${r.isActive === false ? "opacity-60" : ""}`}>
                {hasImage ? (
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mint">
                    {tab.image(r) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- CDN WebP
                      <img src={tab.image(r)!} alt="" className="size-full object-cover" />
                    ) : (
                      <ImagePlus className="size-5 text-muted" />
                    )}
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {tab.title(r)} {r.isActive === false ? <Badge className="ml-1">বন্ধ</Badge> : null}
                  </p>
                  <p className="text-sm text-muted">{tab.details(r)}</p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    {hasImage ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={ImagePlus}
                        loading={actions.setImage.isPending && imageFor === r.id}
                        onClick={() => (setImageFor(r.id), fileRef.current?.click())}
                      >
                        ছবি
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(r)}>বদলান</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      aria-label="মুছুন"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => {
                        if (window.confirm(`“${tab.title(r)}” মুছবেন?`)) {
                          actions.remove.mutate(r.id, { onSuccess: () => toast("মুছে ফেলা হয়েছে"), onError: fail });
                        }
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && imageFor) actions.setImage.mutate({ id: imageFor, file }, { onSuccess: () => toast("ছবি যোগ হয়েছে"), onError: fail });
        }}
      />
      {editing ? <SetupModal tab={tab} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

/** Categories, brands, delivery zones, home banners and discount partners. */
export default function ShopSetupPage() {
  const me = useMe();
  const canEdit = me.data?.role === "ADMIN";
  const [active, setActive] = useState<SetupKind>("categories");
  const tab = TABS.find((t) => t.kind === active)!;
  return (
    <>
      <PageHeader title="হেলথস্টোর সেটআপ" subtitle="ক্যাটাগরি, ব্র্যান্ড, ডেলিভারি এলাকা, হোমের ব্যানার আর ডিসকাউন্ট পার্টনার।" />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <Button key={t.kind} role="tab" aria-selected={t.kind === active} variant={t.kind === active ? "primary" : "outline"} size="sm" onClick={() => setActive(t.kind)}>
            {t.label}
          </Button>
        ))}
      </div>
      <SetupTab key={tab.kind} tab={tab} canEdit={canEdit} />
    </>
  );
}
