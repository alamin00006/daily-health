import { z } from 'zod';

import { emailSchema, pinSchema } from '@/shared-contracts/common-fields.contract';

/**
 * Runs a contract schema (same rules as the API) on a text field, but reports
 * Bangla messages for the form. The output is the contract's parsed value
 * (e.g. the trimmed, lowercased email).
 */
function contractField<T extends z.ZodType<unknown, string>>(
  schema: T,
  messages: { empty: string; invalid: string }
) {
  return z.string().transform((value, ctx): z.output<T> => {
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: messages.empty });
      return z.NEVER;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: messages.invalid });
      return z.NEVER;
    }
    return result.data;
  });
}

const emailField = contractField(emailSchema, {
  empty: 'ইমেইল ঠিকানা লিখুন।',
  invalid: 'সঠিক ইমেইল ঠিকানা লিখুন।',
});

export const loginFormSchema = z.object({
  email: emailField,
  // Not the strict pinSchema: an older "easy" PIN must still be able to log in.
  pin: z.string().regex(/^\d{6}$/, 'ছয় সংখ্যার পিন দিন।'),
});
export type LoginFormInput = z.input<typeof loginFormSchema>;
export type LoginFormValues = z.output<typeof loginFormSchema>;

export const requestCodeFormSchema = z.object({ email: emailField });
export type RequestCodeFormInput = z.input<typeof requestCodeFormSchema>;
export type RequestCodeFormValues = z.output<typeof requestCodeFormSchema>;

export const setPinFormSchema = z
  .object({
    pin: contractField(pinSchema, {
      empty: 'ছয় সংখ্যার পিন দিন।',
      invalid: 'সহজে অনুমান করা যায় এমন পিন (যেমন ১২৩৪৫৬ বা ১১১১১১) দেওয়া যাবে না।',
    }),
    confirmation: z.string(),
  })
  .refine((form) => form.pin === form.confirmation, {
    path: ['confirmation'],
    message: 'দুটি পিন মেলেনি। আবার নতুন পিন দিন।',
  });
export type SetPinFormInput = z.input<typeof setPinFormSchema>;
export type SetPinFormValues = z.output<typeof setPinFormSchema>;
