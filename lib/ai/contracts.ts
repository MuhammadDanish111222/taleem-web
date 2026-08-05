import { z } from "zod";

const LETTERS = /\p{Letter}/gu;
const LATIN_LETTER = /\p{Script=Latin}/u;

function isTypedEnglishText(value: string): boolean {
  const letters = value.match(LETTERS) ?? [];
  return (
    letters.length > 0 &&
    letters.every((letter) => LATIN_LETTER.test(letter))
  );
}

export const askBrowserRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    boardId: z.string().trim().min(1).max(120),
    classId: z.string().trim().min(1).max(120),
    subjectId: z.string().trim().min(1).max(120),
    chapterId: z.string().trim().min(1).max(120).optional(),
    question: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine(
        (value) =>
          !/(?:data:image\/|data:application\/pdf|base64,|%pdf-)/i.test(value),
        "ASK_TEXT_ONLY",
      )
      .refine(isTypedEnglishText, "ASK_TEXT_ONLY"),
    answerMode: z.enum(["short", "long"]),
    answerStyle: z.literal("exam_style"),
  })
  .strict();

const answerBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("heading"),
      text: z.string(),
      level: z.union([z.literal(2), z.literal(3)]),
    })
    .strict(),
  z
    .object({ type: z.literal("bullet_list"), items: z.array(z.string()) })
    .strict(),
  z.object({ type: z.literal("equation"), latex: z.string() }).strict(),
  z.object({ type: z.literal("visual_ref"), visual_id: z.string() }).strict(),
]);

const usageInternalSchema = z
  .object({
    feature: z.literal("single_question"),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative().nullable(),
    remaining: z.number().int().nonnegative().nullable(),
    resets_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const askInternalResponseSchema = z
  .object({
    request_id: z.string().uuid(),
    answer_source: z
      .enum(["approved_bank", "syllabus_grounded", "general_knowledge"])
      .nullable(),
    answer_mode: z.enum(["short", "long"]),
    answer_style: z.literal("exam_style"),
    blocks: z.array(answerBlockSchema),
    citations: z.array(
      z
        .object({
          citation_id: z.string(),
          chapter_id: z.string().nullable(),
          topic_no: z.string().nullable(),
          topic_title: z.string().nullable(),
          page_start: z.number().int().nullable(),
          page_end: z.number().int().nullable(),
        })
        .strict(),
    ),
    visuals: z.array(
      z
        .object({
          visual_id: z.string(),
          title: z.string(),
          description: z.string(),
          display_policy: z.enum(["always", "llm_decide"]),
          display_order: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    general_ai_label: z.string().nullable(),
    prompt_version: z.string().nullable(),
    corpus_version: z.string().nullable(),
    approved_revision_id: z.string().uuid().nullable(),
    usage: usageInternalSchema,
    terminal_status: z.enum([
      "answered",
      "no_answer",
      "limit_reached",
      "error",
    ]),
    error_code: z.string().nullable(),
  })
  .strict();

export const usageInternalResponseSchema = usageInternalSchema;

export type AskBrowserRequest = z.infer<typeof askBrowserRequestSchema>;

export function toInternalAskRequest(input: AskBrowserRequest) {
  return {
    request_id: input.requestId,
    board_id: input.boardId,
    class_id: input.classId,
    subject_id: input.subjectId,
    ...(input.chapterId ? { chapter_id: input.chapterId } : {}),
    question: input.question,
    answer_mode: input.answerMode,
    answer_style: input.answerStyle,
  };
}

export function toBrowserUsage(input: z.infer<typeof usageInternalSchema>) {
  return {
    feature: input.feature,
    used: input.used,
    limit: input.limit,
    remaining: input.remaining,
    resetsAt: input.resets_at,
  };
}

export function toBrowserAskResponse(
  input: z.infer<typeof askInternalResponseSchema>,
) {
  return {
    requestId: input.request_id,
    answerSource: input.answer_source,
    answerMode: input.answer_mode,
    answerStyle: input.answer_style,
    blocks: input.blocks.map((block) =>
      block.type === "visual_ref"
        ? { type: block.type, visualId: block.visual_id }
        : block,
    ),
    citations: input.citations.map((citation) => ({
      citationId: citation.citation_id,
      chapterId: citation.chapter_id,
      topicNo: citation.topic_no,
      topicTitle: citation.topic_title,
      pageStart: citation.page_start,
      pageEnd: citation.page_end,
    })),
    visuals: input.visuals.map((visual) => ({
      visualId: visual.visual_id,
      title: visual.title,
      description: visual.description,
      displayPolicy: visual.display_policy,
      displayOrder: visual.display_order,
    })),
    generalAiLabel: input.general_ai_label,
    promptVersion: input.prompt_version,
    corpusVersion: input.corpus_version,
    approvedRevisionId: input.approved_revision_id,
    usage: toBrowserUsage(input.usage),
    terminalStatus: input.terminal_status,
    errorCode: input.error_code,
  };
}
