"use client";

import { Banknote, CalendarDays, Lightbulb, ShieldCheck, Siren, UserRound, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, ErrorBox, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useAdminDashboard } from "@/features/staff-queries";
import { isApiError } from "@/lib/api-client";
import { bn, dhakaDate, formatDayLong } from "@/lib/format";

function Stat({
  icon,
  label,
  value,
  hint,
  href,
  alert,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint?: string;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <Card className={`flex h-full items-center gap-4 p-4 ${alert ? "border-danger/40 bg-danger-soft" : ""} ${href ? "hover:border-primary/40" : ""}`}>
      <div className={`flex size-11 items-center justify-center rounded-xl ${alert ? "bg-danger text-white" : "bg-mint text-primary"}`}>{icon}</div>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold">{bn(value)}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** The admin's home: what needs attention today. */
export default function AdminDashboardPage() {
  const dashboard = useAdminDashboard();
  const d = dashboard.data;
  return (
    <>
      <PageHeader title="অ্যাডমিন ড্যাশবোর্ড" subtitle={formatDayLong(dhakaDate())} />
      {dashboard.isPending ? (
        <Skeleton className="h-64" />
      ) : dashboard.isError || !d ? (
        <ErrorBox message={isApiError(dashboard.error) ? dashboard.error.userMessage : "লোড হয়নি"} onRetry={() => void dashboard.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat icon={<Siren className="size-5" />} label="চলমান জরুরি অনুরোধ" value={d.liveEmergencies} href="/admin/emergencies" alert={d.liveEmergencies > 0} />
          <Stat icon={<ShieldCheck className="size-5" />} label="যাচাইয়ের অপেক্ষায় সেবাদাতা" value={d.providersPendingVerification} href="/admin/verification" />
          <Stat icon={<Banknote className="size-5" />} label="ফেরতের অপেক্ষায় টাকা" value={d.refundsWaiting} href="/admin/payments" hint="shurjoPay-এর ফেরত হাতে করতে হয়" />
          <Stat icon={<CalendarDays className="size-5" />} label="আজকের নিশ্চিত অ্যাপয়েন্টমেন্ট" value={d.appointmentsToday} />
          <Stat icon={<Users className="size-5" />} label="অ্যাকাউন্ট" value={d.accounts.total} hint={`গত ৭ দিনে নতুন ${bn(d.accounts.newLast7Days)}`} href="/admin/users" />
          <Stat icon={<UserRound className="size-5" />} label="রোগীর প্রোফাইল" value={d.patientProfiles} />
          <Stat icon={<Lightbulb className="size-5" />} label="প্রকাশিত স্বাস্থ্য টিপস" value={d.publishedHealthTips} href="/admin/health-tips" />
        </div>
      )}
    </>
  );
}
