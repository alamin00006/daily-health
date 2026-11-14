"use client";

import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, FileCheck2, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { Button, Card, CardHeader, ErrorBox, PageHeader, Skeleton } from "@/components/ui/primitives";
import { providerTitle } from "@/features/labels";
import { useCalendar, useDay, useMyProvider } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { addDays, bn, dhakaDate, formatDate, formatDayLong } from "@/lib/format";

function greeting(): string {
  const hour = Number(new Date(Date.now() + 6 * 3600_000).toISOString().slice(11, 13));
  if (hour < 12) return "শুভ সকাল";
  if (hour < 17) return "শুভ দুপুর";
  return "শুভ সন্ধ্যা";
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number | undefined; tone: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={`flex size-11 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold">{value === undefined ? "—" : bn(value)}</p>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const provider = useMyProvider();
  const today = dhakaDate();
  const day = useDay(today, Boolean(provider.data));
  const week = useCalendar(today, 7, Boolean(provider.data));
  const p = provider.data;
  if (!p) return <Skeleton className="h-64" />;

  const rows = day.data ?? [];
  const waiting = rows.filter((r) => r.status === "CONFIRMED").length;
  const done = rows.filter((r) => r.status === "COMPLETED").length;
  const weekTotal = week.data?.reduce((sum, d) => sum + d.confirmed + d.pendingPayment, 0);
  const setupMissing = p.allChambers.length === 0 && p.allSchedules.length === 0;

  return (
    <>
      <PageHeader title={`${greeting()}, ${providerTitle(p.type, p.displayName)}`} subtitle={formatDayLong(today)} />

      {p.verificationStatus !== "VERIFIED" ? (
        <div className={`mb-6 flex flex-wrap items-start gap-3 rounded-2xl border p-4 ${p.verificationStatus === "REJECTED" ? "border-danger/25 bg-danger-soft" : "border-warning/25 bg-warning-soft"}`}>
          <AlertTriangle className={`mt-0.5 size-5 ${p.verificationStatus === "REJECTED" ? "text-danger" : "text-warning"}`} />
          <div className="flex-1">
            <p className="font-semibold">
              {p.verificationStatus === "REJECTED" ? "প্রোফাইলে সংশোধন দরকার" : "প্রোফাইল যাচাইয়ের অপেক্ষায়"}
            </p>
            <p className="text-sm text-ink/80">
              {p.verificationStatus === "REJECTED"
                ? `কারণ: ${p.rejectionReason}`
                : p.missingForVerification.length
                  ? "যাচাই শুরু করতে কাগজপত্র আর চেম্বার বা অনলাইন ফি দিন। যাচাইয়ের আগে রোগীরা আপনাকে দেখবেন না।"
                  : "অ্যাডমিন আপনার কাগজপত্র দেখছেন। সাধারণত ১–২ কর্মদিবস লাগে।"}
            </p>
          </div>
          <Link href="/profile">
            <Button size="sm" variant="outline" icon={FileCheck2}>প্রোফাইল দেখুন</Button>
          </Link>
        </div>
      ) : null}

      {setupMissing ? (
        <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
          <CalendarClock className="size-8 text-primary" />
          <div className="flex-1">
            <p className="font-semibold">চেম্বার আর সময়সূচি যোগ করুন</p>
            <p className="text-sm text-muted">কোথায়, কোন দিন, কয়টা থেকে কয়টা বসেন — দিলে রোগীরা সিরিয়াল নিতে পারবেন।</p>
          </div>
          <Link href="/schedule"><Button icon={ArrowRight}>সময়সূচি ঠিক করুন</Button></Link>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Users className="size-5" />} label="আজ বাকি" value={day.data ? waiting : undefined} tone="bg-mint text-primary" />
        <Stat icon={<CheckCircle2 className="size-5" />} label="আজ দেখা হয়েছে" value={day.data ? done : undefined} tone="bg-success-soft text-success" />
        <Stat icon={<Clock3 className="size-5" />} label="আগামী ৭ দিনে বুকিং" value={weekTotal} tone="bg-info-soft text-info" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="আজকের তালিকা"
          subtitle={formatDate(today)}
          action={<Link href="/appointments" className="text-sm font-semibold text-primary hover:underline">সব দিন দেখুন</Link>}
        />
        <div className="p-4 sm:p-5">
          {day.isPending ? (
            <Skeleton className="h-40" />
          ) : day.isError ? (
            <ErrorBox message={isApiError(day.error) ? day.error.userMessage : "লোড করা যায়নি"} onRetry={() => void day.refetch()} />
          ) : (
            <AppointmentList rows={rows} emptyText={`আজ কোনো বুকিং নেই। আগামীকাল (${formatDate(addDays(today, 1), false)}) দেখতে অ্যাপয়েন্টমেন্ট পাতায় যান।`} />
          )}
        </div>
      </Card>
    </>
  );
}
