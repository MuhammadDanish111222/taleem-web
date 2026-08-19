"use client";

import { approvedQuestionSchema, type ApprovedQuestionInput } from "@/lib/ai/adminContracts";

export interface ApprovedQuestionDraft {
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  answerMode: "short" | "long" | "mcq";
  difficulty: "easy" | "medium" | "hard";
  marks: string;
  question: string;
  blocksJson: string;
  mcqOptionsJson: string;
  citationIds: string;
  questionVisualIds: string;
  answerVisualIds: string;
}

export const EMPTY_APPROVED_QUESTION: ApprovedQuestionDraft = {
  boardId: "",
  classId: "",
  subjectId: "",
  chapterId: "",
  answerMode: "short",
  difficulty: "medium",
  marks: "2",
  question: "",
  blocksJson: JSON.stringify([{ type: "paragraph", text: "" }], null, 2),
  mcqOptionsJson: "[]",
  citationIds: "",
  questionVisualIds: "",
  answerVisualIds: "",
};

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

export function parseApprovedQuestion(draft: ApprovedQuestionDraft): ApprovedQuestionInput {
  let blocks: unknown;
  let mcqOptions: unknown;
  try {
    blocks = JSON.parse(draft.blocksJson);
    mcqOptions = JSON.parse(draft.mcqOptionsJson);
  } catch {
    throw new Error("Answer blocks and MCQ options must be valid JSON");
  }
  const result = approvedQuestionSchema.safeParse({
    board_id: draft.boardId,
    class_id: draft.classId,
    subject_id: draft.subjectId,
    chapter_id: draft.chapterId.trim() || null,
    answer_mode: draft.answerMode,
    answer_style: "exam_style",
    difficulty: draft.difficulty,
    marks: Number(draft.marks),
    question: draft.question,
    blocks,
    mcq_options: mcqOptions,
    citation_ids: lines(draft.citationIds),
    question_visual_ids: lines(draft.questionVisualIds),
    answer_visual_ids: lines(draft.answerVisualIds),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Approved question is invalid");
  }
  return result.data;
}

export default function ApprovedQuestionEditor({
  value,
  onChange,
  idPrefix,
}: {
  value: ApprovedQuestionDraft;
  onChange: (next: ApprovedQuestionDraft) => void;
  idPrefix: string;
}) {
  const set = <K extends keyof ApprovedQuestionDraft>(key: K, next: ApprovedQuestionDraft[K]) => {
    onChange({ ...value, [key]: next });
  };
  const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <div className="grid gap-4 text-slate-900">
      <div className="grid gap-3 md:grid-cols-4">
        {([
          ["boardId", "Board"],
          ["classId", "Class"],
          ["subjectId", "Subject"],
          ["chapterId", "Chapter (optional)"],
        ] as const).map(([key, label]) => (
          <label key={key} htmlFor={`${idPrefix}-${key}`} className="grid gap-1 text-sm font-semibold text-slate-800">
            {label}
            <input id={`${idPrefix}-${key}`} className={fieldClass} value={value[key]} onChange={(event) => set(key, event.target.value)} required={key !== "chapterId"} />
          </label>
        ))}
      </div>

      <label htmlFor={`${idPrefix}-question`} className="grid gap-1 text-sm font-semibold text-slate-800">
        Question
        <textarea id={`${idPrefix}-question`} className={`${fieldClass} min-h-24`} value={value.question} onChange={(event) => set("question", event.target.value)} maxLength={4000} required />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <label htmlFor={`${idPrefix}-mode`} className="grid gap-1 text-sm font-semibold text-slate-800">
          Answer mode
          <select id={`${idPrefix}-mode`} className={fieldClass} value={value.answerMode} onChange={(event) => set("answerMode", event.target.value as ApprovedQuestionDraft["answerMode"])}>
            <option value="short">Short</option>
            <option value="long">Long</option>
            <option value="mcq">MCQ</option>
          </select>
        </label>
        <label htmlFor={`${idPrefix}-difficulty`} className="grid gap-1 text-sm font-semibold text-slate-800">
          Difficulty
          <select id={`${idPrefix}-difficulty`} className={fieldClass} value={value.difficulty} onChange={(event) => set("difficulty", event.target.value as ApprovedQuestionDraft["difficulty"])}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label htmlFor={`${idPrefix}-marks`} className="grid gap-1 text-sm font-semibold text-slate-800">
          Marks
          <input id={`${idPrefix}-marks`} type="number" min="0.01" max="1000" step="0.5" className={fieldClass} value={value.marks} onChange={(event) => set("marks", event.target.value)} required />
        </label>
      </div>

      <label htmlFor={`${idPrefix}-blocks`} className="grid gap-1 text-sm font-semibold text-slate-800">
        Ordered answer blocks (JSON)
        <textarea id={`${idPrefix}-blocks`} className={`${fieldClass} min-h-52 font-mono`} value={value.blocksJson} onChange={(event) => set("blocksJson", event.target.value)} spellCheck={false} required />
        <span className="font-medium text-xs text-slate-600">Allowed block types: paragraph, heading, bullet_list, equation, visual_ref. Visual blocks stay in this exact order.</span>
      </label>

      {value.answerMode === "mcq" ? (
        <label htmlFor={`${idPrefix}-options`} className="grid gap-1 text-sm font-semibold text-slate-800">
          MCQ options (JSON; exactly one is_correct)
          <textarea id={`${idPrefix}-options`} className={`${fieldClass} min-h-36 font-mono`} value={value.mcqOptionsJson} onChange={(event) => set("mcqOptionsJson", event.target.value)} spellCheck={false} required />
        </label>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label htmlFor={`${idPrefix}-citations`} className="grid gap-1 text-sm font-semibold text-slate-800">
          Reviewed citation UUIDs (one per line)
          <textarea id={`${idPrefix}-citations`} className={`${fieldClass} min-h-28 font-mono`} value={value.citationIds} onChange={(event) => set("citationIds", event.target.value)} spellCheck={false} />
        </label>
        <label htmlFor={`${idPrefix}-question-visuals`} className="grid gap-1 text-sm font-semibold text-slate-800">
          Question Visual IDs (shown on student test papers; one per line)
          <textarea id={`${idPrefix}-question-visuals`} className={`${fieldClass} min-h-28 font-mono`} value={value.questionVisualIds} onChange={(event) => set("questionVisualIds", event.target.value)} spellCheck={false} />
        </label>
        <label htmlFor={`${idPrefix}-answer-visuals`} className="grid gap-1 text-sm font-semibold text-slate-800">
          Answer Visual IDs (shown with the answer/explanation; one per line)
          <textarea id={`${idPrefix}-answer-visuals`} className={`${fieldClass} min-h-28 font-mono`} value={value.answerVisualIds} onChange={(event) => set("answerVisualIds", event.target.value)} spellCheck={false} />
        </label>
      </div>
      <p className="text-xs font-medium text-slate-600">Answer style is fixed to exam_style. IDs are validated server-side against the selected scope; no URL or storage key is accepted.</p>
    </div>
  );
}
