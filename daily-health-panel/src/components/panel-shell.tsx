"use client";

import { hardNavigate } from "@/lib/hard-navigate";
import { clsx } from "clsx";
import {
  Apple,
  BadgePercent,
  Banknote,
  Boxes,
  CalendarDays,
  Clock3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  MessagesSquare,
  Palette,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Store,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Skeleton, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PROVIDER_TYPE_LABEL, providerTitle, VERIFICATION_LABEL } from "@/features/labels";
import { useQuickQueue } from "@/features/consultation-queries";
import { useLiveEmergencyCount } from "@/features/staff-queries";
import { useMe, useMyProvider, useSetOnline } from "@/features/panel-queries";
import { api, isApiError } from "@/lib/api-client";
import { bn } from "@/lib/format";
import { RealtimeProvider, useRealtimeEvent } from "@/lib/realtime";
import { REALTIME_EVENTS } from "@/shared-contracts/realtime.contract";
import { useQueryClient } from "@tanstack/react-query";

const PROVIDER_NAV = [
  { href: "/", label: "ড্যাশবোর্ড", icon: LayoutDashboard },
  { href: "/appointments", label: "অ্যাপয়েন্টমেন্ট", icon: CalendarDays },
  { href: "/consultations", label: "পরামর্শ", icon: MessagesSquare },
  { href: "/prescriptions", label: "প্রেসক্রিপশন", icon: FileText },
  { href: "/diet-plans", label: "ডায়েট চার্ট", icon: Apple },
  { href: "/schedule", label: "চেম্বার ও সময়সূচি", icon: Clock3 },
  { href: "/earnings", label: "আয় ও পেআউট", icon: Wallet },
  { href: "/profile", label: "প্রোফাইল ও কাগজপত্র", icon: UserRound },
];
/** Admins and moderators. */
const STAFF_NAV = [
  { href: "/admin/emergencies", label: "জরুরি সেবা", icon: Siren },
  { href: "/admin/health-tips", label: "স্বাস্থ্য টিপস", icon: Lightbulb },
  { href: "/admin/community", label: "কমিউনিটি", icon: MessagesSquare },
  { href: "/admin/shop/orders", label: "হেলথস্টোর অর্ডার", icon: ShoppingBag },
  { href: "/admin/shop/products", label: "পণ্য ও স্টক", icon: Boxes },
];
const ADMIN_NAV = [
  { href: "/admin", label: "অ্যাডমিন ড্যাশবোর্ড", icon: LayoutDashboard },
  ...STAFF_NAV,
  { href: "/admin/verification", label: "সেবাদাতা যাচাই", icon: ShieldCheck },
  { href: "/admin/payments", label: "রিফান্ড ও পেআউট", icon: Banknote },
  { href: "/admin/quick-consult", label: "দ্রুত পরামর্শের দাম", icon: BadgePercent },
  { href: "/admin/shop", label: "হেলথস্টোর সেটিংস", icon: Store },
  { href: "/admin/branding", label: "অ্যাপের রং", icon: Palette },
  { href: "/admin/users", label: "ব্যবহারকারী ও স্টাফ", icon: Users },
  { href: "/admin/audit", label: "অডিট লগ", icon: ScrollText },
];

/** Staff anywhere in the panel hear about a new SOS at once (toast + badge refresh). */
function StaffEmergencyAlerts() {
  const client = useQueryClient();
  const toast = useToast();
  useRealtimeEvent(REALTIME_EVENTS.EMERGENCY_NEW, () => {
    void client.invalidateQueries({ queryKey: ["staff", "emergencies"] });
    toast("নতুন জরুরি অনুরোধ এসেছে; জরুরি সেবা পাতা দেখুন", "error");
  });
  useRealtimeEvent(REALTIME_EVENTS.EMERGENCY_UPDATED, () => {
    void client.invalidateQueries({ queryKey: ["staff", "emergencies"] });
  });
  return null;
}

/**
 * Sidebar layout for logged-in pages. Sends an account without a provider
 * profile to onboarding (admins without one see only the admin pages).
 */
