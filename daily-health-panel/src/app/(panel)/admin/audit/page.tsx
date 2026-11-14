"use client";

import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/features/labels";
import { useAuditLogs } from "@/features/staff-queries";
import { isApiError } from "@/lib/api-client";
import { formatInstant } from "@/lib/format";

/** Who viewed or changed whose health data (written by every module). */
export default function AuditPage() {
  const [draft, setDraft] = useState({ patientCode: "", actorEmail: "", action: "" });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const logs = useAuditLogs(filters);
  const rows = logs.data?.pages.flatMap((p) => p.data) ?? [];

  const apply = () =>
    setFilters(Object.fromEntries(Object.entries(draft).flatMap(([k, v]) => (v.trim() ? [[k, v.trim()]] : []))));

  return (
    <>
      <PageHeader
        title="অডিট লগ"
        subtitle="কে কখন কোন রোগীর স্বাস্থ্য তথ্য দেখেছেন বা বদলেছেন। এখানে কোনো স্বাস্থ্য তথ্য দেখানো হয় না, শুধু কাজের নাম।"
      />
      <Card className="mb-4 p-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Field label="রোগীর আইডি" htmlFor="f-patient">
            <Input id="f-patient" placeholder="PR-2611-0042" value={draft.patientCode} onChange={(e) => setDraft({ ...draft, patientCode: e.target.value })} />
          </Field>
          <Field label="কে করেছেন (ইমেইল)" htmlFor="f-actor">
            <Input id="f-actor" type="email" placeholder="name@example.com" value={draft.actorEmail} onChange={(e) => setDraft({ ...draft, actorEmail: e.target.value })} />
          </Field>
          <Field label="কাজ (শুরুর অংশ)" htmlFor="f-action">
            <Input id="f-action" placeholder="prescription. / emergency." value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
          </Field>
          <Button type="submit" icon={Search}>
            খুঁজুন
          </Button>
        </form>
      </Card>
      {logs.isPending ? (
        <Skeleton className="h-64" />
      ) : logs.isError ? (
        <ErrorBox message={isApiError(logs.error) ? logs.error.userMessage : "লোড হয়নি"} onRetry={() => void logs.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={ScrollText} title="কিছু পাওয়া যায়নি" message="খোঁজার শর্ত বদলে দেখুন।" />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">সময়</th>
                <th className="px-4 py-3 font-medium">কে</th>
                <th className="px-4 py-3 font-medium">কাজ</th>
                <th className="px-4 py-3 font-medium">কার তথ্য</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/60 align-top">
                  <td className="whitespace-nowrap px-4 py-3">{formatInstant(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    {row.actor ? (
                      <>
                        <p className="font-medium">{row.actor.name ?? row.actor.email}</p>
                        <p className="text-xs text-muted">
                          {ROLE_LABEL[row.actor.role]}
                          {row.actor.code ? ` · ${row.actor.code}` : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted">লগইন ছাড়া (QR কার্ড স্ক্যান)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{row.action}</code>
                    {row.meta ? (
                      <p className="mt-1 text-xs text-muted">
                        {Object.entries(row.meta)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {row.patient ? (
                      <>
                        <p>{row.patient.fullName}</p>
                        <Badge tone="neutral">{row.patient.patientCode}</Badge>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {logs.hasNextPage ? (
        <Button className="mt-4" variant="outline" loading={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
          আরও দেখুন
        </Button>
      ) : null}
    </>
  );
}
