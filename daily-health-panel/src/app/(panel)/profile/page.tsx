"use client";

import { BadgeCheck, Camera, CircleAlert, Clock, Send, Trash2 } from "lucide-react";
import { useRef } from "react";
import { DocumentsCard } from "@/components/provider/documents-card";
import { FeesForm } from "@/components/provider/fees-form";
import { ProviderDetailsForm } from "@/components/provider/provider-details-form";
import { Button, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { providerTitle } from "@/features/labels";
import { useMyProvider, useRemoveAvatar, useResubmit, useUpdateProvider, useUploadAvatar } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { bn, formatDate, dhakaDate } from "@/lib/format";
import type { MyProviderProfileResponse } from "@/shared-contracts/doctors.contract";

const MISSING_TEXT = {
  BMDC_CERT: "BMDC নিবন্ধন সনদ আপলোড করুন",
  CHAMBER_OR_ONLINE_FEE: "একটি চেম্বার যোগ করুন, অথবা ভিডিও/চ্যাট ফি দিন",
} as const;

function VerificationCard({ profile }: { profile: MyProviderProfileResponse }) {
  const toast = useToast();
  const resubmit = useResubmit();
  if (profile.verificationStatus === "VERIFIED") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-success/25 bg-success-soft p-4">
        <BadgeCheck className="size-6 text-success" />
        <p className="text-sm">
          <strong>যাচাই করা প্রোফাইল</strong>
          {profile.verifiedAt ? ` · ${formatDate(dhakaDate(new Date(profile.verifiedAt)))} থেকে রোগীরা আপনাকে দেখছেন` : ""}
        </p>
      </div>
    );
  }
  const rejected = profile.verificationStatus === "REJECTED";
  return (
    <div className={`mb-6 rounded-2xl border p-5 ${rejected ? "border-danger/25 bg-danger-soft" : "border-warning/25 bg-warning-soft"}`}>
      <div className="flex items-start gap-3">
        {rejected ? <CircleAlert className="size-6 text-danger" /> : <Clock className="size-6 text-warning" />}
        <div className="flex-1">
          <p className="font-semibold">{rejected ? "অ্যাডমিন সংশোধন চেয়েছেন" : "যাচাইয়ের অপেক্ষায়"}</p>
          {rejected ? <p className="mt-1 text-sm">কারণ: {profile.rejectionReason}</p> : null}
          {profile.missingForVerification.length ? (
            <ul className="mt-2 list-inside list-disc text-sm">
              {profile.missingForVerification.map((m) => <li key={m}>{MISSING_TEXT[m]}</li>)}
            </ul>
          ) : !rejected ? (
            <p className="mt-1 text-sm">সব দেওয়া হয়েছে। অ্যাডমিন দেখে যাচাই করবেন; ইমেইলে জানানো হবে।</p>
          ) : null}
        </div>
        {rejected ? (
          <Button
            icon={Send}
            disabled={profile.missingForVerification.length > 0}
            loading={resubmit.isPending}
            onClick={() => resubmit.mutate(undefined, { onSuccess: () => toast("আবার যাচাইয়ের জন্য পাঠানো হয়েছে"), onError: (e) => toast(isApiError(e) ? e.userMessage : "পাঠানো যায়নি", "error") })}
          >
            আবার পাঠান
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const toast = useToast();
  const provider = useMyProvider();
  const update = useUpdateProvider();
  const avatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const fileInput = useRef<HTMLInputElement>(null);
  const p = provider.data;
  if (!p) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader title="প্রোফাইল ও কাগজপত্র" subtitle={`রোগীরা যা দেখেন · ID ${p.providerCode}`} />
      <VerificationCard profile={p} />

      <Card className="mb-6 flex flex-wrap items-center gap-5 p-5">
        <div className="relative">
          {p.avatarThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API's file host
            <img src={p.avatarThumbnailUrl} alt="" className="size-24 rounded-2xl object-cover" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-2xl bg-mint font-display text-3xl font-bold text-primary">{p.displayName.slice(0, 1)}</div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-lg font-semibold">{providerTitle(p.type, p.displayName)}</p>
          <p className="text-sm text-muted">{p.qualifications}</p>
          <p className="text-sm text-muted">⭐ {p.ratingCount ? `${bn(p.ratingAvg.toFixed(1))} (${bn(p.ratingCount)} রিভিউ)` : "এখনো রিভিউ নেই"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={Camera} loading={avatar.isPending} onClick={() => fileInput.current?.click()}>ছবি বদলান</Button>
          {p.avatarUrl ? <Button variant="ghost" icon={Trash2} className="text-danger hover:bg-danger-soft" onClick={() => removeAvatar.mutate()}>সরান</Button> : null}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) avatar.mutate(file, { onSuccess: () => toast("ছবি বদলানো হয়েছে"), onError: (err) => toast(isApiError(err) ? err.userMessage : "আপলোড হয়নি", "error") });
            }}
          />
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="পেশাগত তথ্য" />
        <div className="p-5">
          <ProviderDetailsForm
            key={p.id}
            profile={p}
            submitLabel="সেভ করুন"
            onSubmit={async (v) => {
              await update.mutateAsync({
                gender: v.gender,
                displayName: v.displayName,
                designation: v.designation || null,
                qualifications: v.qualifications,
                experienceYears: v.experienceYears,
                bio: v.bio || null,
                specialtyIds: v.specialtyIds,
                ...(p.type === "DOCTOR" ? { bmdcNo: v.bmdcNo } : {}),
              });
              toast("সেভ হয়েছে");
            }}
          />
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="অনলাইন ফি ও সেবা" subtitle="চেম্বারের ফি চেম্বার অংশে (সময়সূচি পাতা)" />
        <div className="p-5"><FeesForm profile={p} /></div>
      </Card>

      <DocumentsCard profile={p} />
    </>
  );
}
