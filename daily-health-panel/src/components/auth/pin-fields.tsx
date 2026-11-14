"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Field, Input } from "@/components/ui/primitives";
import { pinSchema } from "@/shared-contracts/common-fields.contract";

const newPinForm = z
  .object({
    pin: z.string().regex(/^\d{6}$/, "৬ সংখ্যার পিন দিন"),
    confirm: z.string(),
  })
  .superRefine((value, ctx) => {
    if (!pinSchema.safeParse(value.pin).success) {
      ctx.addIssue({ code: "custom", path: ["pin"], message: "সহজ পিন (১২৩৪৫৬, ১১১১১১) দেওয়া যাবে না" });
    }
    if (value.pin !== value.confirm) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "দুটো পিন মেলেনি" });
    }
  });

/** Choose a new 6-digit PIN (signup and reset). */
export function NewPinForm({ submitLabel, onSubmit, error }: { submitLabel: string; onSubmit: (pin: string) => Promise<void>; error: string | null }) {
  const form = useForm({ resolver: zodResolver(newPinForm), defaultValues: { pin: "", confirm: "" } });
  return (
    <form className="flex flex-col gap-5" onSubmit={form.handleSubmit((v) => onSubmit(v.pin))} noValidate>
      <Field label="নতুন পিন" htmlFor="pin" hint="৬ সংখ্যা; অ্যাপ আর প্যানেলে একই পিন" error={form.formState.errors.pin?.message}>
        <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} {...form.register("pin")} aria-invalid={Boolean(form.formState.errors.pin)} />
      </Field>
      <Field label="পিন আবার লিখুন" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
        <Input id="confirm" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} {...form.register("confirm")} aria-invalid={Boolean(form.formState.errors.confirm)} />
      </Field>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={form.formState.isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
