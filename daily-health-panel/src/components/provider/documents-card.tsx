"use client";

import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { DOC_TYPE_LABEL } from "@/features/labels";
import { useRemoveDocument, useUploadDocument } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";
import type { MyProviderProfileResponse, VerificationDocType } from "@/shared-contracts/doctors.contract";

const MAX_BYTES = 10 * 1024 * 1024;
const STATUS = { PENDING: ["যাচাই বাকি", "warning"], APPROVED: ["অনুমোদিত", "success"], REJECTED: ["বাতিল", "danger"] } as const;

/** Private verification documents (BMDC certificate first for doctors). */
export function DocumentsCard({ profile }: { profile: MyProviderProfileResponse }) {
  const toast = useToast();
  const upload = useUploadDocument();
  const remove = useRemoveDocument();
  const input = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<VerificationDocType>(profile.type === "DOCTOR" ? "BMDC_CERT" : "DEGREE");
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

  return (
    <Card>
      <CardHeader
        title="যাচাইয়ের কাগজপত্র"
        subtitle="শুধু অ্যাডমিন দেখেন; রোগীরা দেখেন না। ছবি বা PDF, ১০ MB পর্যন্ত।"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select className="min-h-9 w-auto text-sm" value={docType} onChange={(e) => setDocType(e.target.value as VerificationDocType)}>
              {(Object.keys(DOC_TYPE_LABEL) as VerificationDocType[]).filter((t) => profile.type === "DOCTOR" || t !== "BMDC_CERT").map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
              ))}
            </Select>
            <Button size="sm" icon={Upload} loading={upload.isPending} onClick={() => input.current?.click()}>আপলোড</Button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > MAX_BYTES) return toast("ফাইলটি ১০ MB-এর বেশি", "error");
                upload.mutate({ file, docType }, { onSuccess: () => toast("আপলোড হয়েছে"), onError: fail });
              }}
            />
          </div>
        }
      />
      {profile.documents.length === 0 ? (
        <EmptyState icon={FileText} title="এখনো কিছু দেননি" message={profile.type === "DOCTOR" ? "BMDC নিবন্ধন সনদের পরিষ্কার ছবি বা PDF দিন।" : "ডিগ্রি বা পেশাগত সনদ দিন।"} />
      ) : (
        <ul className="divide-y divide-line">
          {profile.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              {d.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed private URL, not optimisable
                <img src={d.thumbnailUrl} alt="" className="size-12 rounded-lg border border-line object-cover" />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-lg bg-mint text-primary"><FileText className="size-5" /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{DOC_TYPE_LABEL[d.docType]}</p>
                <p className="text-sm text-muted">{timeAgo(d.createdAt)}</p>
              </div>
              <Badge tone={STATUS[d.status][1]}>{STATUS[d.status][0]}</Badge>
              <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                দেখুন <ExternalLink className="size-3.5" />
              </a>
              {d.status !== "APPROVED" ? (
                <Button size="sm" variant="ghost" icon={Trash2} className="text-danger hover:bg-danger-soft" onClick={() => remove.mutate(d.id, { onError: fail })}>
                  মুছুন
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
