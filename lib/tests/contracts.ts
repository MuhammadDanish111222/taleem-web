import { z } from "zod";

const scopeId = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
const requestId = z.string().uuid();

const base = {
  boardId: scopeId,
  classId: scopeId,
  subjectId: scopeId,
  requestId: requestId.optional(),
};

export const testGenerationRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("board"), ...base }).strict(),
  z.object({ mode: z.literal("custom"), ...base, spec: z.record(z.unknown()) }).strict(),
]);

export type TestGenerationRequest = z.infer<typeof testGenerationRequestSchema>;
