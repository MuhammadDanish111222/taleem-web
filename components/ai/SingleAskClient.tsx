"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase/client";
import {
  AskApiError,
  AskRequest,
  AskResponse,
  AskUsage,
  askQuestion,
  loadAskUsage,
} from "@/lib/api/ask";
import { useCatalogueSelection } from "@/lib/state/catalogueSelection";
import { BoardSelector } from "@/components/selectors/BoardSelector";
import { ClassSelector } from "@/components/selectors/ClassSelector";
import { SubjectSelector } from "@/components/selectors/SubjectSelector";
import { ChapterSelector } from "@/components/selectors/ChapterSelector";
import { AnswerRenderer } from "./AnswerRenderer";
import { UsagePanel } from "./UsagePanel";
import { useSupportWhatsapp } from "./useSupportWhatsapp";

const LIMIT_MESSAGE =
  "Your daily question limit has been exceeded. Contact Sir Danish for more usage.";
const FORBIDDEN_ENCODED_CONTENT =
  /(?:data:image\/|data:application\/pdf|base64,|%pdf-)/i;
const LETTERS = /\p{Letter}/gu;
const LATIN_LETTER = /\p{Script=Latin}/u;

interface Notice {
  kind: "info" | "warning" | "error";
  title: string;
  message: string;
  retryable: boolean;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function isTypedEnglishQuestion(value: string): boolean {
  if (FORBIDDEN_ENCODED_CONTENT.test(value)) return false;
  const letters = value.match(LETTERS) ?? [];
  return (
    letters.length > 0 &&
    letters.every((letter) => LATIN_LETTER.test(letter))
  );
}

function errorNotice(error: unknown): Notice {
  if (!(error instanceof AskApiError)) {
    return {
      kind: "error",
      title: "Ask service unavailable",
      message: "The request could not be completed. Please try again.",
      retryable: true,
    };
  }
  switch (error.code) {
    case "USAGE_LIMIT_REACHED":
      return {
        kind: "warning",
        title: "Daily limit reached",
        message: LIMIT_MESSAGE,
        retryable: false,
      };
    case "AUTHENTICATION_EXPIRED":
    case "AUTH_INVALID_TOKEN":
      return {
        kind: "error",
        title: "Authentication expired",
        message: "Your sign-in has expired. Please sign in again.",
        retryable: false,
      };
    case "PROVIDER_UNAVAILABLE":
    case "PROVIDER_FAILURE":
      return {
        kind: "error",
        title: "AI provider unavailable",
        message:
          "The answer provider is temporarily unavailable. You can retry this request.",
        retryable: true,
      };
    case "CONFIGURATION_ERROR":
      return {
        kind: "error",
        title: "Ask configuration error",
        message:
          "The Ask service is not configured correctly. Please contact support.",
        retryable: false,
      };
    default:
      return {
        kind: "error",
        title: "Ask service unavailable",
        message: "The request could not be completed. Please try again.",
        retryable: error.retryable,
      };
  }
}

function responseNotice(answer: AskResponse): Notice | null {
  if (answer.terminalStatus === "answered") return null;
  if (
    answer.terminalStatus === "limit_reached" ||
    answer.errorCode === "USAGE_LIMIT_REACHED"
  ) {
    return {
      kind: "warning",
      title: "Daily limit reached",
      message: LIMIT_MESSAGE,
      retryable: false,
    };
  }
  if (answer.errorCode === "NO_ACTIVE_CORPUS") {
    return {
      kind: "info",
      title: "No active textbook yet",
      message:
        "There is no active textbook corpus for this selection. Try another subject or chapter later.",
      retryable: false,
    };
  }
  if (
    answer.errorCode === "PROVIDER_UNAVAILABLE" ||
    answer.errorCode === "PROVIDER_FAILURE"
  ) {
    return {
      kind: "error",
      title: "AI provider unavailable",
      message:
        "The answer provider is temporarily unavailable. You can retry this request.",
      retryable: true,
    };
  }
  if (answer.errorCode === "CONFIGURATION_ERROR") {
    return {
      kind: "error",
      title: "Ask configuration error",
      message:
        "The Ask service is not configured correctly. Please contact support.",
      retryable: false,
    };
  }
  if (
    answer.terminalStatus === "no_answer" ||
    answer.errorCode === "NO_ANSWER" ||
    answer.errorCode === "GENERAL_AI_DISABLED"
  ) {
    return {
      kind: "info",
      title: "No honest answer available",
      message:
        answer.errorCode === "GENERAL_AI_DISABLED"
          ? "The textbook did not contain enough evidence, and General AI fallback is disabled."
          : "Taleem AI could not find enough reliable information to answer this question.",
      retryable: false,
    };
  }
  return {
    kind: "error",
    title: "Ask service error",
    message: "The answer could not be completed. You can retry this request.",
    retryable: true,
  };
}

function NoticeCard({
  notice,
  onRetry,
  supportUrl,
}: {
  notice: Notice;
  onRetry?: () => void;
  supportUrl?: string;
}) {
  const palette =
    notice.kind === "error"
      ? "border-red-300 bg-red-50 text-red-950"
      : notice.kind === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-blue-200 bg-blue-50 text-blue-950";
  return (
    <section
      role={notice.kind === "error" ? "alert" : "status"}
      className={`rounded-2xl border p-5 ${palette}`}
    >
      <h2 className="text-lg font-bold">{notice.title}</h2>
      <p className="mt-2 leading-7">{notice.message}</p>
      {(notice.retryable || supportUrl) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {notice.retryable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
            >
              Retry same request
            </button>
          )}
          {notice.title === "Daily limit reached" && supportUrl && (
            <a
              href={supportUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600"
            >
              Contact Sir Danish on WhatsApp
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export function SingleAskClient() {
  const { boardId, classId, subjectId, chapterId } =
    useCatalogueSelection();
  const [question, setQuestion] = useState("");
  const [answerMode, setAnswerMode] = useState<"short" | "long">("short");
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryOperation, setRetryOperation] = useState<AskRequest | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeOperationRef = useRef<AskRequest | null>(null);
  const operationEpochRef = useRef(0);
  const support = useSupportWhatsapp();

  const getToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("AUTHENTICATION_REQUIRED");
    return user.getIdToken();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAskUsage(getToken, controller.signal)
      .then(setUsage)
      .catch((error) => {
        if (
          !isAbortError(error) &&
          error instanceof AskApiError &&
          error.status === 401
        ) {
          setNotice(errorNotice(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsageLoading(false);
      });
    return () => controller.abort();
  }, [getToken]);

  const runOperation = useCallback(
    async (operation: AskRequest) => {
      if (controllerRef.current) return;
      const epoch = ++operationEpochRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      activeOperationRef.current = operation;
      setSubmitting(true);
      setAnswer(null);
      setNotice(null);

      try {
        const result = await askQuestion(
          operation,
          getToken,
          controller.signal,
        );
        if (operationEpochRef.current !== epoch) return;
        setUsage(result.usage);
        setUsageLoading(false);
        setAnswer(result);
        const nextNotice = responseNotice(result);
        setNotice(nextNotice);
        setRetryOperation(nextNotice?.retryable ? operation : null);
      } catch (error) {
        if (operationEpochRef.current !== epoch) return;
        if (error instanceof AskApiError && error.usage) {
          setUsage(error.usage);
          setUsageLoading(false);
        }
        if (isAbortError(error)) {
          setNotice({
            kind: "info",
            title: "Request cancelled",
            message:
              "This request was cancelled. Retrying will reuse its request ID safely.",
            retryable: true,
          });
          setRetryOperation(operation);
        } else {
          const nextNotice = errorNotice(error);
          setNotice(nextNotice);
          setRetryOperation(nextNotice.retryable ? operation : null);
        }
      } finally {
        if (operationEpochRef.current === epoch) {
          controllerRef.current = null;
          activeOperationRef.current = null;
          setSubmitting(false);
        }
      }
    },
    [getToken],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !boardId || !classId || !subjectId) return;
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setNotice({
        kind: "warning",
        title: "Enter a question",
        message: "Type your question in English before asking.",
        retryable: false,
      });
      return;
    }
    if (!isTypedEnglishQuestion(normalizedQuestion)) {
      setNotice({
        kind: "warning",
        title: "Typed English text only",
        message:
          "Single Ask accepts a typed English question only. Images, files, encoded attachments, and OCR input are not supported.",
        retryable: false,
      });
      return;
    }

    const operation: AskRequest = {
      requestId: crypto.randomUUID(),
      boardId,
      classId,
      subjectId,
      ...(chapterId ? { chapterId } : {}),
      question: normalizedQuestion,
      answerMode,
      answerStyle: "exam_style",
    };
    setRetryOperation(null);
    void runOperation(operation);
  };

  const cancel = () => {
    const operation = activeOperationRef.current;
    if (!operation || !controllerRef.current) return;
    operationEpochRef.current += 1;
    controllerRef.current.abort();
    controllerRef.current = null;
    activeOperationRef.current = null;
    setSubmitting(false);
    setAnswer(null);
    setRetryOperation(operation);
    setNotice({
      kind: "info",
      title: "Request cancelled",
      message:
        "This request was cancelled. Retrying will reuse its request ID safely.",
      retryable: true,
    });
  };

  const canSubmit =
    Boolean(boardId && classId && subjectId && question.trim()) && !submitting;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50 px-4 py-8 text-slate-950 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-700">
            Taleem AI · Single Ask
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Ask one clear study question
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Select your textbook context and type your question in English.
            Answers clearly distinguish reviewed, textbook-grounded, and
            General AI sources.
          </p>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <form
            onSubmit={submit}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8"
          >
            <fieldset disabled={submitting}>
              <legend className="text-lg font-bold">Textbook selection</legend>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <BoardSelector />
                <ClassSelector />
                <SubjectSelector />
                <ChapterSelector />
              </div>

              <div className="mt-7">
                <div className="flex items-end justify-between gap-3">
                  <label
                    htmlFor="single-ask-question"
                    className="text-sm font-semibold text-slate-800"
                  >
                    Question in English
                  </label>
                  <span className="text-xs text-slate-500">
                    {question.length}/2000
                  </span>
                </div>
                <textarea
                  id="single-ask-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={2000}
                  rows={7}
                  autoComplete="off"
                  spellCheck
                  placeholder="For example: What is the difference between speed and velocity?"
                  className="mt-2 block w-full resize-y rounded-xl border border-slate-300 p-4 leading-7 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Typed text only. Single Ask does not accept images, PDFs,
                  documents, attachments, or OCR input.
                </p>
              </div>

              <fieldset className="mt-7">
                <legend className="text-sm font-semibold text-slate-800">
                  Answer length
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["short", "long"] as const).map((mode) => (
                    <label
                      key={mode}
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        answerMode === mode
                          ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                          : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <input
                        type="radio"
                        name="answer-mode"
                        value={mode}
                        checked={answerMode === mode}
                        onChange={() => setAnswerMode(mode)}
                        className="mr-2 accent-blue-700"
                      />
                      <span className="font-semibold capitalize">{mode}</span>
                      <span className="mt-1 block pl-6 text-xs text-slate-600">
                        {mode === "short"
                          ? "Concise exam-ready response"
                          : "Detailed exam-ready explanation"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </fieldset>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="min-w-36 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Finding answer…" : "Ask Taleem AI"}
              </button>
              {submitting && (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Cancel request
                </button>
              )}
            </div>
          </form>

          <div className="space-y-5">
            <UsagePanel usage={usage} loading={usageLoading} />
            <aside className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
              <h2 className="font-bold">How sources are shown</h2>
              <p className="mt-2">
                Reviewed bank answers, textbook-grounded answers, and General
                AI answers always have different labels. General AI never shows
                textbook citations or textbook visuals.
              </p>
            </aside>
          </div>
        </div>

        <div className="mt-8">
          {notice && (
            <NoticeCard
              notice={notice}
              onRetry={
                notice.retryable && retryOperation && !submitting
                  ? () => void runOperation(retryOperation)
                  : undefined
              }
              supportUrl={support?.url}
            />
          )}
          {submitting && (
            <section
              aria-live="polite"
              className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-blue-950"
            >
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                <p className="font-semibold">
                  Checking the approved bank and selected textbook…
                </p>
              </div>
            </section>
          )}
          {answer && !notice && (
            <AnswerRenderer answer={answer} getToken={getToken} />
          )}
        </div>
      </div>
    </main>
  );
}
