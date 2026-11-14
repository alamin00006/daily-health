"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, EyeOff, Flag, ShieldCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api-client";
import { bn, formatInstant } from "@/lib/format";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type {
  BanScope,
  CommunityBanResponse,
  CommunityStaffCountsResponse,
  ReportReason,
  ReportStatus,
  StaffReportResponse,
  WomenMembershipResponse,
  WomenMembershipStatus,
} from "@/shared-contracts/community.contract";

const REASON_LABEL: Record<ReportReason, string> = {
  SPAM: "স্প্যাম",
  MISINFO: "ভুল তথ্য",
  ABUSE: "গালিগালাজ / হয়রানি",
  ADS: "বিজ্ঞাপন",
  PRIVACY: "ব্যক্তিগত তথ্য প্রকাশ",
  OTHER: "অন্য কারণ",
};
const MEMBERSHIP_LABEL: Record<WomenMembershipStatus, string> = {
  PENDING: "অনুরোধ এসেছে",
  APPROVED: "সদস্য",
  REJECTED: "বাতিল",
  REMOVED: "বের করে দেওয়া",
};

type Tab = "reports" | "requests" | "members" | "bans";
const next = <T,>(last: PaginatedResponse<T>) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined);
const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");

function useRefresh() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["staff", "community"] });
}

function ReportCard({ report }: { report: StaffReportResponse }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (body: { action: "HIDE" | "DISMISS" | "BAN"; banScope?: BanScope; note?: string }) =>
      api.post(`/staff/community/reports/${report.id}/resolve`, body),
    onSuccess: () => (refresh(), toast("সমাধান হয়েছে")),
    onError: fail(toast),
  });
  const t = report.target;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="danger">{REASON_LABEL[report.reason]}</Badge>
        <Badge>{report.targetType === "POST" ? "পোস্ট" : "উত্তর"}</Badge>
        {t?.space === "WOMEN" ? <Badge tone="warning">নারী কমিউনিটি</Badge> : null}
        {report.reportCount > 1 ? <Badge tone="danger">{bn(report.reportCount)} জন রিপোর্ট করেছেন</Badge> : null}
        <span className="text-xs text-muted">{formatInstant(report.createdAt)} · {report.reporterName ?? "সদস্য"}</span>
      </div>
      {t ? (
        <div className="rounded-xl bg-surface p-3 text-sm">
          {t.title ? <p className="font-semibold">{t.title}</p> : null}
          <p className="whitespace-pre-wrap">{t.body}</p>
          <p className="mt-2 text-xs text-muted">
            লেখক: {t.authorName ?? "—"}
            {t.isAnonymous ? " (অন্যরা বেনামী দেখেন)" : ""} · অবস্থা: {t.status === "PUBLISHED" ? "দেখা যাচ্ছে" : t.status === "HIDDEN" ? "লুকানো" : "মুছে ফেলা"}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">লেখাটি আর নেই।</p>
      )}
      {report.note ? <p className="text-sm">রিপোর্টকারীর নোট: {report.note}</p> : null}
      {report.status === "OPEN" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="নোট" placeholder="নোট (ঐচ্ছিক)" value={note} onChange={(e) => setNote(e.target.value)} className="w-56" />
          <Button size="sm" icon={EyeOff} loading={resolve.isPending} onClick={() => resolve.mutate({ action: "HIDE", note: note || undefined })}>
            লুকান
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Ban}
            loading={resolve.isPending}
            onClick={() => {
              if (window.confirm("লুকিয়ে লেখককে কমিউনিটিতে লেখা থেকে বন্ধ করবেন?")) {
                resolve.mutate({ action: "BAN", banScope: t?.space === "WOMEN" ? "WOMEN" : "ALL", note: note || undefined });
              }
            }}
          >
            লুকান ও ব্যান
          </Button>
          <Button size="sm" variant="outline" icon={X} loading={resolve.isPending} onClick={() => resolve.mutate({ action: "DISMISS", note: note || undefined })}>
            সমস্যা নেই
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {report.status === "RESOLVED" ? "ব্যবস্থা নেওয়া হয়েছে" : "খারিজ"} · {report.resolvedByName ?? ""} {report.resolvedAt ? formatInstant(report.resolvedAt) : ""}
        </p>
      )}
    </Card>
  );
}

