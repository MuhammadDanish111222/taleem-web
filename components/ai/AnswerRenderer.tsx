"use client";

import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import {
  AskAnswerBlock,
  AskCitation,
  AskResponse,
  AskVisual,
  loadAskVisual,
  TokenProvider,
} from "@/lib/api/ask";

export const GENERAL_AI_LABEL =
  "General AI answer — not verified from your selected textbook.";

function sourcePresentation(source: AskResponse["answerSource"]) {
  switch (source) {
    case "approved_bank":
      return {
        label: "Approved answer",
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
        badge: "bg-emerald-700 text-white",
      };
    case "syllabus_grounded":
      return {
        label: "Textbook-grounded answer",
        className: "border-blue-200 bg-blue-50 text-blue-950",
        badge: "bg-blue-700 text-white",
      };
    case "general_knowledge":
      return {
        label: GENERAL_AI_LABEL,
        className: "border-amber-300 bg-amber-50 text-amber-950",
        badge: "bg-amber-700 text-white",
      };
    default:
      return {
        label: "No answer available",
        className: "border-slate-300 bg-slate-50 text-slate-900",
        badge: "bg-slate-700 text-white",
      };
  }
}

function EquationBlock({ latex }: { latex: string }) {
  const rendered = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: true,
        strict: "error",
        trust: false,
        output: "htmlAndMathml",
        maxExpand: 500,
        maxSize: 20,
      });
    } catch {
      return null;
    }
  }, [latex]);

  if (!rendered) {
    return (
      <code className="block overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-100">
        {latex}
      </code>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg bg-white/70 px-4 py-3 text-center"
      aria-label={`Equation: ${latex}`}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function ProtectedVisual({
  visual,
  requestId,
  getToken,
  loadVisual = loadAskVisual,
}: {
  visual: AskVisual;
  requestId: string;
  getToken: TokenProvider;
  loadVisual?: (
    visualId: string,
    requestId: string,
    getToken: TokenProvider,
    signal?: AbortSignal,
  ) => Promise<Blob>;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    loadVisual(visual.visualId, requestId, getToken, controller.signal)
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFailed(true);
        }
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [getToken, loadVisual, requestId, visual.visualId]);

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-3">
      {objectUrl ? (
        // The source is a short-lived object URL made from the authenticated
        // same-origin visual proxy response, never a provider/model URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={visual.description || visual.title}
          className="mx-auto max-h-[32rem] w-auto rounded-lg object-contain"
        />
      ) : failed ? (
        <p role="status" className="py-6 text-center text-sm text-slate-600">
          This reviewed visual is currently unavailable.
        </p>
      ) : (
        <div
          role="status"
          aria-label="Loading reviewed visual"
          className="h-48 animate-pulse rounded-lg bg-slate-200"
        />
      )}
      <figcaption className="mt-3">
        <span className="block font-semibold text-slate-900">
          {visual.title}
        </span>
        {visual.description && (
          <span className="mt-1 block text-sm text-slate-600">
            {visual.description}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function AnswerBlock({
  block,
  visuals,
  requestId,
  getToken,
  loadVisual,
}: {
  block: AskAnswerBlock;
  visuals: ReadonlyMap<string, AskVisual>;
  requestId: string;
  getToken: TokenProvider;
  loadVisual?: (
    visualId: string,
    requestId: string,
    getToken: TokenProvider,
    signal?: AbortSignal,
  ) => Promise<Blob>;
}) {
  if (block.type === "paragraph") {
    return (
      <p className="whitespace-pre-wrap text-[1.02rem] leading-8">
        {block.text}
      </p>
    );
  }
  if (block.type === "heading") {
    return block.level === 2 ? (
      <h3 className="pt-3 text-xl font-bold text-slate-950">{block.text}</h3>
    ) : (
      <h4 className="pt-2 text-lg font-semibold text-slate-900">{block.text}</h4>
    );
  }
  if (block.type === "bullet_list") {
    return (
      <ul className="list-disc space-y-2 pl-7 text-[1.02rem] leading-8">
        {block.items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "equation") {
    return <EquationBlock latex={block.latex} />;
  }
  const visual = visuals.get(block.visualId);
  if (!visual) return null;
  return (
    <ProtectedVisual
      visual={visual}
      requestId={requestId}
      getToken={getToken}
      loadVisual={loadVisual}
    />
  );
}

export function AnswerBlockList({
  blocks,
  visuals,
  requestId,
  getToken,
  loadVisual,
}: {
  blocks: AskAnswerBlock[];
  visuals: AskVisual[];
  requestId: string;
  getToken: TokenProvider;
  loadVisual?: (
    visualId: string,
    requestId: string,
    getToken: TokenProvider,
    signal?: AbortSignal,
  ) => Promise<Blob>;
}) {
  const visualMap = new Map(visuals.map((visual) => [visual.visualId, visual]));
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => (
        <AnswerBlock
          key={`${block.type}-${index}`}
          block={block}
          visuals={visualMap}
          requestId={requestId}
          getToken={getToken}
          loadVisual={loadVisual}
        />
      ))}
    </div>
  );
}

function CitationList({ citations }: { citations: AskCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <section aria-labelledby="answer-citations" className="mt-7 border-t pt-5">
      <h3 id="answer-citations" className="font-semibold text-slate-900">
        Textbook references
      </h3>
      <ol className="mt-3 space-y-2 text-sm text-slate-700">
        {citations.map((citation) => {
          const page =
            citation.pageStart === null
              ? null
              : citation.pageEnd && citation.pageEnd !== citation.pageStart
                ? `pages ${citation.pageStart}–${citation.pageEnd}`
                : `page ${citation.pageStart}`;
          return (
            <li
              key={citation.citationId}
              className="rounded-lg bg-white/70 px-3 py-2"
            >
              {[citation.topicNo, citation.topicTitle, page]
                .filter(Boolean)
                .join(" · ") || "Reviewed textbook source"}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function AnswerRenderer({
  answer,
  getToken,
  visuals: visualOverride,
  loadVisual,
}: {
  answer: AskResponse;
  getToken: TokenProvider;
  visuals?: AskVisual[];
  loadVisual?: (
    visualId: string,
    requestId: string,
    getToken: TokenProvider,
    signal?: AbortSignal,
  ) => Promise<Blob>;
}) {
  if (answer.terminalStatus !== "answered" || !answer.answerSource) {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-slate-300 bg-slate-50 p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {answer.terminalStatus === "limit_reached"
            ? "Daily limit reached"
            : "No answer available"}
        </h2>
        <p className="mt-2 text-slate-700">
          {answer.errorCode === "NO_ACTIVE_CORPUS"
            ? "There is no active textbook corpus for this selection yet."
            : answer.errorCode === "GENERAL_AI_DISABLED"
              ? "The textbook did not contain enough evidence, and General AI fallback is disabled."
              : "Taleem AI could not provide an honest answer for this question."}
        </p>
      </section>
    );
  }

  const presentation = sourcePresentation(answer.answerSource);
  const isGeneral = answer.answerSource === "general_knowledge";
  const visuals = isGeneral ? [] : visualOverride ?? answer.visuals;
  const citations = isGeneral ? [] : answer.citations;

  return (
    <article
      aria-live="polite"
      className={`rounded-2xl border p-5 shadow-sm sm:p-7 ${presentation.className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${presentation.badge}`}
          >
            {answer.answerMode === "short" ? "Short answer" : "Long answer"}
          </span>
          <h2 className="mt-3 text-xl font-bold">{presentation.label}</h2>
        </div>
        {answer.answerSource === "approved_bank" && (
          <span className="rounded-full border border-emerald-300 bg-white/70 px-3 py-1 text-xs font-semibold text-emerald-800">
            Reviewed question bank
          </span>
        )}
      </header>

      <div className="mt-6">
        <AnswerBlockList
          blocks={answer.blocks}
          visuals={visuals}
          requestId={answer.requestId}
          getToken={getToken}
          loadVisual={loadVisual}
        />
      </div>

      <CitationList citations={citations} />
    </article>
  );
}
