import { z } from "zod";

export const askAdminOperations = [
  "prompt_history",
  "prompt_create_draft",
  "prompt_update_draft",
  "prompt_test_draft",
  "prompt_activate",
  "prompt_rollback",
  "candidate_list",
  "candidate_inspect",
  "candidate_approve",
  "candidate_reject",
  "candidate_retention_preview",
  "candidate_retention_cleanup",
  "bank_list",
  "bank_create",
  "bank_import",
  "bank_view",
  "bank_history",
  "bank_archive",
  "bank_add_variation",
  "bank_set_variation_active",
  "bank_requeue_embedding",
  "bank_set_visuals",
  "source_policy_get",
  "source_policy_set_semantic_threshold",
  "blueprint_get",
  "blueprint_preview",
  "blueprint_save",
] as const;

export type AskAdminOperation = (typeof askAdminOperations)[number];

const answerBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(12_000) }).strict(),
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(300), level: z.union([z.literal(2), z.literal(3)]) }).strict(),
  z.object({ type: z.literal("bullet_list"), items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(40) }).strict(),
  z.object({ type: z.literal("equation"), latex: z.string().trim().min(1).max(4_000) }).strict(),
  z.object({ type: z.literal("visual_ref"), visual_id: z.string().trim().min(1).max(160) }).strict(),
]);

const mcqOptionSchema = z.object({
  key: z.string().trim().min(1).max(20),
  text: z.string().trim().min(1).max(1_000),
  is_correct: z.boolean(),
}).strict();

