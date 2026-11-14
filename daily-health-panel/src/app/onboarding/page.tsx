"use client";

import { hardNavigate } from "@/lib/hard-navigate";
import { HeartPulse, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProviderDetailsForm } from "@/components/provider/provider-details-form";
import { Card, Skeleton } from "@/components/ui/primitives";
import { useMyProvider, useRegisterProvider } from "@/features/panel-queries";
import { api } from "@/lib/api-client";

/** After signup: the professional details that make a provider profile. */
export default function OnboardingPage() {
  const router = useRouter();
  const provider = useMyProvider();
  const register = useRegisterProvider();

  // Already registered (opened /onboarding again): go to the panel. Not after
  // registering here, which goes on to the profile page instead.
  useEffect(() => {
    if (provider.data && register.isIdle) router.replace("/");
  }, [provider.data, register.isIdle, router]);

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
              <HeartPulse className="size-5" />
            </div>
            <p className="font-display text-lg font-bold text-primary">দৈনিক স্বাস্থ্য প্যানেল</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
            onClick={async () => {
              await api.auth("logout");
              hardNavigate("/login");
            }}
          >
            <LogOut className="size-4" /> লগআউট
          </button>
        </div>
        <h1 className="font-display text-3xl font-bold">পেশাগত তথ্য দিন</h1>
        <p className="mt-2 text-muted">
          এগুলো রোগীরা আপনার প্রোফাইলে দেখবেন। এরপর কাগজপত্র আর সময়সূচি দিলে অ্যাডমিন যাচাই করবেন; যাচাইয়ের পরেই রোগীরা আপনাকে খুঁজে পাবেন।
        </p>
        <Card className="mt-6 p-5 sm:p-8">
          {provider.isPending ? (
            <Skeleton className="h-96" />
          ) : (
            <ProviderDetailsForm
              submitLabel="এগিয়ে যান"
              onSubmit={async (values) => {
                await register.mutateAsync({
                  type: values.type,
                  gender: values.gender,
                  displayName: values.displayName,
                  designation: values.designation || null,
                  qualifications: values.qualifications,
                  bmdcNo: values.type === "DOCTOR" ? values.bmdcNo : undefined,
                  experienceYears: values.experienceYears,
                  bio: values.bio || null,
                  specialtyIds: values.specialtyIds,
                });
                router.replace("/profile?welcome=1");
              }}
            />
          )}
        </Card>
      </div>
    </main>
  );
}
