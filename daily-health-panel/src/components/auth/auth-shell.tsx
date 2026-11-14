import { HeartPulse, ShieldCheck, Stethoscope, CalendarCheck2 } from "lucide-react";
import type { ReactNode } from "react";

/** Two columns on desktop: what the panel is for, and the form. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/15">
            <HeartPulse className="size-6" />
          </div>
          <div>
            <p className="font-display text-xl font-bold leading-tight">দৈনিক স্বাস্থ্য</p>
            <p className="text-sm text-white/70">সেবাদাতা প্যানেল</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-bold leading-snug">রোগীর সিরিয়াল, সময়সূচি আর ফলো-আপ — এক জায়গায়</h2>
          <ul className="mt-8 space-y-4 text-white/85">
            <li className="flex gap-3"><CalendarCheck2 className="size-5 shrink-0" /> আজকের সিরিয়াল আর অনলাইন অ্যাপয়েন্টমেন্ট এক তালিকায়</li>
            <li className="flex gap-3"><Stethoscope className="size-5 shrink-0" /> চেম্বার, ভিডিও আর হোম ভিজিটের সময় নিজেই ঠিক করুন</li>
            <li className="flex gap-3"><ShieldCheck className="size-5 shrink-0" /> BMDC যাচাই করা ডাক্তারই শুধু রোগীরা দেখেন</li>
          </ul>
        </div>
        <p className="relative text-sm text-white/60">আপনার প্রতিদিনের ডিজিটাল স্বাস্থ্যসেবা</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
              <HeartPulse className="size-5" />
            </div>
            <p className="font-display text-lg font-bold text-primary">দৈনিক স্বাস্থ্য প্যানেল</p>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">{title}</h1>
          {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