export const approvedQuestionSchema = z.object({
  board_id: z.string().trim().min(1).max(120),
  class_id: z.string().trim().min(1).max(120),
  subject_id: z.string().trim().min(1).max(120),
  chapter_id: z.string().trim().min(1).max(120).nullable().optional(),
  answer_mode: z.enum(["short", "long", "mcq"]),
  answer_style: z.literal("exam_style"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  marks: z.number().positive().max(1_000),
  question: z.string().trim().min(1).max(4_000),
  blocks: z.array(answerBlockSchema).min(1).max(120),
  mcq_options: z.array(mcqOptionSchema).max(12).default([]),
  citation_ids: z.array(z.string().uuid()).max(20).default([]),
  question_visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  answer_visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
}).strict().superRefine((value, ctx) => {
  const unsafeLatex = value.blocks.some((block) => (
    block.type === "equation"
    && /\\(?:input|include|write18|openout|usepackage|href|url)\b/i.test(block.latex)
  ));
  if (unsafeLatex) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Equation contains an unsafe command", path: ["blocks"] });
  }
  const visualBlocks = value.blocks
    .filter((block): block is Extract<typeof block, { type: "visual_ref" }> => block.type === "visual_ref")
    .map((block) => block.visual_id);
  if (new Set(visualBlocks).size !== visualBlocks.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visual blocks must be unique", path: ["blocks"] });
  }
  if (
    visualBlocks.length !== value.answer_visual_ids.length
    || visualBlocks.some((id) => !value.answer_visual_ids.includes(id))
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Answer visual blocks must match Answer Visual IDs", path: ["answer_visual_ids"] });
  }
  if (new Set(value.citation_ids).size !== value.citation_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Citation links must be unique", path: ["citation_ids"] });
  }
  if (new Set(value.question_visual_ids).size !== value.question_visual_ids.length || new Set(value.answer_visual_ids).size !== value.answer_visual_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visual links must be unique within each role", path: ["question_visual_ids"] });
  }
  const correctOptions = value.mcq_options.filter((option) => option.is_correct).length;
  if (value.answer_mode === "mcq" && (value.mcq_options.length < 2 || correctOptions !== 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ answers need at least two options and exactly one correct option", path: ["mcq_options"] });
  }
  if (value.answer_mode !== "mcq" && value.mcq_options.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ options are only valid for MCQ answers", path: ["mcq_options"] });
  }
});

export type ApprovedQuestionInput = z.infer<typeof approvedQuestionSchema>;

export const questionBankImportSchema = z.object({
  question: z.string().trim().min(1).max(4_000),
  type: z.enum(["mcq", "short", "long"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  marks: z.number().positive().max(1_000).optional(),
  options: z.array(z.string().trim().min(1).max(1_000)).max(12).default([]),
  correct_answer: z.string().trim().min(1).max(1_000).optional(),
  answer_blocks: z.array(answerBlockSchema).max(120).default([]),
  question_visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  answer_visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  visual_ids: z.never().optional(),
}).strict().superRefine((value, ctx) => {
  const visualBlocks = value.answer_blocks
    .filter((block): block is Extract<typeof block, { type: "visual_ref" }> => block.type === "visual_ref")
    .map((block) => block.visual_id);
  if (new Set(value.question_visual_ids).size !== value.question_visual_ids.length || new Set(value.answer_visual_ids).size !== value.answer_visual_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visual IDs must be unique within each role", path: ["question_visual_ids"] });
  }
  if (new Set(visualBlocks).size !== visualBlocks.length || visualBlocks.some((id) => !value.answer_visual_ids.includes(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visual answer blocks must refer to answer_visual_ids", path: ["answer_blocks"] });
  }
  const unsafeLatex = value.answer_blocks.some((block) => block.type === "equation" && /\\(?:input|include|write18|openout|usepackage|href|url)\b/i.test(block.latex));
  if (unsafeLatex) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Equation contains an unsafe command", path: ["answer_blocks"] });
  }
  if (value.type === "mcq") {
    if (value.options.length < 2 || new Set(value.options).size !== value.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ needs at least two unique options", path: ["options"] });
    }
    if (!value.correct_answer || !value.options.includes(value.correct_answer)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ correct_answer must match one supplied option", path: ["correct_answer"] });
    }
  } else {
    if (!value.answer_blocks.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Short and long answers require answer_blocks", path: ["answer_blocks"] });
    }
    if (value.options.length || value.correct_answer !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only MCQs may include options or correct_answer", path: ["type"] });
    }
  }
});

export type QuestionBankImportInput = z.infer<typeof questionBankImportSchema>;

export const boardPaperBlueprintSectionSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/),
  title: z.string().trim().min(1).max(160),
  type: z.enum(["mcq", "short", "long"]),
  select_count: z.number().int().min(1).max(100),
  attempt_count: z.number().int().min(1).max(100),
  marks_each: z.number().positive().max(1_000),
  difficulty_distribution: z.record(z.enum(["easy", "medium", "hard"]), z.number().int().min(1)).default({}),
  chapter_distribution: z.record(z.string().trim().min(1).max(120), z.number().int().min(1)).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.attempt_count > value.select_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Attempt count cannot exceed questions shown", path: ["attempt_count"] });
  }
  if (Object.keys(value.difficulty_distribution).length && Object.values(value.difficulty_distribution).reduce((sum, count) => sum + count, 0) !== value.select_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Difficulty counts must equal questions shown", path: ["difficulty_distribution"] });
  }
  if (Object.keys(value.chapter_distribution).length && Object.values(value.chapter_distribution).reduce((sum, count) => sum + count, 0) !== value.select_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chapter counts must equal questions shown", path: ["chapter_distribution"] });
  }
});

export const boardPaperBlueprintSchema = z.object({
  duration_minutes: z.number().int().min(1).max(600),
  sections: z.array(boardPaperBlueprintSectionSchema).min(1).max(12),
}).strict().superRefine((value, ctx) => {
  const keys = value.sections.map((section) => section.key);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Section keys must be unique", path: ["sections"] });
  }
});

export type BoardPaperBlueprintInput = z.infer<typeof boardPaperBlueprintSchema>;

