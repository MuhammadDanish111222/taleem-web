import { z } from "zod";
import { boardPaperBlueprintSchema } from "@/lib/ai/adminContracts";

export const CUSTOM_DURATION_MINUTES = 120;
export const CUSTOM_LIMIT_PER_SECTION = 100;

const paperVisualSchema = z.object({
  visual_id: z.string().min(1),
  visual_type: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
}).strict();

const paperOptionSchema = z.object({ key: z.string().min(1), text: z.string() }).strict();

const paperQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string(),
  marks: z.number().positive(),
  chapter_id: z.string().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  options: z.array(paperOptionSchema),
  visuals: z.array(paperVisualSchema),
}).strict();

const paperSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["mcq", "short", "long"]),
  select_count: z.number().int().positive(),
  attempt_count: z.number().int().positive(),
  marks_each: z.number().positive(),
  questions: z.array(paperQuestionSchema),
}).strict().superRefine((section, ctx) => {
  if (section.attempt_count > section.select_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid attempt count" });
  }
});

/** The only browser representation accepted from the Stage 3 paper-safe RPC. */
export const testPaperResponseSchema = z.object({
  mode: z.enum(["board", "custom"]),
  board_id: z.string().min(1),
  class_id: z.string().min(1),
  subject_id: z.string().min(1),
  duration_minutes: z.number().int().positive(),
  total_marks: z.number().nonnegative(),
  seed: z.string().min(1),
  sections: z.array(paperSectionSchema),
}).strict();

export type TestPaperResponse = z.infer<typeof testPaperResponseSchema>;
export type CustomDifficulty = "mixed" | "easy" | "medium" | "hard";

export interface CustomPaperInput {
  chapterIds: string[];
  mcqCount: number;
  shortCount: number;
  longCount: number;
  difficulty?: CustomDifficulty;
}

export function balancedChapterDistribution(chapterIds: string[], count: number): Record<string, number> {
  const unique = [...new Set(chapterIds)];
  if (!Number.isInteger(count) || count < 0 || !unique.length) {
    throw new Error("A positive chapter selection and a non-negative count are required");
  }
  const base = Math.floor(count / unique.length);
  const remainder = count % unique.length;
  return Object.fromEntries(unique.map<[string, number]>((id, index) => [id, base + (index < remainder ? 1 : 0)]).filter(([, value]) => value > 0));
}

function section(key: string, title: string, type: "mcq" | "short" | "long", count: number, marks: number, chapterIds: string[], difficulty: CustomDifficulty) {
  return {
    key,
    title,
    type,
    select_count: count,
    attempt_count: count,
    marks_each: marks,
    difficulty_distribution: difficulty === "mixed" ? {} : { [difficulty]: count },
    chapter_distribution: balancedChapterDistribution(chapterIds, count),
  };
}

/** Builds the existing Stage 2 selection specification; it never selects questions. */
export function buildCustomSelectionSpec(input: CustomPaperInput) {
  const chapterIds = [...new Set(input.chapterIds.filter(Boolean))];
  const difficulty = input.difficulty ?? "mixed";
  const counts = [input.mcqCount, input.shortCount, input.longCount];
  if (!chapterIds.length || !counts.every((count) => Number.isInteger(count) && count >= 0 && count <= CUSTOM_LIMIT_PER_SECTION) || !counts.some(Boolean)) {
    throw new Error("Invalid custom paper configuration");
  }
  const spec = {
    duration_minutes: CUSTOM_DURATION_MINUTES,
    sections: [
      input.mcqCount ? section("A", "Multiple Choice Questions", "mcq", input.mcqCount, 1, chapterIds, difficulty) : null,
      input.shortCount ? section("B", "Short Questions", "short", input.shortCount, 2, chapterIds, difficulty) : null,
      input.longCount ? section("C", "Long Questions", "long", input.longCount, 4, chapterIds, difficulty) : null,
    ].filter((value): value is NonNullable<typeof value> => value !== null),
  };
  return boardPaperBlueprintSchema.parse(spec);
}

type TestPaperSection = TestPaperResponse["sections"][number];
type TestPaperQuestion = TestPaperSection["questions"][number];

export interface PaperPresentationModel {
  response: TestPaperResponse;
  title: string;
  filename: string;
  sections: Array<Omit<TestPaperSection, "questions"> & {
    instruction: string;
    marksLabel: string;
    questions: Array<TestPaperQuestion & { number: number }>;
  }>;
}

function printableLabel(value: string) {
  return value.replace(/[-_.]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safePaperFilename(response: Pick<TestPaperResponse, "board_id" | "class_id" | "subject_id" | "mode">) {
  const safe = [response.board_id, response.class_id, response.subject_id, response.mode, "paper"]
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "taleem")
    .join("-");
  return `${safe}.pdf`;
}

export function buildPaperPresentationModel(value: TestPaperResponse): PaperPresentationModel {
  const response = testPaperResponseSchema.parse(value);
  let questionNumber = 0;
  return {
    response,
    title: `${printableLabel(response.board_id)} — ${printableLabel(response.class_id)} ${printableLabel(response.subject_id)}`,
    filename: safePaperFilename(response),
    sections: response.sections.map((section) => ({
      ...section,
      instruction: section.attempt_count === section.select_count ? "Attempt all questions." : section.attempt_count === 1 ? "Attempt 1 question." : `Attempt any ${section.attempt_count} questions.`,
      marksLabel: `${section.attempt_count} × ${section.marks_each} = ${section.attempt_count * section.marks_each} Marks`,
      questions: section.questions.map((question) => ({ ...question, number: ++questionNumber })),
    })),
  };
}
