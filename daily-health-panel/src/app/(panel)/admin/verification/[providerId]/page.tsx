"use client";

import { ArrowLeft, BadgeCheck, ExternalLink, FileText, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Skeleton, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { DOC_TYPE_LABEL, GENDER_LABEL, MODE_LABEL, PROVIDER_TYPE_LABEL, providerTitle, VERIFICATION_LABEL } from "@/features/labels";
import { useReviewProvider, useVerifyDecision } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { BANGLA_WEEKDAYS, banglaClock, bn, money } from "@/lib/format";

export default function ReviewProviderPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const toast = useToast();
  const provider = useReviewProvider(providerId);
  const decide = useVerifyDecision();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

  if (provider.isPending) return <Skeleton className="h-96" />;
  if (provider.isError) return <ErrorBox message={isApiError(provider.error) ? provider.error.userMessage : "লোড হয়নি"} onRetry={() => void provider.refetch()} />;
  const p = provider.data;

  return (
    <>
      <Link href="/admin/verification" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> তালিকায় ফিরুন</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{providerTitle(p.type, p.displayName)}</h1>
          <p className="text-muted">{PROVIDER_TYPE_LABEL[p.type]} · {p.providerCode} · {p.accountEmail}</p>
          <Badge tone={p.verificationStatus === "VERIFIED" ? "success" : p.verificationStatus === "REJECTED" ? "danger" : "warning"} className="mt-2">
            {VERIFICATION_LABEL[p.verificationStatus]}
          </Badge>
        </div>
        {p.verificationStatus !== "REJECTED" ? (
          <div className="flex gap-2">
            <Button variant="outline" icon={XCircle} className="text-danger" onClick={() => setRejecting(true)}>
              {p.verificationStatus === "VERIFIED" ? "স্থগিত করুন" : "সংশোধন চান"}
            </Button>
            {p.verificationStatus === "PENDING" ? (
              <Button icon={BadgeCheck} loading={decide.isPending} onClick={() => decide.mutate({ id: p.id }, { onSuccess: () => toast("যাচাই হয়েছে; ইমেইলে জানানো হয়েছে"), onError: fail })}>
                যাচাই করুন
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {p.rejectionReason ? <p className="mb-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">আগের কারণ: {p.rejectionReason}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="পেশাগত তথ্য" />
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
            <div><dt className="text-muted">BMDC নম্বর</dt><dd className="font-mono text-base font-semibold">{p.bmdcNo ?? "—"}</dd></div>
            <div><dt className="text-muted">লিঙ্গ</dt><dd>{GENDER_LABEL[p.gender]}</dd></div>
            <div className="col-span-2"><dt className="text-muted">ডিগ্রি</dt><dd>{p.qualifications}</dd></div>
            <div className="col-span-2"><dt className="text-muted">পদবি</dt><dd>{p.designation ?? "—"}</dd></div>
            <div><dt className="text-muted">অভিজ্ঞতা</dt><dd>{bn(p.experienceYears)} বছর</dd></div>
            <div><dt className="text-muted">বিশেষজ্ঞতা</dt><dd>{p.specialties.map((s) => s.nameBn).join(", ")}</dd></div>
            {p.bio ? <div className="col-span-2"><dt className="text-muted">পরিচিতি</dt><dd>{p.bio}</dd></div> : null}
          </dl>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">BMDC-র ওয়েবসাইটে নম্বর, নাম আর ডিগ্রি মিলিয়ে দেখুন।</p>
        </Card>

        <Card>
          <CardHeader title="কাগজপত্র" subtitle={p.missingForVerification.includes("BMDC_CERT") ? "BMDC সনদ দেওয়া হয়নি" : undefined} />
          {p.documents.length === 0 ? (
            <p className="p-5 text-sm text-muted">কোনো কাগজ দেওয়া হয়নি।</p>
          ) : (
            <ul className="grid gap-3 p-5 sm:grid-cols-2">
              {p.documents.map((d) => (
                <li key={d.id}>
                  <a href={d.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line hover:border-primary">
                    {d.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                      <img src={d.thumbnailUrl} alt={DOC_TYPE_LABEL[d.docType]} className="h-36 w-full bg-surface object-cover" />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-mint text-primary"><FileText className="size-10" /></div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium">{DOC_TYPE_LABEL[d.docType]}</span>
                      <ExternalLink className="size-4 text-muted" />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="চেম্বার ও সময়সূচি" />
          <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-2 font-semibold">চেম্বার</p>
              {p.allChambers.length ? p.allChambers.map((c) => <p key={c.id}>{c.hospital.name}, {c.hospital.district} · {money(c.fee)}</p>) : <p className="text-muted">নেই</p>}
              <p className="mt-3 font-semibold">অনলাইন ফি</p>
              <p>ভিডিও {p.fees.video !== null ? money(p.fees.video) : "—"} · চ্যাট {p.fees.chat !== null ? money(p.fees.chat) : "—"} · হোম ভিজিট {p.fees.homeVisit !== null ? money(p.fees.homeVisit) : "—"}</p>
            </div>
            <div>
              <p className="mb-2 font-semibold">সেশন</p>
              {p.allSchedules.length ? p.allSchedules.map((s) => (
                <p key={s.id} className={s.isActive ? "" : "text-muted line-through"}>
                  {BANGLA_WEEKDAYS[s.dayOfWeek]} · {MODE_LABEL[s.mode]} · {banglaClock(s.startTime)}–{banglaClock(s.endTime)}
                </p>
              )) : <p className="text-muted">নেই</p>}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={p.verificationStatus === "VERIFIED" ? "প্রোফাইল স্থগিত" : "সংশোধন চান"}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(false)}>বাতিল</Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 5}
              loading={decide.isPending}
              onClick={() => decide.mutate({ id: p.id, reject: reason.trim() }, { onSuccess: () => { toast("জানানো হয়েছে"); setRejecting(false); setReason(""); }, onError: fail })}
            >
              পাঠান
            </Button>
          </>
        }
      >
        <Field label="কারণ (সেবাদাতা দেখবেন)" htmlFor="reason" hint="কী ঠিক করতে হবে স্পষ্ট লিখুন">
          <Textarea id="reason" rows={4} maxLength={300} placeholder="যেমন: BMDC সনদের ছবি অস্পষ্ট, পরিষ্কার ছবি দিন" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {p.verificationStatus === "VERIFIED" ? <p className="mt-3 text-sm text-warning">স্থগিত করলে রোগীরা আর দেখবেন না, তবে আগের বুকিং থেকে যাবে।</p> : null}
      </Modal>
    </>
  );
}
