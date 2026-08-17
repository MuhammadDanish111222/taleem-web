import { z } from "zod";

// Strict allowlist validation before normalization
export const whatsappPhoneSchema = z
  .string()
  .trim()
  .max(25)
  .refine((v) => !/[\u0000-\u001F\u007F-\u009F]/.test(v), "Phone must not contain control characters")
  .refine(
    (v) => /^\+?[0-9\s()\-]+$/.test(v),
    "Phone may only contain digits, spaces, hyphens, parentheses, and one leading +"
  )
  .transform((v) => v.replace(/^\+/, "").replace(/[\s()\-]/g, ""))
  .refine((v) => /^\d{7,15}$/.test(v), "Normalized phone must be 7–15 digits")
  .refine((v) => /^[1-9]/.test(v), "Normalized phone must start with 1–9 (international format)");

export const academySettingsMutationSchema = z
  .object({
    visible: z.boolean(),
    whatsapp_number: whatsappPhoneSchema,
    whatsapp_message_template: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !/<script|javascript:|[<>]/.test(v), "Message must not contain HTML"),
  })
  .strict();

export type AcademySettingsMutation = z.output<typeof academySettingsMutationSchema>;
export type AcademySettingsInput = z.input<typeof academySettingsMutationSchema>;
