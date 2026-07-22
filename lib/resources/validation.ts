import { z } from "zod";

export const resourceTypeSchema = z.enum(["book", "note", "past_paper"]);
export const resourceStatusSchema = z.enum(["draft", "published", "hidden", "archived"]);

export const createResourceInputSchema = z.object({
  type: resourceTypeSchema,
  title: z.string().min(1).max(255).trim(),
  boardId: z.string().min(1).max(100),
  classId: z.string().min(1).max(100),
  subjectId: z.string().min(1).max(100),
  chapterId: z.string().max(100).nullable(),
  examinationBoardId: z.string().max(100).optional().nullable(),
  paperYear: z.number().int().optional().nullable(),
  paperSession: z.string().max(100).optional().nullable(),
  paperType: z.string().max(100).optional().nullable(),
  language: z.string().min(1).max(50).trim(),
  curriculumVersion: z.string().min(1).max(50).trim(),
  displayOrder: z.number().int().nonnegative(),
});

export const resourceVersionMetadataSchema = z.object({
  originalFilename: z.string().min(1).max(500),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  pageCount: z.number().int().positive(),
  providerRevision: z.string().min(1),
  storageKey: z.string().min(1),
});

export const publicResourceQuerySchema = z.object({
  boardId: z.string().min(1),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  chapterId: z.string().optional(),
  type: resourceTypeSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