export function PanelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const isAdmin = me.data?.role === "ADMIN";
  const isModerator = me.data?.role === "MODERATOR";
  const isStaff = isAdmin || isModerator;
  const staffHome = isAdmin ? "/admin" : "/admin/emergencies";
  const provider = useMyProvider(Boolean(me.data));
  const setOnline = useSetOnline();
  const [menuOpen, setMenuOpen] = useState(false);

  const hasProvider = Boolean(provider.data);
  useEffect(() => {
    if (provider.data === null && me.data && !isStaff) router.replace("/onboarding");
    if (provider.data === null && isStaff && !pathname.startsWith("/admin")) router.replace(staffHome);
  }, [provider.data, me.data, isStaff, staffHome, pathname, router]);

  const nav = [...(hasProvider ? PROVIDER_NAV : []), ...(isAdmin ? ADMIN_NAV : isModerator ? STAFF_NAV : [])];
  const liveEmergencies = useLiveEmergencyCount(isStaff);
  const p = provider.data;
  const queue = useQuickQueue(Boolean(p && p.verificationStatus === "VERIFIED" && p.acceptsQuickConsult && p.isOnline));
  const waiting = queue.data?.length ?? 0;
  const loading = me.isPending || provider.isPending;

  async function logout() {
    await api.auth("logout");
    hardNavigate("/login");
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <Link href="/" className="mb-6 flex items-center gap-3 px-2">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
          <HeartPulse className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-lg font-bold text-primary">দৈনিক স্বাস্থ্য</p>
          <p className="text-xs text-muted">{isStaff && !hasProvider ? (isAdmin ? "অ্যাডমিন প্যানেল" : "মডারেটর প্যানেল") : "সেবাদাতা প্যানেল"}</p>
        </div>
      </Link>
      {loading
        ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)
        : nav.map((item) => {
            const active = ["/", "/admin", "/admin/shop"].includes(item.href) ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={clsx(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors",
                  active ? "bg-primary text-white" : "text-ink hover:bg-mint",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
                {item.href === "/consultations" && waiting > 0 ? (
                  <span className={clsx("ml-auto rounded-full px-2 text-xs font-bold", active ? "bg-white text-primary" : "bg-warning text-white")} aria-label={`${bn(waiting)} জন অপেক্ষায়`}>
                    {bn(waiting)}
                  </span>
                ) : null}
                {item.href === "/admin/emergencies" && (liveEmergencies.data ?? 0) > 0 ? (
                  <span className={clsx("ml-auto rounded-full px-2 text-xs font-bold", active ? "bg-white text-danger" : "bg-danger text-white")} aria-label={`${bn(liveEmergencies.data ?? 0)}টি চলমান`}>
                    {bn(liveEmergencies.data ?? 0)}
                  </span>
                ) : null}
              </Link>
            );
          })}
      <div className="mt-auto border-t border-line pt-4">
        <p className="truncate px-3 text-sm text-muted">{me.data?.email}</p>
        <button type="button" onClick={logout} className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-ink hover:bg-danger-soft hover:text-danger">
          <LogOut className="size-5" /> লগআউট
        </button>
      </div>
    </nav>
  );

  return (
    <RealtimeProvider enabled={Boolean(me.data)}>
    {isStaff ? <StaffEmergencyAlerts /> : null}
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr] print:block">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-white lg:block print:!hidden">{sidebar}</aside>
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="মেনু বন্ধ করুন" className="absolute inset-0 bg-ink/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 print:hidden items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button type="button" aria-label="মেনু" className="rounded-lg p-2 hover:bg-mint lg:hidden" onClick={() => setMenuOpen(true)}>
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          {provider.data ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{providerTitle(provider.data.type, provider.data.displayName)}</p>
                <p className="truncate text-xs text-muted">
                  {PROVIDER_TYPE_LABEL[provider.data.type]} · {provider.data.providerCode}
                  {provider.data.bmdcNo ? ` · BMDC ${provider.data.bmdcNo}` : ""}
                </p>
              </div>
              {provider.data.verificationStatus === "VERIFIED" ? (
                <label className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
                  <span className={clsx("size-2 rounded-full", provider.data.isOnline ? "bg-success" : "bg-muted/40")} />
                  <span className="hidden sm:inline">{provider.data.isOnline ? "অনলাইনে আছেন" : "অফলাইন"}</span>
                  <Switch
                    label="অনলাইন"
                    checked={provider.data.isOnline}
                    disabled={setOnline.isPending}
                    onChange={(value) =>
                      setOnline.mutate(value, {
                        onSuccess: () => toast(value ? "আপনি এখন অনলাইনে; রোগীরা তালিকার উপরে দেখবেন" : "অফলাইন হয়েছেন"),
                        onError: (e) => toast(isApiError(e) ? e.userMessage : "বদলানো যায়নি", "error"),
                      })
                    }
                  />
                </label>
              ) : (
                <Link href="/profile" className="rounded-full bg-warning-soft px-3 py-1.5 text-sm font-medium text-warning">
                  {VERIFICATION_LABEL[provider.data.verificationStatus]}
                </Link>
              )}
            </>
          ) : (
            <p className="flex-1 font-semibold">{isAdmin ? "অ্যাডমিন" : isModerator ? "মডারেটর" : ""}</p>
          )}
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{loading ? <Skeleton className="h-64" /> : children}</main>
      </div>
    </div>
    </RealtimeProvider>
  );
}
