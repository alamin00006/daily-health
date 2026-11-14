"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api, isApiError } from "@/lib/api-client";
import { bn } from "@/lib/format";
import type { SendOtpResponse, VerifyOtpResponse } from "@/shared-contracts/auth.contract";

type Purpose = "SIGNUP" | "LOGIN" | "RESET_PIN";

const emailForm = z.object({ email: z.string().trim().toLowerCase().email("সঠিক ইমেইল লিখুন") });
const codeForm = z.object({ code: z.string().regex(/^\d{6}$/, "৬ সংখ্যার কোড লিখুন") });

/**
 * Step 1 and 2 of signup, code login and PIN reset: send a code to the email,
 * then verify it. Hands back the single-use verification token.
 */
export function EmailCodeSteps({
  purpose,
  submitLabel,
  onVerified,
}: {
  purpose: Purpose;
  submitLabel: string;
  onVerified: (token: string, email: string) => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const first = useForm({ resolver: zodResolver(emailForm), defaultValues: { email: "" } });
  const second = useForm({ resolver: zodResolver(codeForm), defaultValues: { code: "" } });

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function send(address: string) {
    setError(null);
    try {
      const res = await api.post<SendOtpResponse>("/auth/otp/send", { email: address, purpose });
      setEmail(address);
      setResendIn(res.resendAfterSec);
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : "কোড পাঠানো যায়নি।");
    }
  }

  async function verify(code: string) {
    if (!email) return;
    setError(null);
    try {
      const res = await api.post<VerifyOtpResponse>("/auth/otp/verify", { email, purpose, code });
      onVerified(res.verificationToken, email);
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : "কোড যাচাই করা যায়নি।");
    }
  }

  if (!email) {
    return (
      <form className="flex flex-col gap-5" onSubmit={first.handleSubmit((v) => send(v.email))} noValidate>
        <Field label="ইমেইল" htmlFor="email" error={first.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="doctor@example.com" {...first.register("email")} aria-invalid={Boolean(first.formState.errors.email)} />
        </Field>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" icon={Mail} loading={first.formState.isSubmitting}>
          কোড পাঠান
        </Button>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={second.handleSubmit((v) => verify(v.code))} noValidate>
      <p className="rounded-xl bg-mint px-4 py-3 text-sm text-primary">
        <strong>{email}</strong>-এ ৬ সংখ্যার কোড পাঠানো হয়েছে। স্প্যাম ফোল্ডারও দেখুন।
      </p>
      <Field label="কোড" htmlFor="code" error={second.formState.errors.code?.message}>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center text-2xl tracking-[0.5em]" {...second.register("code")} aria-invalid={Boolean(second.formState.errors.code)} />
      </Field>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={second.formState.isSubmitting}>
        {submitLabel}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-ink" onClick={() => setEmail(null)}>
          <ArrowLeft className="size-4" /> ইমেইল বদলান
        </button>
        <button type="button" disabled={resendIn > 0} className="font-medium text-primary disabled:text-muted" onClick={() => send(email)}>
          {resendIn > 0 ? `আবার পাঠান (${bn(resendIn)} সেকেন্ড)` : "আবার কোড পাঠান"}
        </button>
      </div>
    </form>
  );
}
