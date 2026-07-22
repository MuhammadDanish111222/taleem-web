import { z } from "zod";

export const uploadMetadataSchema = z.object({
  operation: z.enum(["create_resource", "replace_version"]),
  resourceId: z.string().optional(),
  type: z.enum(["book", "note", "past_paper"]),
  title: z.string().min(1).max(200),
  boardId: z.string().min(1),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  chapterId: z.string().optional().nullable(),
  examinationBoardId: z.string().optional().nullable(),
  paperYear: z.coerce.number().int().optional().nullable(),
  paperSession: z.string().optional().nullable(),
  paperType: z.string().optional().nullable(),
  language: z.string().min(1),
  curriculumVersion: z.string().min(1),
  displayOrder: z.coerce.number().int(),
}).superRefine((data, ctx) => {
  if (data.operation === "replace_version" && !data.resourceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "resourceId is required when operation is replace_version",
      path: ["resourceId"],
    });
  }
  if (data.operation === "create_resource" && data.resourceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "resourceId must not be provided when operation is create_resource",
      path: ["resourceId"],
    });
  }
});
