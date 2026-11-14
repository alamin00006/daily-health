"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { DayStrip } from "@/components/appointments/day-strip";
import { Button, ErrorBox, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useDay } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { addDays, dhakaDate, formatDayLong, relativeDay } from "@/lib/format";

export default function AppointmentsPage() {
  const today = dhakaDate();
  const [from, setFrom] = useState(addDays(today, -2));
  const [date, setDate] = useState(today);
  const day = useDay(date);
  const label = relativeDay(date);

  return (
    <>
      <PageHeader
        title="অ্যাপয়েন্টমেন্ট"
        subtitle={`${label ? `${label}, ` : ""}${formatDayLong(date)}`}
        action={
          <Button variant="outline" size="sm" icon={RefreshCw} loading={day.isFetching} onClick={() => void day.refetch()}>
            রিফ্রেশ
          </Button>
        }
      />
      <DayStrip from={from} selected={date} onFromChange={setFrom} onSelect={setDate} />
      <div className="mt-6">
        {day.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : day.isError ? (
          <ErrorBox message={isApiError(day.error) ? day.error.userMessage : "লোড করা যায়নি"} onRetry={() => void day.refetch()} />
        ) : (
          <AppointmentList rows={day.data} emptyText="এই দিনে কেউ বুক করেননি। সময়সূচি পাতায় সেশন আর ছুটির দিন দেখুন।" />
        )}
      </div>
    </>
  );
}
