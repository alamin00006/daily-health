"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button, Field, Input, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { PROVIDER_TYPE_LABEL } from "@/features/labels";
import { useSpecialties } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import { bmdcNumberSchema, type MyProviderProfileResponse, type ProviderType } from "@/shared-contracts/doctors.contract";

const detailsForm = z
  .object({
    type: z.enum(["DOCTOR", "NUTRITIONIST", "PHYSIO"]),
    gender: z.enum(["MALE", "FEMALE"], { error: "বেছে নিন" }),
    displayName: z.string().trim().min(3, "পুরো নাম লিখুন").max(80),
    designation: z.string().trim().max(120),
    qualifications: z.string().trim().min(2, "ডিগ্রি লিখুন, যেমন MBBS, FCPS").max(200),
    bmdcNo: z.string().trim(),
    experienceYears: z.number({ error: "সংখ্যা লিখুন" }).int().min(0).max(70),
    bio: z.string().trim().max(1500),
    specialtyIds: z.array(z.string()).min(1, "অন্তত একটি বেছে নিন").max(5, "সর্বোচ্চ ৫টি"),
  })
  .superRefine((value, ctx) => {
    if (value.type === "DOCTOR" && !bmdcNumberSchema.safeParse(value.bmdcNo).success) {
      ctx.addIssue({ code: "custom", path: ["bmdcNo"], message: "সনদে যেমন আছে, যেমন A-12345" });
    }
  });
export type ProviderDetailsValues = z.infer<typeof detailsForm>;

/** Professional details: registration (type chosen) and later edits (type fixed). */
export function ProviderDetailsForm({
  profile,
  submitLabel,
  onSubmit,
}: {
  profile?: MyProviderProfileResponse;
  submitLabel: string;
  onSubmit: (values: ProviderDetailsValues) => Promise<unknown>;
}) {
  const form = useForm<ProviderDetailsValues>({
    resolver: zodResolver(detailsForm),
    defaultValues: {
      type: profile?.type ?? "DOCTOR",
      gender: profile?.gender,
      displayName: profile?.displayName ?? "",
      designation: profile?.designation ?? "",
      qualifications: profile?.qualifications ?? "",
      bmdcNo: profile?.bmdcNo ?? "",
      experienceYears: profile?.experienceYears ?? 0,
      bio: profile?.bio ?? "",
      specialtyIds: profile?.specialties.map((s) => s.id) ?? [],
    },
  });
  const type = useWatch({ control: form.control, name: "type" }) as ProviderType;
  const specialties = useSpecialties(type);
  const errors = form.formState.errors;

  async function submit(values: ProviderDetailsValues) {
    try {
      await onSubmit(values);
    } catch (e) {
      if (!isApiError(e)) throw e;
      const fields = e.fieldErrors();
      for (const [path, message] of Object.entries(fields)) {
        form.setError(path as keyof ProviderDetailsValues, { message });
      }
      if (e.code === "BMDC_NUMBER_TAKEN") form.setError("bmdcNo", { message: e.userMessage });
      else form.setError("root", { message: e.userMessage });
    }
  }

  return (
    <form className="grid gap-5 sm:grid-cols-2" onSubmit={form.handleSubmit(submit)} noValidate>
      {!profile ? (
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">আপনি কী হিসেবে যুক্ত হচ্ছেন?</p>
          <div className="grid grid-cols-3 gap-2">
            {(["DOCTOR", "NUTRITIONIST", "PHYSIO"] as const).map((value) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-medium ${type === value ? "border-primary bg-mint text-primary" : "border-line bg-white text-ink"}`}
              >
                <input
                  type="radio"
                  value={value}
                  className="sr-only"
                  {...form.register("type", {
                    onChange: () => form.setValue("specialtyIds", []),
                  })}
                />
                {PROVIDER_TYPE_LABEL[value]}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <Field label="পুরো নাম" htmlFor="displayName" hint={type === "DOCTOR" ? "\"ডা.\" লিখবেন না, অ্যাপ নিজে যোগ করে" : undefined} error={errors.displayName?.message}>
        <Input id="displayName" placeholder="ফারহানা ইসলাম" {...form.register("displayName")} aria-invalid={Boolean(errors.displayName)} />
      </Field>
      <Field label="লিঙ্গ" htmlFor="gender" hint="নারী রোগীরা নারী ডাক্তার খুঁজতে পারেন" error={errors.gender?.message}>
        <Select id="gender" defaultValue={profile?.gender ?? ""} {...form.register("gender")} aria-invalid={Boolean(errors.gender)}>
          <option value="" disabled>
            বেছে নিন
          </option>
          <option value="FEMALE">নারী</option>
          <option value="MALE">পুরুষ</option>
        </Select>
      </Field>
      <Field label="ডিগ্রি" htmlFor="qualifications" error={errors.qualifications?.message}>
        <Input id="qualifications" placeholder="MBBS, FCPS (Medicine)" {...form.register("qualifications")} aria-invalid={Boolean(errors.qualifications)} />
      </Field>
      <Field label="পদবি (ঐচ্ছিক)" htmlFor="designation">
        <Input id="designation" placeholder="সহযোগী অধ্যাপক, মেডিসিন বিভাগ" {...form.register("designation")} />
      </Field>
      {type === "DOCTOR" ? (
        <Field label="BMDC নিবন্ধন নম্বর" htmlFor="bmdcNo" hint={profile?.verificationStatus === "VERIFIED" ? "বদলালে আবার যাচাই হবে" : "সনদে যেমন আছে, যেমন A-12345"} error={errors.bmdcNo?.message}>
          <Input id="bmdcNo" placeholder="A-12345" {...form.register("bmdcNo")} aria-invalid={Boolean(errors.bmdcNo)} />
        </Field>
      ) : null}
      <Field label="অভিজ্ঞতা (বছর)" htmlFor="experienceYears" error={errors.experienceYears?.message}>
        <Input id="experienceYears" type="number" min={0} max={70} {...form.register("experienceYears", { valueAsNumber: true })} aria-invalid={Boolean(errors.experienceYears)} />
      </Field>

      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium">বিশেষজ্ঞতা (সর্বোচ্চ ৫টি)</p>
        {specialties.isPending ? (
          <Skeleton className="h-20" />
        ) : (
          <Controller
            control={form.control}
            name="specialtyIds"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {specialties.data?.map((specialty) => {
                  const selected = field.value.includes(specialty.id);
                  return (
                    <button
                      key={specialty.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        field.onChange(selected ? field.value.filter((id) => id !== specialty.id) : [...field.value, specialty.id])
                      }
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm ${selected ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:border-primary/40"}`}
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                      {specialty.nameBn}
                    </button>
                  );
                })}
              </div>
            )}
          />
        )}
        {errors.specialtyIds ? <p className="mt-1.5 text-sm text-danger">{errors.specialtyIds.message}</p> : null}
      </div>

      <div className="sm:col-span-2">
        <Field label="আপনার সম্পর্কে (ঐচ্ছিক)" htmlFor="bio" hint="কোন সমস্যার চিকিৎসা করেন, রোগীরা প্রোফাইলে দেখবেন">
          <Textarea id="bio" rows={4} {...form.register("bio")} />
        </Field>
      </div>

      {errors.root ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger sm:col-span-2">{errors.root.message}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" loading={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
