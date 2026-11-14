"use client";

import { hardNavigate } from "@/lib/hard-navigate";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { EmailCodeSteps } from "@/components/auth/email-code-steps";
import { NewPinForm } from "@/components/auth/pin-fields";
import { api, isApiError } from "@/lib/api-client";

/** Forgotten PIN: verify the email, choose a new PIN, logged in afterwards. */
export default function ResetPinPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthShell title="নতুন পিন" subtitle="ইমেইলে কোড নিয়ে নতুন পিন ঠিক করুন। অন্য সব ডিভাইস থেকে লগআউট হয়ে যাবে।">
      {token ? (
        <NewPinForm
          submitLabel="পিন বদলান"
          error={error}
          onSubmit={async (newPin) => {
            setError(null);
            try {
              await api.auth("pin-reset", { verificationToken: token, newPin });
              hardNavigate("/");
            } catch (e) {
              if (isApiError(e) && e.code === "VERIFICATION_TOKEN_INVALID") setToken(null);
              setError(isApiError(e) ? e.userMessage : "পিন বদলানো যায়নি।");
            }
          }}
        />
      ) : (
        <EmailCodeSteps purpose="RESET_PIN" submitLabel="যাচাই করুন" onVerified={(value) => setToken(value)} />
      )}
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          লগইনে ফিরে যান
        </Link>
      </p>
    </AuthShell>
  );
}