export const askAdminRequestSchema = z.object({
  operation: z.enum(askAdminOperations),
  prompt_id: z.string().uuid().optional(),
  prompt_key: z.enum(["ask_grounded", "ask_general"]).optional(),
  answer_mode: z.enum(["short", "long", "mcq"]).optional(),
  board_id: z.string().trim().min(1).max(120).optional(),
  class_id: z.string().trim().min(1).max(120).optional(),
  subject_id: z.string().trim().min(1).max(120).optional(),
  chapter_id: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(20_000).optional(),
  question: z.string().trim().min(1).max(4_000).optional(),
  candidate_id: z.string().uuid().optional(),
  question_id: z.string().uuid().optional(),
  revision_id: z.string().uuid().optional(),
  variation_id: z.string().uuid().optional(),
  rejection_reason: z.string().trim().min(1).max(1_000).optional(),
  reason: z.string().trim().min(1).max(1_000).optional(),
  variation: z.string().trim().min(1).max(4_000).optional(),
  active: z.boolean().optional(),
  semantic_similarity_threshold: z.number().min(0.80).max(0.99).optional(),
  source_feature: z.literal("single_question").optional(),
  answer_source: z.enum(["approved_bank", "syllabus_grounded", "general_knowledge"]).optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  bank_source: z.string().trim().min(1).max(120).optional(),
  age_days: z.number().int().min(0).max(3650).optional(),
  question_visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  answer_visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  approved_question: approvedQuestionSchema.optional(),
  import_key: z.string().trim().min(1).max(200).optional(),
  import_questions: z.array(questionBankImportSchema).min(1).max(500).optional(),
  blueprint_name: z.string().trim().min(1).max(160).optional(),
  blueprint: boardPaperBlueprintSchema.optional(),
  blueprint_active: z.boolean().optional(),
  selection_seed: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  const requireField = (field: keyof typeof value, message: string) => {
    if (value[field] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] });
    }
  };
  const requirePromptScope = () => {
    requireField("prompt_key", "Prompt key is required");
    requireField("answer_mode", "Answer mode is required");
    if (value.answer_mode === "mcq") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ prompt configuration is not supported", path: ["answer_mode"] });
    }
    const exactScope = Boolean(value.board_id && value.class_id && value.subject_id);
    const subjectGlobalScope = Boolean(value.subject_id && !value.board_id && !value.class_id);
    if (!exactScope && !subjectGlobalScope) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Prompt scope must be exact or Subject Global", path: ["subject_id"] });
    }
  };

  switch (value.operation) {
    case "prompt_history":
      requirePromptScope();
      break;
    case "prompt_create_draft":
      requirePromptScope();
      requireField("content", "Prompt content is required");
      break;
    case "prompt_update_draft":
      requireField("prompt_id", "Prompt ID is required");
      requireField("content", "Prompt content is required");
      break;
    case "prompt_test_draft":
      requireField("prompt_id", "Prompt ID is required");
      requireField("question", "Test question is required");
      break;
    case "prompt_activate":
    case "prompt_rollback":
      requireField("prompt_id", "Prompt ID is required");
      break;
    case "candidate_inspect":
      requireField("candidate_id", "Candidate ID is required");
      break;
    case "candidate_approve":
      requireField("candidate_id", "Candidate ID is required");
      requireField("approved_question", "Approved question is required");
      break;
    case "candidate_reject":
      requireField("candidate_id", "Candidate ID is required");
      requireField("rejection_reason", "Rejection reason is required");
      break;
    case "candidate_retention_cleanup":
      requireField("reason", "Retention authorization reason is required");
      break;
    case "bank_create":
      requireField("approved_question", "Approved question is required");
      break;
    case "bank_import":
      requireField("import_key", "Import key is required");
      requireField("import_questions", "Import questions are required");
      requireField("board_id", "Board is required");
      requireField("class_id", "Class is required");
      requireField("subject_id", "Subject is required");
      requireField("chapter_id", "Chapter is required");
      break;
    case "bank_view":
      requireField("revision_id", "Revision ID is required");
      break;
    case "bank_history":
      if (!value.revision_id && !value.question_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Revision or question ID is required", path: ["revision_id"] });
      }
      break;
    case "bank_archive":
      requireField("revision_id", "Revision ID is required");
      requireField("reason", "Archive reason is required");
      break;
    case "bank_add_variation":
      requireField("revision_id", "Revision ID is required");
      requireField("variation", "Variation is required");
      break;
    case "bank_set_variation_active":
      requireField("variation_id", "Variation ID is required");
      requireField("active", "Variation state is required");
      break;
    case "bank_requeue_embedding":
      requireField("revision_id", "Revision ID is required");
      break;
    case "bank_set_visuals":
      requireField("revision_id", "Revision ID is required");
      requireField("question_visual_ids", "Question Visual IDs are required");
      requireField("answer_visual_ids", "Answer Visual IDs are required");
      break;
    case "source_policy_get":
      requireField("subject_id", "Subject ID is required");
      break;
    case "source_policy_set_semantic_threshold":
      requireField("subject_id", "Subject ID is required");
      requireField("semantic_similarity_threshold", "Semantic threshold is required");
      break;
    case "blueprint_get":
      requireField("board_id", "Board is required");
      requireField("class_id", "Class is required");
      requireField("subject_id", "Subject is required");
      break;
    case "blueprint_preview":
      requireField("board_id", "Board is required");
      requireField("class_id", "Class is required");
      requireField("subject_id", "Subject is required");
      requireField("blueprint", "Blueprint is required");
      break;
    case "blueprint_save":
      requireField("board_id", "Board is required");
      requireField("class_id", "Class is required");
      requireField("subject_id", "Subject is required");
      requireField("blueprint", "Blueprint is required");
      requireField("blueprint_name", "Blueprint name is required");
      requireField("blueprint_active", "Activation choice is required");
      break;
  }
});