function ReportsTab() {
  const [status, setStatus] = useState<ReportStatus>("OPEN");
  const reports = useInfiniteQuery({
    queryKey: ["staff", "community", "reports", status],
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<StaffReportResponse>>("/staff/community/reports", { status, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: next,
  });
  const rows = reports.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="space-y-3">
      <Select aria-label="অবস্থা" value={status} onChange={(e) => setStatus(e.target.value as ReportStatus)} className="w-auto">
        <option value="OPEN">খোলা রিপোর্ট</option>
        <option value="RESOLVED">ব্যবস্থা নেওয়া</option>
        <option value="DISMISSED">খারিজ</option>
      </Select>
      {reports.isPending ? (
        <Skeleton className="h-40" />
      ) : reports.isError ? (
        <ErrorBox message={isApiError(reports.error) ? reports.error.userMessage : "লোড হয়নি"} onRetry={() => void reports.refetch()} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Flag} title="কোনো রিপোর্ট নেই" message="সব ঠিক আছে।" /></Card>
      ) : (
        rows.map((r) => <ReportCard key={r.id} report={r} />)
      )}
      {reports.hasNextPage ? (
        <Button variant="outline" loading={reports.isFetchingNextPage} onClick={() => void reports.fetchNextPage()}>আরও দেখুন</Button>
      ) : null}
    </div>
  );
}

