import { z } from "zod";

const requestId = z.string().uuid();
const scopeId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
const scopeSchema = {
  boardId: scopeId,
  classId: scopeId,
  subjectId: scopeId,
  chapterId: scopeId.optional(),
};

export const multipleAskSessionBrowserRequestSchema = z
  .object({
    requestId,
    inputKind: z.enum(["image", "pdf"]),
    contentType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
    sizeBytes: z.number().int().positive(),
    ...scopeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const allowed =
      value.inputKind === "image"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["application/pdf"];
    if (!allowed.includes(value.contentType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INVALID_INPUT",
      });
    }
  });

export const multipleAskFinalizeBrowserRequestSchema = z
  .object({ requestId, sessionId: z.string().uuid() })
  .strict();

export const multipleAskTextBrowserRequestSchema = z
  .object({
    requestId,
    text: z.string().trim().min(1).max(30000),
    ...scopeSchema,
  })
  .strict();

const multipleAskWorkflowStatus = z.enum([
  "queued",
  "validating",
  "validated",
  "extracting",
  "needs_correction",
  "ready_to_answer",
  "answering",
  "partially_completed",
  "completed",
  "failed",
  "invalid",
  "too_many_questions",
  "cancelled",
  "limit_reached",
]);
const multipleAskItemStatus = z.enum([
  "pending_extraction",
  "needs_correction",
  "ready_to_answer",
  "answering",
  "answered",
  "failed",
  "cancelled",
]);

const jobResponseSchema = z.object({
  job_id: z.string(),
  workflow_status: multipleAskWorkflowStatus,
  queue_status: z.string().nullable().optional().default("queued"),
});

export const multipleAskSessionInternalResponseSchema = z.object({
  session_id: z.string(),
  upload_url: z.string().url(),
  upload_method: z.literal("PUT"),
  upload_headers: z.record(z.string(), z.string()),
  upload_capability_expires_at: z.string().nullable().optional(),
});
export const multipleAskJobInternalResponseSchema = jobResponseSchema;

export const multipleAskCorrectionBrowserRequestSchema = z
  .object({
    requestId,
    questionText: z.string().trim().min(1).max(30000),
    answerMode: z.enum(["short", "long", "mcq"]),
    mcqOptions: z
      .array(
        z.object({
          label: z.string().regex(/^[A-Z]$/),
          text: z.string().trim().min(1).max(5000),
        }),
      )
      .max(12)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const labels = value.mcqOptions.map((option) => option.label);
    if (value.answerMode === "mcq") {
      const expected = labels.map((_, index) =>
        String.fromCharCode(65 + index),
      );
      if (
        labels.length === 1 ||
        labels.some((label, index) => label !== expected[index])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "INVALID_MCQ_OPTIONS",
        });
      }
    } else if (labels.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPTIONS_ONLY_FOR_MCQ",
      });
    }
  });
export const multipleAskResumeBrowserRequestSchema = z
  .object({ requestId })
  .strict();
export const multipleAskStatusInternalResponseSchema = z.object({
  job_id: z.string(),
  workflow_status: multipleAskWorkflowStatus,
  input_kind: z.enum(["image", "pdf", "text"]),
  scope: z.object({
    board_id: z.string(),
    class_id: z.string(),
    subject_id: z.string(),
    chapter_id: z.string().nullable().optional(),
  }),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  retention_expires_at: z.string().nullable().optional(),
  terminal_error_code: z.string().nullable().optional(),
  queue: z
    .object({
      status: z.string().nullable().optional(),
      stage: z.string().nullable().optional(),
      progress: z.number().nullable().optional(),
    })
    .nullable()
    .optional()
    .default({ status: null, stage: null, progress: null }),
  items: z
    .array(
      z.object({
        item_id: z.string(),
        item_index: z.number().int().nonnegative().optional().default(0),
        display_label: z.string().nullable().optional(),
        section_context: z.string().nullable().optional(),
        item_status: multipleAskItemStatus
          .optional()
          .default("pending_extraction"),
        normalized_question: z.string().nullable().optional(),
        answer_mode: z
          .enum(["short", "long", "mcq", "not_clear"])
          .nullable()
          .optional(),
        mcq_options: z
          .array(z.object({ label: z.string(), text: z.string() }))
          .optional()
          .default([]),
        unclear_reason: z.string().nullable().optional(),
        terminal_error_code: z.string().nullable().optional(),
        source_locator: z.record(z.string(), z.unknown()).nullable().optional(),
        extraction_version: z.number().int().optional().default(1),
        correction_version: z.number().int().optional().default(0),
        corrected_at: z.string().nullable().optional(),
        result: z
          .object({
            answer_source: z.enum([
              "approved_bank",
              "syllabus_grounded",
              "general_knowledge",
            ]),
            blocks: z.array(z.record(z.string(), z.unknown())),
            citations: z.array(z.record(z.string(), z.unknown())),
            visual_ids: z.array(z.string()),
            approved_revision_id: z.string().nullable().optional(),
          })
          .nullable()
          .optional()
          .default(null),
      }),
    )
    .optional()
    .default([]),
  summary: z
    .object({
      total: z.number().int().optional().default(0),
      short: z.number().int().optional().default(0),
      long: z.number().int().optional().default(0),
      mcq: z.number().int().optional().default(0),
      not_clear: z.number().int().optional().default(0),
    })
    .optional()
    .default({ total: 0, short: 0, long: 0, mcq: 0, not_clear: 0 }),
});

