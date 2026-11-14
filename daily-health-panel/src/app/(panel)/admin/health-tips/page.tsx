"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ImagePlus, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { TIP_CATEGORY_LABEL } from "@/features/labels";
import { useStaffTips, useTipActions } from "@/features/staff-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatInstant } from "@/lib/format";
import {
  tipCategorySchema,
  type StaffHealthTipResponse,
  type TipCategory,
  type TipStatus,
} from "@/shared-contracts/content.contract";

const tipForm = z.object({
  title: z.string().trim().min(5, "শিরোনাম অন্তত ৫ অক্ষর").max(120, "সর্বোচ্চ ১২০ অক্ষর"),
  body: z.string().trim().min(20, "লেখা অন্তত ২০ অক্ষর").max(5000, "সর্বোচ্চ ৫,০০০ অক্ষর"),
  category: tipCategorySchema,
});
type TipValues = z.infer<typeof tipForm>;

function TipModal({ tip, onClose }: { tip: StaffHealthTipResponse | null; onClose: () => void }) {
  const toast = useToast();
  const actions = useTipActions();
  const form = useForm<TipValues>({
    resolver: zodResolver(tipForm),
    defaultValues: { title: tip?.title ?? "", body: tip?.body ?? "", category: tip?.category ?? "GENERAL" },
  });
  const errors = form.formState.errors;
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error");
  const submit = form.handleSubmit((values) => {
    if (tip) {
      actions.update.mutate({ id: tip.id, body: values }, { onSuccess: () => (toast("সেভ হয়েছে"), onClose()), onError: fail });
    } else {
      actions.create.mutate(values, { onSuccess: () => (toast("খসড়া তৈরি হয়েছে; ছবি দিয়ে প্রকাশ করুন"), onClose()), onError: fail });
    }
  });
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={tip ? "টিপস বদলান" : "নতুন স্বাস্থ্য টিপস"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            বাতিল
          </Button>
          <Button loading={actions.create.isPending || actions.update.isPending} onClick={() => void submit()}>
            সেভ করুন
          </Button>
        </>
      }
    >
      <form noValidate className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <Field label="শিরোনাম" htmlFor="tip-title" error={errors.title?.message}>
          <Input id="tip-title" {...form.register("title")} aria-invalid={Boolean(errors.title)} />
        </Field>
        <Field label="বিষয়" htmlFor="tip-category">
          <Select id="tip-category" {...form.register("category")}>
            {tipCategorySchema.options.map((c) => (
              <option key={c} value={c}>
                {TIP_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="লেখা" htmlFor="tip-body" error={errors.body?.message} hint="সহজ বাংলায়, ছোট অনুচ্ছেদে। ওষুধের নাম বা ডোজ লিখবেন না।">
          <Textarea id="tip-body" rows={9} {...form.register("body")} aria-invalid={Boolean(errors.body)} />
        </Field>
      </form>
    </Modal>
  );
}

function TipRow({ tip, onEdit }: { tip: StaffHealthTipResponse; onEdit: () => void }) {
  const toast = useToast();
  const actions = useTipActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");
  const published = tip.status === "PUBLISHED";
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row">
      <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mint sm:w-44">
        {tip.imageThumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN WebP thumbnail, sized by the API
          <img src={tip.imageThumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <Lightbulb className="size-8 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={published ? "success" : "neutral"}>{published ? "প্রকাশিত" : "খসড়া"}</Badge>
          <Badge tone="primary">{TIP_CATEGORY_LABEL[tip.category]}</Badge>
        </div>
        <p className="font-semibold">{tip.title}</p>
        <p className="line-clamp-2 text-sm text-muted">{tip.body}</p>
        <p className="text-xs text-muted">
          {tip.createdByName ?? "স্টাফ"} · শেষ বদল {formatInstant(tip.updatedAt)}
          {tip.author ? ` · লেখক: ${tip.author.displayName}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:w-44 sm:flex-col">
        <Button
          size="sm"
          variant={published ? "outline" : "primary"}
          icon={published ? EyeOff : Eye}
          loading={actions.setPublished.isPending}
          onClick={() =>
            actions.setPublished.mutate(
              { id: tip.id, published: !published },
              { onSuccess: () => toast(published ? "অ্যাপ থেকে সরানো হয়েছে" : "অ্যাপে প্রকাশ হয়েছে"), onError: fail },
            )
          }
        >
          {published ? "সরিয়ে নিন" : "প্রকাশ করুন"}
        </Button>
        <Button size="sm" variant="outline" icon={Pencil} onClick={onEdit}>
          বদলান
        </Button>
        <Button size="sm" variant="outline" icon={ImagePlus} loading={actions.setImage.isPending} onClick={() => fileRef.current?.click()}>
          {tip.imageUrl ? "ছবি বদলান" : "ছবি দিন"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) actions.setImage.mutate({ id: tip.id, file }, { onSuccess: () => toast("ছবি যোগ হয়েছে"), onError: fail });
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          className="text-danger hover:bg-danger-soft"
          onClick={() => {
            if (window.confirm(`“${tip.title}” মুছে ফেলবেন? ফিরিয়ে আনা যাবে না।`)) {
              actions.remove.mutate(tip.id, { onSuccess: () => toast("মুছে ফেলা হয়েছে"), onError: fail });
            }
          }}
        >
          মুছুন
        </Button>
      </div>
    </Card>
  );
}

/** Health tips shown on the app's home: write, add a picture, publish. */
export default function HealthTipsPage() {
  const [status, setStatus] = useState<TipStatus | "ALL">("ALL");
  const [category, setCategory] = useState<TipCategory | "ALL">("ALL");
  const [editing, setEditing] = useState<StaffHealthTipResponse | "new" | null>(null);
  const tips = useStaffTips(status, category);
  const rows = tips.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="স্বাস্থ্য টিপস"
        subtitle="প্রকাশিত টিপস অ্যাপের হোমে সবাই দেখে, অতিথিরাও।"
        action={
          <Button icon={Plus} onClick={() => setEditing("new")}>
            নতুন টিপস
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select aria-label="অবস্থা" value={status} onChange={(e) => setStatus(e.target.value as TipStatus | "ALL")} className="w-auto">
          <option value="ALL">সব অবস্থা</option>
          <option value="PUBLISHED">প্রকাশিত</option>
          <option value="DRAFT">খসড়া</option>
        </Select>
        <Select aria-label="বিষয়" value={category} onChange={(e) => setCategory(e.target.value as TipCategory | "ALL")} className="w-auto">
          <option value="ALL">সব বিষয়</option>
          {tipCategorySchema.options.map((c) => (
            <option key={c} value={c}>
              {TIP_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        {tips.data ? <p className="self-center text-sm text-muted">{bn(rows.length)}টি দেখানো হচ্ছে</p> : null}
      </div>
      <div className="space-y-3">
        {tips.isPending ? (
          <Skeleton className="h-40" />
        ) : tips.isError ? (
          <ErrorBox message={isApiError(tips.error) ? tips.error.userMessage : "লোড হয়নি"} onRetry={() => void tips.refetch()} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon={Lightbulb} title="কোনো টিপস নেই" message="নতুন টিপস লিখে প্রকাশ করুন।" />
          </Card>
        ) : (
          rows.map((tip) => <TipRow key={tip.id} tip={tip} onEdit={() => setEditing(tip)} />)
        )}
        {tips.hasNextPage ? (
          <Button variant="outline" loading={tips.isFetchingNextPage} onClick={() => void tips.fetchNextPage()}>
            আরও দেখুন
          </Button>
        ) : null}
      </div>
      {editing ? <TipModal tip={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
