"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/useAuth";
import { AskUsage, loadAskUsage } from "@/lib/api/ask";
import {
  MultipleAskApiError,
  MultipleAskInputKind,
  MultipleAskItem,
  MultipleAskMode,
  MultipleAskScope,
  MultipleAskStatus,
  createUploadSession,
  finalizeUpload,
  getMultipleAskStatus,
  multipleAskTerminalStatuses,
  putToSignedUpload,
  resumeMultipleAskJob,
  submitCorrection,
  submitPastedText,
} from "@/lib/api/multipleAsk";
import { useCatalogueSelection } from "@/lib/state/catalogueSelection";
import { BoardSelector } from "@/components/selectors/BoardSelector";
import { ClassSelector } from "@/components/selectors/ClassSelector";
import { SubjectSelector } from "@/components/selectors/SubjectSelector";
import { ChapterSelector } from "@/components/selectors/ChapterSelector";
import { MultipleAskAnswer } from "./MultipleAskAnswer";
import { UsagePanel } from "./UsagePanel";
import { useSupportWhatsapp } from "./useSupportWhatsapp";

const RESUME_KEY = "taleem-multiple-ask-resume-v1";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const TEXT_LIMIT = 30_000;
const fileTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
type ResumeRecord = {
  jobId: string;
  scope: MultipleAskScope;
  inputKind: MultipleAskInputKind;
  savedAt: string;
};
type CorrectionDraft = {
  questionText: string;
  answerMode: Exclude<MultipleAskMode, "not_clear">;
  mcqOptions: Array<{ label: string; text: string }>;
};
const uuid = () => crypto.randomUUID();
const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";
const isTerminal = (status: MultipleAskStatus | null) =>
  !!status && multipleAskTerminalStatuses.has(status.workflowStatus);
function dateLabel(value: string | null) {
  if (!value)
    return "Temporary source data is removed shortly after processing; the result remains only until its stated expiry.";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "This temporary result will be removed at its retention deadline."
    : `Temporary upload and job data will be removed after ${new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(parsed)} (Pakistan time).`;
}
function statusCopy(status: MultipleAskStatus) {
  return (
    (
      {
        queued: "Queued for secure validation",
        validating: "Validating your paper",
        validated: "Paper validated",
        extracting: "Extracting questions",
        needs_correction: "A few questions need your correction",
        ready_to_answer: "Ready to answer",
        answering: "Answering questions",
        partially_completed: "Some answers are ready",
        completed: "Answers complete",
        invalid: "The paper or text could not be accepted",
        too_many_questions: "Too many questions were found",
        limit_reached: "Your batch limit has been reached",
        failed: "The batch could not be completed",
        cancelled: "The batch was cancelled",
      } as Record<string, string>
    )[status.workflowStatus] ?? "Processing your batch"
  );
}
function terminalErrorCopy(code: string | null) {
  if (code === "MULTIPLE_ASK_OCR_TIMEOUT")
    return "Question extraction took too long. Please try a clearer, smaller image, a text-based PDF, or pasted paper text.";
  if (code === "MULTIPLE_ASK_OCR_UNAVAILABLE")
    return "Question extraction is temporarily unavailable. Please try again later.";
  if (code === "MULTIPLE_ASK_OCR_FAILED")
    return "The uploaded paper could not be extracted. Please try a clearer image, a text-based PDF, or pasted paper text.";
  if (code === "MULTIPLE_ASK_EXTRACTION_FAILED")
    return "The uploaded paper could not be extracted. Please try again with a clearer image, PDF, or pasted text.";
  return null;
}
function errorCopy(error: unknown) {
  if (!(error instanceof MultipleAskApiError))
    return "Network problem. Your durable job has not been changed; please retry.";
  if (error.code === "MULTIPLE_ASK_JOB_NOT_FOUND" || error.status === 404)
    return "This temporary job is no longer available. It may have expired.";
  if (error.code === "USAGE_LIMIT_REACHED")
    return "Your batch limit has been reached.";
  if (error.code === "MULTIPLE_ASK_INPUT_TOO_LARGE")
    return "This file is larger than the allowed size.";
  if (error.code === "MULTIPLE_ASK_INPUT_INVALID")
    return "This paper or text could not be accepted.";
  return error.retryable
    ? "The service is temporarily unavailable. You can retry safely."
    : "This action could not be completed.";
}
function initialDraft(item: MultipleAskItem): CorrectionDraft {
  return {
    questionText: item.questionText ?? "",
    answerMode:
      item.answerMode && item.answerMode !== "not_clear"
        ? item.answerMode
        : "short",
    mcqOptions: item.mcqOptions.map((option) => ({
      label: option.label,
      text: option.text,
    })),
  };
}