export type AskAdminRequest = z.infer<typeof askAdminRequestSchema>;

export interface PromptHistoryItem {
  id: string;
  prompt_key: "ask_grounded" | "ask_general";
  answer_mode: "short" | "long" | "mcq";
  scope: { board_id: string | null; class_id: string | null; subject_id: string | null };
  version: number;
  content: string;
  status: "draft" | "active" | "retired";
  created_by: string;
  created_at: string;
  activated_by: string | null;
  activated_at: string | null;
}

export interface CandidateSummary {
  id: string;
  board_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string | null;
  answer_mode: "short" | "long" | "mcq";
  answer_style: "exam_style";
  answer_source: "syllabus_grounded" | "general_knowledge";
  source_feature: "single_question";
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  corpus_version_id: string | null;
  created_at: string;
}

export interface CandidateDetail extends CandidateSummary {
  raw_question: string;
  answer_blocks: Array<
    | { type: "paragraph"; text: string }
    | { type: "heading"; text: string; level: 2 | 3 }
    | { type: "bullet_list"; items: string[] }
    | { type: "equation"; latex: string }
    | { type: "visual_ref"; visual_id: string }
  >;
  citation_sources: Array<Record<string, unknown>>;
  visual_ids: string[];
  review_status: "pending" | "approved" | "rejected";
  approved_revision_id: string | null;
}

export interface ApprovedBankSummary {
  revision_id: string;
  question_id: string;
  version_no: number;
  question_text: string;
  board_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string | null;
  answer_mode: "short" | "long" | "mcq";
  answer_style: "exam_style";
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  source: string;
  approved_by: string;
  approved_at: string;
  embedding_status: string;
  superseded_at: string | null;
  variation_count: number;
}

export interface ApprovedBankHistory {
  question_id: string;
  revisions: Array<{
    revision_id: string;
    question_id: string;
    version_no: number;
    board_id: string;
    class_id: string;
    subject_id: string;
    chapter_id: string | null;
    answer_mode: "short" | "long" | "mcq";
    answer_style: "exam_style";
    difficulty: "easy" | "medium" | "hard";
    marks: number;
    question_text: string;
    answer_blocks: Array<Record<string, unknown>>;
    review_status: string;
    source: string;
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    superseded_at: string | null;
    embedding_status: string;
    embedding_model: string | null;
    embedding_revision: string | null;
    embedding_config_fingerprint: string | null;
    created_by: string;
    created_at: string;
  }>;
  variations: Array<{
    variation_id: string;
    revision_id: string;
    variation_text: string;
    active: boolean;
    embedding_status: string;
    embedding_model: string | null;
    embedding_revision: string | null;
    embedding_config_fingerprint: string | null;
    created_by: string;
    created_at: string;
  }>;
  mcq_options: Array<{
    revision_id: string;
    option_key: string;
    option_text: string;
    display_order: number;
    is_correct: boolean;
  }>;
}
