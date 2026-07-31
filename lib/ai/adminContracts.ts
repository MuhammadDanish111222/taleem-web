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
] as const;

export type AskAdminOperation = (typeof askAdminOperations)[number];

const answerBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(12_000) }).strict(),
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
  visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
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
    visualBlocks.length !== value.visual_ids.length
    || visualBlocks.some((id) => !value.visual_ids.includes(id))
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visual block links must match reviewed visual IDs", path: ["visual_ids"] });
  }
  if (new Set(value.citation_ids).size !== value.citation_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Citation links must be unique", path: ["citation_ids"] });
  }
  if (new Set(value.visual_ids).size !== value.visual_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visual links must be unique", path: ["visual_ids"] });
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
  source_feature: z.literal("single_question").optional(),
  answer_source: z.enum(["approved_bank", "syllabus_grounded", "general_knowledge"]).optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  bank_source: z.string().trim().min(1).max(120).optional(),
  age_days: z.number().int().min(0).max(3650).optional(),
  visual_ids: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  approved_question: approvedQuestionSchema.optional(),
  import_key: z.string().trim().min(1).max(200).optional(),
  import_questions: z.array(approvedQuestionSchema).min(1).max(500).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  const requireField = (field: keyof typeof value, message: string) => {
    if (value[field] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] });
    }
  };
  if (value.operation === "prompt_update_draft") {
    requireField("prompt_id", "Prompt ID is required");
    requireField("content", "Prompt content is required");
  }
  if (value.operation === "bank_history" && !value.revision_id && !value.question_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Revision or question ID is required", path: ["revision_id"] });
  }
  if (value.operation === "bank_archive") {
    requireField("revision_id", "Revision ID is required");
    requireField("reason", "Archive reason is required");
  }
  if (value.operation === "bank_set_variation_active") {
    requireField("variation_id", "Variation ID is required");
    requireField("active", "Variation state is required");
  }
  if (value.operation === "bank_requeue_embedding") {
    requireField("revision_id", "Revision ID is required");
  }
  if (value.operation === "candidate_retention_cleanup") {
    requireField("reason", "Retention authorization reason is required");
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
