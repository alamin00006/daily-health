"use client";

import { hardNavigate } from "@/lib/hard-navigate";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { EmailCodeSteps } from "@/components/auth/email-code-steps";
import { NewPinForm } from "@/components/auth/pin-fields";
import { api, isApiError } from "@/lib/api-client";

/** Email → code → PIN; then onboarding asks for the professional details. */
export default function SignupPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthShell
      title="অ্যাকাউন্ট খুলুন"
      subtitle={token ? "প্যানেল আর অ্যাপে লগইনের জন্য একটি পিন বেছে নিন" : "প্রথমে আপনার ইমেইল যাচাই করি"}
    >
      <ol className="mb-6 flex gap-2 text-xs font-medium">
        {["ইমেইল", "পিন", "পেশাগত তথ্য"].map((step, index) => {
          const active = index === (token ? 1 : 0);
          return (
            <li key={step} className={`flex-1 rounded-full px-3 py-1.5 text-center ${active ? "bg-primary text-white" : "bg-mint text-muted"}`}>
              {step}
            </li>
          );
        })}
      </ol>
      {token ? (
        <NewPinForm
          submitLabel="অ্যাকাউন্ট খুলুন"
          error={error}
          onSubmit={async (pin) => {
            setError(null);
            try {
              await api.auth("signup", { verificationToken: token, pin });
              hardNavigate("/onboarding");
            } catch (e) {
              if (isApiError(e) && e.code === "VERIFICATION_TOKEN_INVALID") setToken(null);
              setError(isApiError(e) ? e.userMessage : "অ্যাকাউন্ট খোলা যায়নি।");
            }
          }}
        />
      ) : (
        <EmailCodeSteps purpose="SIGNUP" submitLabel="যাচাই করুন" onVerified={(value) => setToken(value)} />
      )}
      <p className="mt-8 border-t border-line pt-6 text-center text-sm text-muted">
        আগেই অ্যাকাউন্ট আছে (অ্যাপেও চলবে)?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          লগইন করুন
        </Link>
      </p>
    </AuthShell>
  );
}
