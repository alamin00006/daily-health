"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCalendar } from "@/features/panel-queries";
import { addDays, BANGLA_WEEKDAYS_SHORT, bn, dhakaDate, weekdayOf } from "@/lib/format";

const DAYS = 14;

/** Two weeks of days with booking counts; ‹ › move by a week. */
export function DayStrip({ from, selected, onFromChange, onSelect }: { from: string; selected: string; onFromChange: (from: string) => void; onSelect: (date: string) => void }) {
  const calendar = useCalendar(from, DAYS);
  const today = dhakaDate();
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="আগের সপ্তাহ" className="rounded-lg border border-line bg-white p-2 hover:bg-mint" onClick={() => onFromChange(addDays(from, -7))}>
        <ChevronLeft className="size-4" />
      </button>
      <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
        {Array.from({ length: DAYS }, (_, index) => {
          const date = addDays(from, index);
          const counts = calendar.data?.find((d) => d.date === date);
          const total = (counts?.confirmed ?? 0) + (counts?.pendingPayment ?? 0) + (counts?.completed ?? 0);
          const active = date === selected;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(date)}
              className={clsx(
                "flex min-w-16 flex-col items-center rounded-xl border px-2 py-2 text-sm transition-colors",
                active ? "border-primary bg-primary text-white" : "border-line bg-white hover:border-primary/40",
              )}
            >
              <span className={clsx("text-xs", active ? "text-white/80" : "text-muted")}>{date === today ? "আজ" : BANGLA_WEEKDAYS_SHORT[weekdayOf(date)]}</span>
              <span className="text-lg font-semibold">{bn(Number(date.slice(8)))}</span>
              <span className={clsx("mt-0.5 h-4 text-[11px]", active ? "text-white/90" : total ? "text-primary" : "text-transparent")}>{total ? `${bn(total)} জন` : "—"}</span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="পরের সপ্তাহ" className="rounded-lg border border-line bg-white p-2 hover:bg-mint" onClick={() => onFromChange(addDays(from, 7))}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