export function MultipleAskClient() {
  const { user, loading } = useAuth();
  const { boardId, classId, subjectId, chapterId } = useCatalogueSelection();
  const [kind, setKind] = useState<MultipleAskInputKind>("image");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<MultipleAskStatus | null>(null);
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CorrectionDraft>>({});
  const [correcting, setCorrecting] = useState<string | null>(null);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttempt = useRef(0);
  const statusRef = useRef<MultipleAskStatus | null>(null);
  statusRef.current = status;
  const support = useSupportWhatsapp();
  const getToken = useCallback(async () => {
    const current = auth.currentUser;
    if (!current)
      throw new MultipleAskApiError("AUTHENTICATION_EXPIRED", 401, false);
    return current.getIdToken();
  }, []);
  const scope = useMemo(
    () =>
      boardId && classId && subjectId
        ? { boardId, classId, subjectId, ...(chapterId ? { chapterId } : {}) }
        : null,
    [boardId, classId, subjectId, chapterId],
  );
  const clearResume = useCallback(
    () => localStorage.removeItem(RESUME_KEY),
    [],
  );
  const persist = useCallback(
    (
      next: MultipleAskStatus | { jobId: string; workflowStatus: string },
      fallback?: MultipleAskScope & { inputKind?: MultipleAskInputKind },
    ) => {
      const savedScope = "scope" in next ? next.scope : fallback;
      const inputKind =
        "inputKind" in next ? next.inputKind : fallback?.inputKind;
      if (savedScope && inputKind)
        localStorage.setItem(
          RESUME_KEY,
          JSON.stringify({
            jobId: next.jobId,
            scope: savedScope,
            inputKind,
            savedAt: new Date().toISOString(),
          } satisfies ResumeRecord),
        );
    },
    [],
  );
  const applyStatus = useCallback(
    (next: MultipleAskStatus) => {
      setStatus(next);
      setNotice(null);
      if (
        next.workflowStatus === "invalid" ||
        next.workflowStatus === "cancelled"
      )
        clearResume();
      else persist(next);
    },
    [clearResume, persist],
  );
  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);
  const loadStatus = useCallback(
    async (jobId: string, signal?: AbortSignal) => {
      const next = await getMultipleAskStatus(jobId, getToken, signal);
      applyStatus(next);
      return next;
    },
    [applyStatus, getToken],
  );
  useEffect(() => {
    if (!user) return;
    setUsageLoading(true);
    const aborter = new AbortController();
    loadAskUsage(getToken, aborter.signal)
      .then(setUsage)
      .catch(() => undefined)
      .finally(() => {
        if (!aborter.signal.aborted) setUsageLoading(false);
      });
    return () => aborter.abort();
  }, [getToken, user]);
  useEffect(() => {
    if (!user || status) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(RESUME_KEY) ?? "null",
      ) as ResumeRecord | null;
      if (!saved?.jobId || !saved.scope) return;
      setKind(saved.inputKind);
      void loadStatus(saved.jobId).catch((error) => {
        if (error instanceof MultipleAskApiError && error.status === 404) {
          clearResume();
          setStatus(null);
          setNotice(null);
        } else setNotice(errorCopy(error));
      });
    } catch {
      clearResume();
    }
  }, [clearResume, loadStatus, status, user]);
  useEffect(() => {
    stopPolling();
    if (
      !status ||
      isTerminal(status) ||
      status.workflowStatus === "needs_correction"
    )
      return;
    let cancelled = false;
    const poll = async () => {
      try {
        await loadStatus(status.jobId);
        pollAttempt.current = 0;
      } catch (error) {
        if (!cancelled) {
          if (error instanceof MultipleAskApiError && error.status === 404) {
            clearResume();
            setStatus(null);
            setNotice(null);
          } else {
            pollAttempt.current += 1;
            setNotice(errorCopy(error));
          }
        }
      }
      if (
        !cancelled &&
        statusRef.current &&
        !isTerminal(statusRef.current) &&
        statusRef.current.workflowStatus !== "needs_correction"
      )
        pollTimer.current = setTimeout(
          () => void poll(),
          Math.min(12_000, 2_000 * (pollAttempt.current + 1)),
        );
    };
    pollTimer.current = setTimeout(() => void poll(), 1_500);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [loadStatus, status, stopPolling]);
  useEffect(
    () => () => {
      controller.current?.abort();
      stopPolling();
    },
    [stopPolling],
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (active || !scope) {
      if (!scope)
        setNotice("Select board, class, and subject from the catalogue first.");
      return;
    }
    if (kind === "text" && (!text.trim() || text.length > TEXT_LIMIT)) {
      setNotice(
        `Paste between 1 and ${TEXT_LIMIT.toLocaleString()} characters.`,
      );
      return;
    }
    if (kind !== "text") {
      if (!file) {
        setNotice("Choose one image or PDF first.");
        return;
      }
      const expected =
        kind === "image"
          ? file.type.startsWith("image/")
          : file.type === "application/pdf";
      if (
        !expected ||
        !fileTypes.has(file.type) ||
        file.size > (kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)
      ) {
        setNotice(
          kind === "image"
            ? "Use a JPEG, PNG, or WebP image up to 8 MB."
            : "Use a PDF up to 15 MB.",
        );
        return;
      }
    }
    const epoch = ++operation.current;
    const aborter = new AbortController();
    controller.current = aborter;
    setActive(true);
    setNotice(null);
    setStatus(null);
    clearResume();
    try {
      let started;
      if (kind === "text")
        started = await submitPastedText(
          { ...scope, requestId: uuid(), text: text.trim() },
          getToken,
          aborter.signal,
        );
      else {
        const selected = file!;
        const sessionRequestId = uuid();
        const session = await createUploadSession(
          {
            ...scope,
            requestId: sessionRequestId,
            inputKind: kind,
            contentType: selected.type,
            sizeBytes: selected.size,
          },
          getToken,
          aborter.signal,
        );
        await putToSignedUpload(
          session.uploadUrl,
          session.uploadMethod,
          session.uploadHeaders,
          selected,
          aborter.signal,
        );
        started = await finalizeUpload(
          { requestId: sessionRequestId, sessionId: session.sessionId },
          getToken,
          aborter.signal,
        );
      }
      if (operation.current !== epoch) return;
      persist(started, { ...scope, inputKind: kind });
      await loadStatus(started.jobId, aborter.signal);
      setText("");
      setFile(null);
    } catch (error) {
      if (operation.current === epoch && !isAbort(error))
        setNotice(errorCopy(error));
    } finally {
      if (operation.current === epoch) {
        controller.current = null;
        setActive(false);
      }
    }
  };
  const correct = async (item: MultipleAskItem) => {
    if (!status || correcting) return;
    const draft = drafts[item.itemId] ?? initialDraft(item);
    const options = draft.mcqOptions.map((option) => ({
      label: option.label,
      text: option.text.trim(),
    }));
    if (!draft.questionText.trim()) {
      setNotice("Enter the question text before continuing.");
      return;
    }
    if (draft.answerMode === "mcq" && options.some((option) => !option.text)) {
      setNotice("Complete every added MCQ option, or remove it.");
      return;
    }
    setCorrecting(item.itemId);
    setNotice(null);
    try {
      const next = await submitCorrection(
        status.jobId,
        item.itemId,
        {
          requestId: uuid(),
          questionText: draft.questionText.trim(),
          answerMode: draft.answerMode,
          mcqOptions: draft.answerMode === "mcq" ? options : [],
        },
        getToken,
      );
      applyStatus(next);
      if (next.workflowStatus === "ready_to_answer") {
        const resumed = await resumeMultipleAskJob(
          next.jobId,
          uuid(),
          getToken,
        );
        await loadStatus(resumed.jobId);
      }
    } catch (error) {
      setNotice(errorCopy(error));
    } finally {
      setCorrecting(null);
    }
  };
  const resume = async () => {
    if (!status || active) return;
    setActive(true);
    setNotice(null);
    try {
      const started = await resumeMultipleAskJob(
        status.jobId,
        uuid(),
        getToken,
      );
      await loadStatus(started.jobId);
    } catch (error) {
      setNotice(errorCopy(error));
    } finally {
      setActive(false);
    }
  };
  const canSubmit = !active && (kind === "text" ? !!text.trim() : !!file);
  const correctionItems =
    status?.items.filter(
      (item) =>
        item.itemStatus === "needs_correction" ||
        item.answerMode === "not_clear",
    ) ?? [];
  if (loading)
    return <main className="min-h-screen bg-slate-50 p-8" aria-busy="true" />;
  if (!user)
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <section className="mx-auto max-w-xl rounded-2xl border bg-white p-7">
          <h1 className="text-2xl font-bold">Sign in to use Multiple Ask</h1>
          <p className="mt-2 text-slate-600">
            Choose the existing anonymous or Google sign-in option to upload a
            paper or paste questions.
          </p>
        </section>
      </main>
    );
  return (
    <main className="min-h-screen bg-slate-50 py-10 print:bg-white print:py-0">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="print:hidden">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            Taleem AI · Multiple Ask
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-5xl">
            Answer a whole paper, one secure batch at a time
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
            Upload one image or PDF, or paste paper text. Review unclear
            extraction before the same batch continues to answering.
          </p>
        </header>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] print:block">
          <form
            onSubmit={submit}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 print:hidden"
          >
            <fieldset disabled={active}>
              <legend className="text-lg font-bold">Textbook selection</legend>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <BoardSelector />
                <ClassSelector />
                <SubjectSelector />
                <ChapterSelector />
              </div>
              <fieldset className="mt-7">
                <legend className="text-sm font-semibold">Paper input</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {(["image", "pdf", "text"] as const).map((value) => (
                    <label
                      key={value}
                      className={`cursor-pointer rounded-xl border p-3 ${kind === value ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
                    >
                      <input
                        className="mr-2 accent-blue-700"
                        type="radio"
                        name="multiple-input"
                        checked={kind === value}
                        onChange={() => {
                          setKind(value);
                          setNotice(null);
                        }}
                      />
                      {value === "image"
                        ? "Image"
                        : value === "pdf"
                          ? "PDF"
                          : "Pasted text"}
                    </label>
                  ))}
                </div>
              </fieldset>
              {kind === "text" ? (
                <div className="mt-5">
                  <label
                    htmlFor="multiple-ask-text"
                    className="text-sm font-semibold"
                  >
                    Paste paper text
                  </label>
                  <textarea
                    id="multiple-ask-text"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    maxLength={TEXT_LIMIT}
                    rows={10}
                    autoComplete="off"
                    className="mt-2 block w-full rounded-xl border border-slate-300 p-4 leading-7"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {text.length.toLocaleString()}/{TEXT_LIMIT.toLocaleString()}
                    . Pasted source text stays only in this form and is never
                    saved in this browser.
                  </p>
                </div>
              ) : (
                <div className="mt-5">
                  <label
                    htmlFor="multiple-ask-file"
                    className="text-sm font-semibold"
                  >
                    {kind === "image"
                      ? "JPEG, PNG, or WebP image (up to 8 MB)"
                      : "PDF (up to 15 MB)"}
                  </label>
                  <input
                    id="multiple-ask-file"
                    type="file"
                    accept={
                      kind === "image"
                        ? "image/jpeg,image/png,image/webp"
                        : "application/pdf"
                    }
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 p-3"
                  />
                </div>
              )}
            </fieldset>
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-8 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white disabled:opacity-50"
            >
              {active ? "Submitting securely…" : "Submit paper"}
            </button>
            {!scope && (kind === "text" ? !!text.trim() : !!file) && (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Select Board, Class, and Subject under Textbook selection above
                before submitting.
              </p>
            )}
            {active && (
              <button
                type="button"
                onClick={() => {
                  operation.current += 1;
                  controller.current?.abort();
                  controller.current = null;
                  setActive(false);
                  setNotice(
                    "Submission cancelled before a new job was created.",
                  );
                }}
                className="ml-3 rounded-xl border px-5 py-3 font-semibold"
              >
                Cancel
              </button>
            )}
          </form>
          <aside className="space-y-5 print:hidden">
            <UsagePanel usage={usage} loading={usageLoading} />
            <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6">
              <h2 className="font-bold">Temporary retention</h2>
              <p className="mt-2">
                {dateLabel(status?.retentionExpiresAt ?? null)}
              </p>
            </section>
          </aside>
        </div>
        {notice && (
          <section
            role="alert"
            className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 print:hidden"
          >
            {notice}
            {status?.workflowStatus === "limit_reached" && support?.url && (
              <a
                className="ml-3 font-bold underline"
                href={support.url}
                target="_blank"
                rel="noreferrer"
              >
                Contact Sir Danish on WhatsApp
              </a>
            )}
          </section>
        )}
        {status && (
          <BatchState
            status={status}
            correctionItems={correctionItems}
            drafts={drafts}
            setDrafts={setDrafts}
            correcting={correcting}
            correct={correct}
            active={active}
            resume={resume}
            getToken={getToken}
          />
        )}
      </div>
    </main>
  );
}

function BatchState({
  status,
  correctionItems,
  drafts,
  setDrafts,
  correcting,
  correct,
  active,
  resume,
  getToken,
}: {
  status: MultipleAskStatus;
  correctionItems: MultipleAskItem[];
  drafts: Record<string, CorrectionDraft>;
  setDrafts: React.Dispatch<
    React.SetStateAction<Record<string, CorrectionDraft>>
  >;
  correcting: string | null;
  correct: (item: MultipleAskItem) => Promise<void>;
  active: boolean;
  resume: () => Promise<void>;
  getToken: () => Promise<string>;
}) {
  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{statusCopy(status)}</h2>
            <p className="mt-1 text-sm">
              {status.summary.total} extracted item
              {status.summary.total === 1 ? "" : "s"};{" "}
              {
                status.items.filter((item) => item.itemStatus === "answered")
                  .length
              }{" "}
              answered.
            </p>
          </div>
          {typeof status.queue.progress === "number" && (
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold">
              Queue progress: {status.queue.progress}%
            </span>
          )}
      </div>
      <p className="mt-3 text-sm">{dateLabel(status.retentionExpiresAt)}</p>
      {status.workflowStatus === "failed" && terminalErrorCopy(status.terminalErrorCode) && (
        <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
          {terminalErrorCopy(status.terminalErrorCode)}
        </p>
      )}
      {status.workflowStatus === "ready_to_answer" && (
          <button
            type="button"
            onClick={() => void resume()}
            disabled={active}
            className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white"
          >
            Continue answering this batch
          </button>
        )}
      </div>
      {correctionItems.length > 0 && (
        <section className="mt-6 rounded-3xl border border-amber-200 bg-white p-5 sm:p-7 print:hidden">
          <h2 className="text-xl font-bold">Check unclear questions</h2>
          <p className="mt-2 text-slate-600">
            Corrections continue this same batch and do not use another batch
            limit.
          </p>
          <div className="mt-6 space-y-6">
            {correctionItems.map((item) => {
              const draft = drafts[item.itemId] ?? initialDraft(item);
              return (
                <article
                  key={item.itemId}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <h3 className="font-bold">
                    {item.displayLabel ?? `Question ${item.itemIndex + 1}`}
                    {item.sectionContext ? ` — ${item.sectionContext}` : ""}
                  </h3>
                  <p className="mt-1 text-sm text-amber-800">
                    Why it needs review:{" "}
                    {item.unclearReason ?? "The question was not clear enough."}
                  </p>
                  <textarea
                    value={draft.questionText}
                    onChange={(event) =>
                      setDrafts((old) => ({
                        ...old,
                        [item.itemId]: {
                          ...draft,
                          questionText: event.target.value,
                        },
                      }))
                    }
                    rows={4}
                    className="mt-4 block w-full rounded-xl border p-3"
                    placeholder="Enter the complete question"
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    {(["short", "long", "mcq"] as const).map((mode) => (
                      <label key={mode}>
                        <input
                          className="mr-1"
                          type="radio"
                          checked={draft.answerMode === mode}
                          onChange={() =>
                            setDrafts((old) => ({
                              ...old,
                              [item.itemId]: { ...draft, answerMode: mode },
                            }))
                          }
                        />
                        {mode === "mcq"
                          ? "MCQ"
                          : `${mode[0].toUpperCase()}${mode.slice(1)} question`}
                      </label>
                    ))}
                  </div>
                  {draft.answerMode === "mcq" && (
                    <div className="mt-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {draft.mcqOptions.map((option, optionIndex) => (
                          <label
                            key={option.label}
                            className="text-sm font-semibold"
                          >
                            Option {option.label}
                            <input
                              value={option.text}
                              onChange={(event) =>
                                setDrafts((old) => ({
                                  ...old,
                                  [item.itemId]: {
                                    ...draft,
                                    mcqOptions: draft.mcqOptions.map(
                                      (current, index) =>
                                        index === optionIndex
                                          ? {
                                              ...current,
                                              text: event.target.value,
                                            }
                                          : current,
                                    ),
                                  },
                                }))
                              }
                              className="mt-1 block w-full rounded-lg border p-2 font-normal"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setDrafts((old) => ({
                              ...old,
                              [item.itemId]: {
                                ...draft,
                                mcqOptions: [
                                  ...draft.mcqOptions,
                                  {
                                    label: String.fromCharCode(
                                      65 + draft.mcqOptions.length,
                                    ),
                                    text: "",
                                  },
                                ],
                              },
                            }))
                          }
                          disabled={draft.mcqOptions.length >= 12}
                          className="rounded-lg border px-3 py-2 text-sm font-semibold"
                        >
                          Add option
                        </button>
                        {draft.mcqOptions.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDrafts((old) => ({
                                ...old,
                                [item.itemId]: {
                                  ...draft,
                                  mcqOptions: draft.mcqOptions.slice(0, -1),
                                },
                              }))
                            }
                            className="rounded-lg border px-3 py-2 text-sm font-semibold"
                          >
                            Remove last
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void correct(item)}
                    disabled={correcting !== null}
                    className="mt-5 rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white"
                  >
                    {correcting === item.itemId
                      ? "Saving correction…"
                      : "Save correction"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {(status.workflowStatus === "completed" ||
        status.workflowStatus === "partially_completed") && (
        <>
          <div className="mt-6 flex justify-end print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-slate-400 bg-white px-5 py-3 font-bold"
            >
              Print my results
            </button>
          </div>
          <section className="multiple-ask-results mt-6 space-y-6">
            <header className="hidden print:block">
              <h1 className="text-2xl font-bold">
                Taleem AI — Multiple Ask results
              </h1>
              <p className="mt-1">
                Only the currently authenticated student&apos;s loaded result is
                printed.
              </p>
            </header>
            {status.items.map((item) => {
              return (
                <article
                  key={item.itemId}
                  className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <header>
                    <p className="font-bold">
                      {item.displayLabel ?? `Question ${item.itemIndex + 1}`}
                      {item.sectionContext ? ` — ${item.sectionContext}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.questionText ?? "Question text unavailable"}
                    </p>
                  </header>
                  {item.itemStatus === "failed" ? (
                    <p className="mt-4 rounded-lg bg-red-50 p-4 text-red-900">
                      No answer was produced for this item. You can return later
                      if the job is still retained.
                    </p>
                  ) : item.itemStatus === "cancelled" ? (
                    <p className="mt-4 rounded-lg bg-slate-100 p-4">
                      This item was cancelled and has no answer.
                    </p>
                  ) : item.result ? (
                    <MultipleAskAnswer
                      item={item}
                      jobId={status.jobId}
                      getToken={getToken}
                    />
                  ) : (
                    <p className="mt-4 text-slate-600">
                      No answer is available for this item.
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </section>
  );
}
