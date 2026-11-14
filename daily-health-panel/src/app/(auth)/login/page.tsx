"use client";

import { hardNavigate } from "@/lib/hard-navigate";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { EmailCodeSteps } from "@/components/auth/email-code-steps";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api, isApiError } from "@/lib/api-client";

const loginForm = z.object({
  email: z.string().trim().toLowerCase().email("সঠিক ইমেইল লিখুন"),
  pin: z.string().regex(/^\d{6}$/, "৬ সংখ্যার পিন লিখুন"),
});

/** Full page load after login: the panel layout starts with fresh data. */
function goNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  hardNavigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export default function LoginPage() {
  const [mode, setMode] = useState<"pin" | "code">("pin");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(loginForm), defaultValues: { email: "", pin: "" } });

  async function loginWithPin(values: z.infer<typeof loginForm>) {
    setError(null);
    try {
      await api.auth("login", values);
      goNext();
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : "লগইন করা যায়নি।");
    }
  }

  return (
    <AuthShell title="লগইন করুন" subtitle="দৈনিক স্বাস্থ্য অ্যাপের একই ইমেইল আর পিন দিয়ে">
      <div role="tablist" className="mb-6 grid grid-cols-2 rounded-xl bg-mint p-1 text-sm font-medium">
        {(["pin", "code"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={mode === tab}
            onClick={() => {
              setMode(tab);
              setError(null);
            }}
            className={`rounded-lg py-2 transition-colors ${mode === tab ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {tab === "pin" ? "পিন দিয়ে" : "ইমেইল কোড দিয়ে"}
          </button>
        ))}
      </div>

      {mode === "pin" ? (
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(loginWithPin)} noValidate>
          <Field label="ইমেইল" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" placeholder="doctor@example.com" {...form.register("email")} aria-invalid={Boolean(form.formState.errors.email)} />
          </Field>
          <Field label="পিন" htmlFor="pin" error={form.formState.errors.pin?.message}>
            <Input id="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} {...form.register("pin")} aria-invalid={Boolean(form.formState.errors.pin)} />
          </Field>
          {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
          <Button type="submit" icon={LogIn} loading={form.formState.isSubmitting}>
            লগইন
          </Button>
          <Link href="/reset-pin" className="text-center text-sm font-medium text-primary hover:underline">
            পিন ভুলে গেছেন?
          </Link>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <EmailCodeSteps
            purpose="LOGIN"
            submitLabel="লগইন"
            onVerified={async (verificationToken) => {
              try {
                await api.auth("login-otp", { verificationToken });
                goNext();
              } catch (e) {
                setError(isApiError(e) ? e.userMessage : "লগইন করা যায়নি।");
              }
            }}
          />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </div>
      )}

      <p className="mt-8 border-t border-line pt-6 text-center text-sm text-muted">
        নতুন ডাক্তার, পুষ্টিবিদ বা ফিজিওথেরাপিস্ট?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          অ্যাকাউন্ট খুলুন
        </Link>
      </p>
    </AuthShell>
  );
}