function MembersTab({ status }: { status: WomenMembershipStatus }) {
  const toast = useToast();
  const refresh = useRefresh();
  const members = useInfiniteQuery({
    queryKey: ["staff", "community", "women", status],
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<WomenMembershipResponse>>("/staff/community/women/members", { status, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: next,
  });
  const decide = useMutation({
    mutationFn: ({ userId, action, note }: { userId: string; action: "approve" | "reject" | "remove"; note?: string }) =>
      api.post(`/staff/community/women/${userId}/${action}`, { note }),
    onSuccess: () => (refresh(), toast("হয়েছে")),
    onError: fail(toast),
  });
  const rows = members.data?.pages.flatMap((p) => p.data) ?? [];
  const ask = (label: string) => window.prompt(label) ?? undefined;
  return (
    <div className="space-y-3">
      {status === "PENDING" ? (
        <p className="text-sm text-muted">
          শুধু যাদের নিজের প্রোফাইলে লিঙ্গ &ldquo;নারী&rdquo;, তারাই অনুরোধ পাঠাতে পারেন। নাম আর আইডি দেখে নিশ্চিত হয়ে অনুমোদন দিন।
        </p>
      ) : null}
      {members.isPending ? (
        <Skeleton className="h-40" />
      ) : members.isError ? (
        <ErrorBox message={isApiError(members.error) ? members.error.userMessage : "লোড হয়নি"} onRetry={() => void members.refetch()} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Users} title="কেউ নেই" message="এই তালিকা খালি।" /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.name ?? "নাম নেই"} {m.patientCode ? <span className="text-muted">({m.patientCode})</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {m.email ?? ""} · অনুরোধ {formatInstant(m.requestedAt)}
                    {m.decidedByName ? ` · ${m.decidedByName}` : ""}
                  </p>
                  {m.requestNote ? <p className="text-sm">&ldquo;{m.requestNote}&rdquo;</p> : null}
                  {m.decisionNote ? <p className="text-xs text-muted">নোট: {m.decisionNote}</p> : null}
                </div>
                <Badge tone={m.status === "APPROVED" ? "success" : m.status === "PENDING" ? "warning" : "neutral"}>{MEMBERSHIP_LABEL[m.status]}</Badge>
                {m.status === "PENDING" ? (
                  <>
                    <Button size="sm" icon={Check} loading={decide.isPending} onClick={() => decide.mutate({ userId: m.userId, action: "approve" })}>
                      অনুমোদন
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={X}
                      onClick={() => {
                        const note = ask("কেন বাতিল? (তিনি দেখবেন)");
                        if (note !== undefined) decide.mutate({ userId: m.userId, action: "reject", note });
                      }}
                    >
                      বাতিল
                    </Button>
                  </>
                ) : m.status === "APPROVED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={UserMinus}
                    onClick={() => {
                      const note = ask("কেন বের করে দিচ্ছেন?");
                      if (note !== undefined) decide.mutate({ userId: m.userId, action: "remove", note });
                    }}
                  >
                    বের করে দিন
                  </Button>
                ) : m.status === "REMOVED" ? (
                  <Button size="sm" variant="outline" icon={UserPlus} onClick={() => decide.mutate({ userId: m.userId, action: "approve" })}>
                    আবার যোগ করুন
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {members.hasNextPage ? (
        <Button variant="outline" loading={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>আরও দেখুন</Button>
      ) : null}
    </div>
  );
}

function BansTab() {
  const toast = useToast();
  const refresh = useRefresh();
  const bans = useQuery({
    queryKey: ["staff", "community", "bans"],
    queryFn: () => api.get<PaginatedResponse<CommunityBanResponse>>("/staff/community/bans", { limit: 50 }),
  });
  const unban = useMutation({
    mutationFn: ({ userId, scope }: { userId: string; scope: BanScope }) => api.delete(`/staff/community/bans/${userId}/${scope}`),
    onSuccess: () => (refresh(), toast("ব্যান তুলে নেওয়া হয়েছে")),
    onError: fail(toast),
  });
  const rows = bans.data?.data ?? [];
  return bans.isPending ? (
    <Skeleton className="h-32" />
  ) : rows.length === 0 ? (
    <Card><EmptyState icon={ShieldCheck} title="কেউ ব্যান নেই" message="রিপোর্ট থেকে ব্যান করলে এখানে দেখাবে।" /></Card>
  ) : (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map((b) => (
          <li key={`${b.userId}-${b.scope}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="font-medium">{b.name ?? "সদস্য"}</p>
              <p className="text-xs text-muted">{b.reason} · {b.bannedByName ?? ""}, {formatInstant(b.createdAt)}</p>
            </div>
            <Badge tone="danger">{b.scope === "ALL" ? "পুরো কমিউনিটি" : "নারী কমিউনিটি"}</Badge>
            <Button size="sm" variant="outline" loading={unban.isPending} onClick={() => unban.mutate({ userId: b.userId, scope: b.scope })}>
              ব্যান তুলুন
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Reports, the women's community join requests and members, and bans. */
export default function CommunityModerationPage() {
  const [tab, setTab] = useState<Tab>("reports");
  const counts = useQuery({
    queryKey: ["staff", "community", "counts"],
    queryFn: () => api.get<CommunityStaffCountsResponse>("/staff/community/counts"),
    refetchInterval: 60_000,
  });
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "reports", label: "রিপোর্ট", count: counts.data?.openReports },
    { key: "requests", label: "নারী কমিউনিটির অনুরোধ", count: counts.data?.pendingWomenRequests },
    { key: "members", label: "নারী কমিউনিটির সদস্য" },
    { key: "bans", label: "ব্যান" },
  ];
  return (
    <>
      <PageHeader title="কমিউনিটি" subtitle="রিপোর্ট দেখুন, নারী কমিউনিটিতে যোগ দেওয়ার অনুরোধ অনুমোদন করুন, নিয়ম ভাঙলে ব্যান করুন।" />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} size="sm" variant={tab === t.key ? "primary" : "outline"} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count ? ` (${bn(t.count)})` : ""}
          </Button>
        ))}
      </div>
      {tab === "reports" ? <ReportsTab /> : tab === "requests" ? <MembersTab status="PENDING" /> : tab === "members" ? <MembersTab status="APPROVED" /> : <BansTab />}
    </>
  );
}
