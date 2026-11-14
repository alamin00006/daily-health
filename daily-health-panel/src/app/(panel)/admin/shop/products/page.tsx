"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, ImagePlus, PackagePlus, Pencil, Plus, Search } from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { STOCK_REASON_LABEL } from "@/features/labels";
import { useMe } from "@/features/panel-queries";
import { useProductActions, useSetupList, useStaffProducts, useStockMovements } from "@/features/shop-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant, money } from "@/lib/format";
import { manualStockReasonSchema, type StaffProductResponse } from "@/shared-contracts/shop.contract";

const productForm = z
  .object({
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "ইংরেজি অক্ষর, সংখ্যা আর হাইফেন (যেমন NAPA-500-10)"),
    name: z.string().trim().min(1, "নাম দিন").max(120),
    genericName: z.string().trim().max(120),
    strength: z.string().trim().max(40),
    dosageForm: z.string().trim().max(40),
    packSize: z.string().trim().max(60),
    manufacturer: z.string().trim().max(80),
    description: z.string().trim().max(4000),
    categoryId: z.string().uuid("ক্যাটাগরি বেছে নিন"),
    brandId: z.string(),
    mrp: z.coerce.number().positive("MRP দিন"),
    price: z.coerce.number().positive("বিক্রয়মূল্য দিন"),
    lowStockThreshold: z.coerce.number().int().min(0),
    maxPerOrder: z.coerce.number().int().min(1).max(100),
    requiresPrescription: z.boolean(),
    isTrending: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((v) => v.price <= v.mrp, { path: ["price"], message: "বিক্রয়মূল্য MRP-র বেশি হতে পারে না" });
type ProductValues = z.input<typeof productForm>;

function ProductModal({ product, onClose }: { product: StaffProductResponse | null; onClose: () => void }) {
  const toast = useToast();
  const actions = useProductActions();
  const categories = useSetupList("categories");
  const brands = useSetupList("brands");
  const form = useForm<ProductValues>({
    resolver: zodResolver(productForm),
    defaultValues: {
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      genericName: product?.genericName ?? "",
      strength: product?.strength ?? "",
      dosageForm: product?.dosageForm ?? "",
      packSize: product?.packSize ?? "",
      manufacturer: product?.manufacturer ?? "",
      description: product?.description ?? "",
      categoryId: product?.category.id ?? "",
      brandId: product?.brand?.id ?? "",
      mrp: product?.mrp ?? "",
      price: product?.price ?? "",
      lowStockThreshold: product?.lowStockThreshold ?? 5,
      maxPerOrder: product?.maxPerOrder ?? 10,
      requiresPrescription: product?.requiresPrescription ?? false,
      isTrending: product?.isTrending ?? false,
      isActive: product?.isActive ?? true,
    },
  });
  const e = form.formState.errors;
  const fail = (err: unknown) => toast(isApiError(err) ? err.userMessage : "সেভ হয়নি", "error");
  const submit = form.handleSubmit((raw) => {
    const v = productForm.parse(raw);
    const body = { ...v, brandId: v.brandId || null };
    if (product) {
      // The SKU never changes after creation.
      const rest: Partial<typeof body> = { ...body };
      delete rest.sku;
      actions.update.mutate({ id: product.id, body: rest }, { onSuccess: () => (toast("সেভ হয়েছে"), onClose()), onError: fail });
    } else {
      actions.create.mutate(body, { onSuccess: () => (toast("পণ্য যোগ হয়েছে; এবার স্টক যোগ করুন"), onClose()), onError: fail });
    }
  });
  const text = (name: keyof ProductValues, label: string, hint?: string) => (
    <Field label={label} htmlFor={`p-${name}`} error={e[name]?.message as string | undefined} hint={hint}>
      <Input id={`p-${name}`} {...form.register(name)} disabled={name === "sku" && Boolean(product)} />
    </Field>
  );
  const check = (name: "requiresPrescription" | "isTrending" | "isActive", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" {...form.register(name)} />
      {label}
    </label>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={product ? "পণ্য বদলান" : "নতুন পণ্য"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button loading={actions.create.isPending || actions.update.isPending} onClick={() => void submit()}>সেভ করুন</Button>
        </>
      }
    >
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => (ev.preventDefault(), void submit())}>
        {text("sku", "SKU", product ? "SKU বদলানো যায় না" : "আমাদের স্টক কোড")}
        {text("name", "নাম")}
        {text("genericName", "জেনেরিক নাম")}
        {text("strength", "শক্তি", "যেমন 500 mg")}
        {text("dosageForm", "ধরন", "ট্যাবলেট, সিরাপ…")}
        {text("packSize", "প্যাক", "যেমন ১০টি ট্যাবলেট")}
        {text("manufacturer", "প্রস্তুতকারক")}
        <Field label="ক্যাটাগরি" htmlFor="p-category" error={e.categoryId?.message}>
          <Select id="p-category" {...form.register("categoryId")}>
            <option value="">বেছে নিন</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="ব্র্যান্ড" htmlFor="p-brand">
          <Select id="p-brand" {...form.register("brandId")}>
            <option value="">নেই</option>
            {(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {text("mrp", "MRP (৳)")}
        {text("price", "বিক্রয়মূল্য (৳)")}
        {text("lowStockThreshold", "এর কম হলে 'স্টক কম'")}
        {text("maxPerOrder", "এক অর্ডারে সর্বোচ্চ")}
        <div className="sm:col-span-2">
          <Field label="বিবরণ" htmlFor="p-description">
            <Textarea id="p-description" rows={3} {...form.register("description")} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-5 sm:col-span-2">
          {check("requiresPrescription", "প্রেসক্রিপশন লাগে")}
          {check("isTrending", "ট্রেন্ডিং-এ দেখান")}
          {check("isActive", "বিক্রি চালু")}
        </div>
      </form>
    </Modal>
  );
}

const stockForm = z.object({
  change: z.coerce.number().int().refine((v) => v !== 0, "০ নয়"),
  reason: manualStockReasonSchema,
  note: z.string().trim().max(300),
});
type StockValues = z.input<typeof stockForm>;

function StockModal({ product, canEdit, onClose }: { product: StaffProductResponse; canEdit: boolean; onClose: () => void }) {
  const toast = useToast();
  const actions = useProductActions();
  const ledger = useStockMovements(product.id);
  const form = useForm<StockValues>({ resolver: zodResolver(stockForm), defaultValues: { change: "", reason: "RESTOCK", note: "" } });
  const reason = useWatch({ control: form.control, name: "reason" });
  const submit = form.handleSubmit((raw) => {
    const v = stockForm.parse(raw);
    // Restock adds; damaged/expired take out; a count fix can go either way.
    const change = v.reason === "RESTOCK" ? Math.abs(v.change) : v.reason === "ADJUSTMENT" ? v.change : -Math.abs(v.change);
    actions.adjustStock.mutate(
      { id: product.id, body: { change, reason: v.reason, note: v.note || null } },
      {
        onSuccess: (p) => (toast(`স্টক এখন ${bn(p.stockQty)}`), form.reset({ change: "", reason: v.reason, note: "" })),
        onError: (err) => toast(isApiError(err) ? err.userMessage : "হয়নি", "error"),
      },
    );
  });
  return (
    <Modal open wide onClose={onClose} title={`স্টক: ${product.name}`}>
      <div className="space-y-5">
        <p className="text-sm">
          এখন স্টক <strong className="text-lg">{bn(product.stockQty)}</strong>
          {product.isLowStock ? <Badge tone="warning" className="ml-2">কম</Badge> : null}
        </p>
        {canEdit ? (
          <form noValidate className="grid gap-3 sm:grid-cols-4" onSubmit={(ev) => (ev.preventDefault(), void submit())}>
            <Field label="কারণ" htmlFor="s-reason">
              <Select id="s-reason" {...form.register("reason")}>
                {manualStockReasonSchema.options.map((r) => <option key={r} value={r}>{STOCK_REASON_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field
              label={reason === "ADJUSTMENT" ? "পরিবর্তন (+ বা −)" : reason === "RESTOCK" ? "কতগুলো এলো" : "কতগুলো বাদ"}
              htmlFor="s-change"
              error={form.formState.errors.change?.message}
            >
              <Input id="s-change" type="number" {...form.register("change")} />
            </Field>
            <Field label="নোট" htmlFor="s-note">
              <Input id="s-note" placeholder="চালান নম্বর, কারণ…" {...form.register("note")} />
            </Field>
            <div className="flex items-end">
              <Button loading={actions.adjustStock.isPending} onClick={() => void submit()}>সেভ করুন</Button>
            </div>
          </form>
        ) : null}
        <div>
          <p className="mb-2 text-sm font-semibold">স্টকের হিসাব (সবশেষ আগে)</p>
          {ledger.isPending ? (
            <Skeleton className="h-24" />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {(ledger.data?.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 text-muted">{formatInstant(m.createdAt)}</td>
                    <td className="py-2">
                      {STOCK_REASON_LABEL[m.reason]}
                      {m.orderCode ? <span className="text-muted"> · {m.orderCode}</span> : null}
                      {m.note ? <span className="text-muted"> · {m.note}</span> : null}
                    </td>
                    <td className={`py-2 text-right font-medium ${m.change > 0 ? "text-primary" : "text-danger"}`}>
                      {m.change > 0 ? "+" : "−"}{bn(Math.abs(m.change))}
                    </td>
                    <td className="py-2 text-right text-muted">= {bn(m.balanceAfter)}</td>
                    <td className="py-2 pl-3 text-xs text-muted">{m.byName ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Products and inventory. Any staff can look; only admins change things. */
function ShopProducts() {
  const toast = useToast();
  const me = useMe();
  const canEdit = me.data?.role === "ADMIN";
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const initialStock = useSearchParams().get("stock");
  const [stock, setStock] = useState<"" | "LOW" | "OUT">(initialStock === "LOW" || initialStock === "OUT" ? initialStock : "");
  const [editing, setEditing] = useState<StaffProductResponse | "new" | null>(null);
  const [stockOf, setStockOf] = useState<StaffProductResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFor, setImageFor] = useState<string | null>(null);
  const actions = useProductActions();
  const categories = useSetupList("categories");
  const products = useStaffProducts({ q: search || undefined, categoryId: categoryId || undefined, stock: stock || undefined });
  const rows = products.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="পণ্য ও স্টক"
        subtitle="নতুন পণ্যের স্টক ০ থেকে শুরু হয়; 'স্টক' থেকে চালান যোগ করুন। সব পরিবর্তনের হিসাব থাকে।"
        action={canEdit ? <Button icon={Plus} onClick={() => setEditing("new")}>নতুন পণ্য</Button> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="flex gap-2" onSubmit={(ev) => (ev.preventDefault(), setSearch(q.trim()))}>
          <Input aria-label="খুঁজুন" placeholder="নাম, জেনেরিক বা SKU" value={q} onChange={(ev) => setQ(ev.target.value)} className="w-56" />
          <Button type="submit" variant="outline" icon={Search}>খুঁজুন</Button>
        </form>
        <Select aria-label="ক্যাটাগরি" value={categoryId} onChange={(ev) => setCategoryId(ev.target.value)} className="w-auto">
          <option value="">সব ক্যাটাগরি</option>
          {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="স্টক" value={stock} onChange={(ev) => setStock(ev.target.value as "" | "LOW" | "OUT")} className="w-auto">
          <option value="">সব স্টক</option>
          <option value="LOW">স্টক কম</option>
          <option value="OUT">স্টক শেষ</option>
        </Select>
      </div>
      {products.isPending ? (
        <Skeleton className="h-40" />
      ) : products.isError ? (
        <ErrorBox message={isApiError(products.error) ? products.error.userMessage : "লোড হয়নি"} onRetry={() => void products.refetch()} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Boxes} title="কোনো পণ্য নেই" message={canEdit ? "নতুন পণ্য যোগ করুন।" : "এই ফিল্টারে কিছু নেই।"} /></Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">পণ্য</th>
                <th className="px-4 py-3">ক্যাটাগরি</th>
                <th className="px-4 py-3 text-right">দাম</th>
                <th className="px-4 py-3 text-right">স্টক</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className={p.isActive ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mint">
                        {p.imageThumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- CDN WebP thumbnail
                          <img src={p.imageThumbnailUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <Boxes className="size-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {p.name} {p.strength ?? ""}
                          {p.requiresPrescription ? <Badge tone="warning" className="ml-2">Rx</Badge> : null}
                          {!p.isActive ? <Badge className="ml-2">বন্ধ</Badge> : null}
                        </p>
                        <p className="text-xs text-muted">{p.sku}{p.packSize ? ` · ${p.packSize}` : ""}{p.brandName ? ` · ${p.brandName}` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.category.name}</td>
                  <td className="px-4 py-3 text-right">
                    {money(p.price)}
                    {p.mrp > p.price ? <p className="text-xs text-muted line-through">{money(p.mrp)}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge tone={p.stockQty === 0 ? "danger" : p.isLowStock ? "warning" : "success"}>{bn(p.stockQty)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" icon={PackagePlus} onClick={() => setStockOf(p)}>স্টক</Button>
                      {canEdit ? (
                        <>
                          <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(p)}>বদলান</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={ImagePlus}
                            aria-label="ছবি"
                            loading={actions.setImage.isPending && imageFor === p.id}
                            onClick={() => (setImageFor(p.id), fileRef.current?.click())}
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {products.hasNextPage ? (
        <Button className="mt-3" variant="outline" loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
          আরও দেখুন
        </Button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (file && imageFor) {
            actions.setImage.mutate(
              { id: imageFor, file },
              { onSuccess: () => toast("ছবি যোগ হয়েছে"), onError: (err) => toast(isApiError(err) ? err.userMessage : "ছবি যায়নি", "error") },
            );
          }
        }}
      />
      {editing ? <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {stockOf ? (
        <StockModal
          product={rows.find((r) => r.id === stockOf.id) ?? stockOf}
          canEdit={canEdit}
          onClose={() => setStockOf(null)}
        />
      ) : null}
    </>
  );
}

export default function ShopProductsPage() {
  return (
    <Suspense>
      <ShopProducts />
    </Suspense>
  );
}
