import { z } from "zod";

export const sessionLoginSchema = z.object({
  idToken: z.string().min(1, "ID token is required"),
  csrfToken: z.string().min(1, "CSRF token is required"),
});

export type SessionLoginPayload = z.infer<typeof sessionLoginSchema>;
