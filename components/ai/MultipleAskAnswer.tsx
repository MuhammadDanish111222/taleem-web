"use client";

import type { AskAnswerBlock, AskVisual, TokenProvider } from "@/lib/api/ask";
import type { MultipleAskItem } from "@/lib/api/multipleAsk";
import { AnswerBlockList } from "./AnswerRenderer";

function safeBlocks(value: Array<Record<string, unknown>>): AskAnswerBlock[] {
  return value.filter((block) =>
    ["paragraph", "heading", "bullet_list", "equation", "visual_ref"].includes(
      String(block.type),
    ),
  ) as AskAnswerBlock[];
}

function provenance(item: MultipleAskItem) {
  const result = item.result;
  if (!result || result.answerSource === "general_knowledge") return "Not from book";
  return ["Answer from book", ...result.topicNames.slice(0, item.answerMode === "long" ? 2 : 1)].join(" · ");
}

export function MultipleAskAnswer({
  item,
  jobId,
  getToken,
}: {
  item: MultipleAskItem;
  jobId: string;
  getToken: TokenProvider;
}) {
  const result = item.result;
  if (!result || !item.answerMode || item.answerMode === "not_clear") return null;

  if (item.answerMode === "mcq") {
    const mcq = result.mcqResult;
    if (!mcq) return null;
    return (
      <section className="mt-4 space-y-4" aria-label="Solved multiple choice answer">
        {item.mcqOptions.length > 0 ? (
          <ol className="space-y-2" aria-label="Answer options">
            {item.mcqOptions.map((option) => {
              const correct = option.label === mcq.selectedOption;
              return (
                <li
                  key={option.label}
                  className={`rounded-lg border px-4 py-3 ${correct ? "border-emerald-500 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-800"}`}
                >
                  <span className="font-semibold">{option.label}. </span>
                  {option.text}
                  {correct && (
                    <span className="ml-2 font-semibold" aria-label="Correct option">
                      ✓ <span className="sr-only">Correct answer</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950">
            <span className="font-semibold">Correct answer: </span>
            {mcq.correctAnswerText}
          </p>
        )}
        <p className="text-[1.02rem] leading-8 text-slate-800">{mcq.explanation}</p>
      </section>
    );
  }

  const visuals: AskVisual[] = result.answerSource === "general_knowledge"
    ? []
    : result.visuals.map((visual) => ({ ...visual, displayPolicy: "llm_decide" }));
  return (
    <section className="mt-4">
      <p className="text-sm font-semibold text-slate-600">{provenance(item)}</p>
      <div className="mt-4">
        <AnswerBlockList
          blocks={safeBlocks(result.blocks)}
          visuals={visuals}
          requestId={jobId}
          getToken={getToken}
        />
      </div>
    </section>
  );
}