export function toInternalFileSessionRequest(
  input: z.infer<typeof multipleAskSessionBrowserRequestSchema>,
) {
  return {
    request_id: input.requestId,
    input_kind: input.inputKind,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    board_id: input.boardId,
    class_id: input.classId,
    subject_id: input.subjectId,
    ...(input.chapterId ? { chapter_id: input.chapterId } : {}),
  };
}

export function toInternalFinalizeRequest(
  input: z.infer<typeof multipleAskFinalizeBrowserRequestSchema>,
) {
  return { request_id: input.requestId, session_id: input.sessionId };
}

export function toInternalTextRequest(
  input: z.infer<typeof multipleAskTextBrowserRequestSchema>,
) {
  return {
    request_id: input.requestId,
    text: input.text,
    board_id: input.boardId,
    class_id: input.classId,
    subject_id: input.subjectId,
    ...(input.chapterId ? { chapter_id: input.chapterId } : {}),
  };
}

export function toBrowserSessionResponse(
  input: z.infer<typeof multipleAskSessionInternalResponseSchema>,
) {
  return {
    sessionId: input.session_id,
    uploadUrl: input.upload_url,
    uploadMethod: input.upload_method,
    uploadHeaders: input.upload_headers,
    uploadCapabilityExpiresAt: input.upload_capability_expires_at,
  };
}

export function toBrowserJobResponse(
  input: z.infer<typeof multipleAskJobInternalResponseSchema>,
) {
  return {
    jobId: input.job_id,
    workflowStatus: input.workflow_status,
    queueStatus: input.queue_status,
  };
}

export function toInternalCorrectionRequest(
  input: z.infer<typeof multipleAskCorrectionBrowserRequestSchema>,
) {
  return {
    request_id: input.requestId,
    question_text: input.questionText,
    answer_mode: input.answerMode,
    mcq_options: input.mcqOptions.map((option) => ({
      label: option.label,
      text: option.text,
    })),
  };
}

export function toInternalResumeRequest(
  input: z.infer<typeof multipleAskResumeBrowserRequestSchema>,
) {
  return { request_id: input.requestId };
}

export function toBrowserStatusResponse(
  input: z.infer<typeof multipleAskStatusInternalResponseSchema>,
) {
  return {
    jobId: input.job_id,
    workflowStatus: input.workflow_status,
    inputKind: input.input_kind,
    scope: {
      boardId: input.scope.board_id,
      classId: input.scope.class_id,
      subjectId: input.scope.subject_id,
      chapterId: input.scope.chapter_id,
    },
    createdAt: input.created_at,
    updatedAt: input.updated_at,
    retentionExpiresAt: input.retention_expires_at,
    terminalErrorCode: input.terminal_error_code,
    queue: {
      status: input.queue?.status ?? null,
      stage: input.queue?.stage ?? null,
      progress: input.queue?.progress ?? null,
    },
    items: input.items.map((item) => ({
      itemId: item.item_id,
      itemIndex: item.item_index,
      displayLabel: item.display_label,
      sectionContext: item.section_context,
      itemStatus: item.item_status,
      normalizedQuestion: item.normalized_question,
      answerMode: item.answer_mode,
      mcqOptions: item.mcq_options,
      unclearReason: item.unclear_reason,
      terminalErrorCode: item.terminal_error_code,
      sourceLocator: item.source_locator,
      extractionVersion: item.extraction_version,
      correctionVersion: item.correction_version,
      correctedAt: item.corrected_at,
      result: item.result
        ? {
            answerSource: item.result.answer_source,
            blocks: item.result.blocks,
            citations: item.result.citations,
            visualIds: item.result.visual_ids,
            approvedRevisionId: item.result.approved_revision_id,
          }
        : null,
    })),
    summary: input.summary,
  };
}
