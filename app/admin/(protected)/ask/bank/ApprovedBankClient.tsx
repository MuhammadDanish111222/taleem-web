"use client";

import { useState } from "react";
import ApprovedQuestionEditor, {
  EMPTY_APPROVED_QUESTION,
  parseApprovedQuestion,
  type ApprovedQuestionDraft,
} from "@/components/admin/ask/ApprovedQuestionEditor";
import {
  type ApprovedBankHistory,
  type ApprovedBankSummary,
  questionBankImportSchema,
} from "@/lib/ai/adminContracts";
import { callAskAdmin } from "@/lib/client/askAdmin";
import { getBoards, getChapters, getClasses, getSubjects } from "@/lib/firestore/catalogue";
import { useCatalogueOptions } from "@/lib/hooks/useCatalogueOptions";

interface ApprovedRevision {
  revision_id: string;
  board_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string | null;
  answer_mode: string;
  answer_style: "exam_style";
  blocks: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  question_visuals: Array<{ visual_id: string; display_order?: number; title?: string; description?: string }>;
  answer_visuals: Array<{ visual_id: string; display_order?: number; title?: string; description?: string }>;
}

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
type ImportScope = { board_id: string; class_id: string; subject_id: string; chapter_id: string };

async function importKeyFor(scope: ImportScope, content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const hash = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
  return `question-bank:${scope.board_id}:${scope.class_id}:${scope.subject_id}:${scope.chapter_id}:${hash}`;
}

export default function ApprovedBankClient() {
  const [items, setItems] = useState<ApprovedBankSummary[]>([]);
  const [filterBoard, setFilterBoard] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterChapter, setFilterChapter] = useState("");
  const [filterMode, setFilterMode] = useState<"" | "short" | "long" | "mcq">("");
  const [filterSource, setFilterSource] = useState("");
  const [draft, setDraft] = useState<ApprovedQuestionDraft>(EMPTY_APPROVED_QUESTION);
  const [revisionId, setRevisionId] = useState("");
  const [revision, setRevision] = useState<ApprovedRevision | null>(null);
  const [history, setHistory] = useState<ApprovedBankHistory | null>(null);
  const [variation, setVariation] = useState("");
  const [questionVisualIds, setQuestionVisualIds] = useState("");
  const [answerVisualIds, setAnswerVisualIds] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [importScope, setImportScope] = useState<ImportScope>({ board_id: "", class_id: "", subject_id: "", chapter_id: "" });
  const [importJson, setImportJson] = useState("[]");
  const [importFileName, setImportFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const boards = useCatalogueOptions("admin-bank-import-boards", getBoards);
  const classes = useCatalogueOptions(
    importScope.board_id ? `admin-bank-import-classes:${importScope.board_id}` : null,
    () => getClasses(importScope.board_id),
  );
  const subjects = useCatalogueOptions(
    importScope.board_id && importScope.class_id ? `admin-bank-import-subjects:${importScope.board_id}:${importScope.class_id}` : null,
    () => getSubjects(importScope.board_id, importScope.class_id),
  );
  const chapters = useCatalogueOptions(
    importScope.board_id && importScope.class_id && importScope.subject_id ? `admin-bank-import-chapters:${importScope.board_id}:${importScope.class_id}:${importScope.subject_id}` : null,
    () => getChapters(importScope.board_id, importScope.class_id, importScope.subject_id),
  );
  const importScopeComplete = Boolean(importScope.board_id && importScope.class_id && importScope.subject_id && importScope.chapter_id);

  function begin() {
    setBusy(true);
    setNotice("");
    setError("");
  }

  function fail(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    setBusy(false);
  }

  async function listApproved() {
    begin();
    try {
      const result = await callAskAdmin<{ items: ApprovedBankSummary[] }>({
        operation: "bank_list",
        ...(filterBoard.trim() ? { board_id: filterBoard.trim() } : {}),
        ...(filterClass.trim() ? { class_id: filterClass.trim() } : {}),
        ...(filterSubject.trim() ? { subject_id: filterSubject.trim() } : {}),
        ...(filterChapter.trim() ? { chapter_id: filterChapter.trim() } : {}),
        ...(filterMode ? { answer_mode: filterMode } : {}),
        ...(filterSource.trim() ? { bank_source: filterSource.trim() } : {}),
        limit: 100,
      });
      setItems(result.items);
      setNotice(`${result.items.length} active approved revisions loaded.`);
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not list approved questions");
    }
  }

  async function createApproved() {
    begin();
    try {
      const result = await callAskAdmin<{ status: string; revision_id: string }>({
        operation: "bank_create",
        approved_question: parseApprovedQuestion(draft),
      });
      setRevisionId(result.revision_id);
      setNotice(`Approved revision ${result.revision_id} created immediately; approved-only embedding was queued.`);
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not create approved question");
    }
  }

  async function importApproved() {
    begin();
    try {
      const raw = JSON.parse(importJson) as unknown;
      if (!Array.isArray(raw) || raw.length === 0) throw new Error("Import JSON must be a non-empty array");
      const questions = raw.map((item, index) => {
        const result = questionBankImportSchema.safeParse(item);
        if (!result.success) throw new Error(`Question ${index + 1}: ${result.error.issues[0]?.message ?? "invalid"}`);
        return result.data;
      });
      if (!importScopeComplete) throw new Error("Select Board, Class, Subject, and Chapter before importing");
      const importKey = await importKeyFor(importScope, JSON.stringify(questions));
      const result = await callAskAdmin<{ status: string; revision_ids: string[] }>({
        operation: "bank_import",
        ...importScope,
        import_key: importKey,
        import_questions: questions,
      });
      setNotice(result.status === "already_imported"
        ? `${result.revision_ids.length} questions were already imported; this identical file is idempotent.`
        : `${questions.length} questions validated. ${result.revision_ids.length} questions imported successfully.`);
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not import approved questions");
    }
  }

  async function selectImportFile(file: File | null) {
    if (!file) return;
    begin();
    try {
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Choose a JSON file");
      const content = await file.text();
      JSON.parse(content);
      setImportJson(content);
      setImportFileName(file.name);
      setNotice(`${file.name} loaded. Validate and import when the scope is selected.`);
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not read JSON file");
    }
  }

  async function inspectRevision(targetRevisionId = revisionId.trim()) {
    begin();
    try {
      const result = await callAskAdmin<{ revision: ApprovedRevision; history: ApprovedBankHistory }>({
        operation: "bank_view",
        revision_id: targetRevisionId,
      });
      setRevisionId(targetRevisionId);
      setRevision(result.revision);
      setHistory(result.history);
      setQuestionVisualIds(result.revision.question_visuals.map((visual) => visual.visual_id).join("\n"));
      setAnswerVisualIds(result.revision.answer_visuals.map((visual) => visual.visual_id).join("\n"));
      setNotice("Approved revision loaded.");
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not load approved revision");
    }
  }

  async function loadHistory(questionId?: string) {
    begin();
    try {
      const result = await callAskAdmin<ApprovedBankHistory>({
        operation: "bank_history",
        ...(questionId ? { question_id: questionId } : { revision_id: revisionId.trim() }),
      });
      setHistory(result);
      setNotice(`Loaded ${result.revisions.length} revisions and ${result.variations.length} variations.`);
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not load revision history");
    }
  }

  async function archiveRevision() {
    begin();
    try {
      await callAskAdmin<{ status: string }>({
        operation: "bank_archive",
        revision_id: revisionId.trim(),
        reason: archiveReason,
      });
      setNotice("Approved revision archived with an audited reason.");
      setRevision(null);
      setHistory(null);
      setArchiveReason("");
      setItems((current) => current.filter((item) => item.revision_id !== revisionId.trim()));
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not archive approved revision");
    }
  }

  async function addVariation() {
    begin();
    try {
      const result = await callAskAdmin<{ variation_id: string; embedding_status: string }>({
        operation: "bank_add_variation",
        revision_id: revisionId.trim(),
        variation,
      });
      setVariation("");
      setNotice(`Variation ${result.variation_id} added. Embedding status: ${result.embedding_status}.`);
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not add approved variation");
    }
  }

  async function saveVisuals() {
    begin();
    try {
      const questionIds = questionVisualIds.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
      const answerIds = answerVisualIds.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
      await callAskAdmin<{ status: string }>({
        operation: "bank_set_visuals",
        revision_id: revisionId.trim(),
        question_visual_ids: questionIds,
        answer_visual_ids: answerIds,
      });
      setNotice("Question and answer visual links updated. Answer block references and scope were revalidated server-side.");
      setBusy(false);
    } catch (caught) {
      fail(caught, "Could not update visual links");
    }
  }

  async function setVariationActive(variationId: string, active: boolean) {
    begin();
    try {
      await callAskAdmin<{ variation_id: string; revision_id: string; active: boolean; embedding_status: string }>({
        operation: "bank_set_variation_active",
        variation_id: variationId,
        active,
      });
      setNotice(`Variation ${active ? "enabled" : "disabled"}.`);
      await loadHistory(history?.question_id);
    } catch (caught) {
      fail(caught, "Could not change variation state");
    }
  }

  async function requeueEmbedding(variationId?: string) {
    begin();
    try {
      await callAskAdmin<{ embedding_status: string }>({
        operation: "bank_requeue_embedding",
        revision_id: revisionId.trim(),
        ...(variationId ? { variation_id: variationId } : {}),
      });
      setNotice(`${variationId ? "Variation" : "Revision"} embedding reset to pending and queued.`);
      await loadHistory(history?.question_id);
    } catch (caught) {
      fail(caught, "Could not requeue embedding");
    }
  }

  return (
    <section className="mx-auto max-w-7xl p-6 text-slate-900">
      <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Local-only Module 4</p>
      <h1 className="text-3xl font-bold">Approved Question–Answer Bank</h1>
      <p className="mt-2 text-slate-600">Admin-authored and imported entries become approved only after strict validation. They never enter the generated-candidate queue.</p>

      {error ? <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="my-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}

      <div className="mt-6 grid gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Approved questions</h2>
          <p className="mt-1 text-sm text-slate-500">Only active approved revisions are listed. Filters are applied in PostgreSQL before the bounded result is returned.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input aria-label="Bank board filter" className={inputClass} placeholder="Board ID" value={filterBoard} onChange={(event) => setFilterBoard(event.target.value)} />
            <input aria-label="Bank class filter" className={inputClass} placeholder="Class ID" value={filterClass} onChange={(event) => setFilterClass(event.target.value)} />
            <input aria-label="Bank subject filter" className={inputClass} placeholder="Subject ID" value={filterSubject} onChange={(event) => setFilterSubject(event.target.value)} />
            <input aria-label="Bank chapter filter" className={inputClass} placeholder="Chapter ID" value={filterChapter} onChange={(event) => setFilterChapter(event.target.value)} />
            <select aria-label="Bank answer mode filter" className={inputClass} value={filterMode} onChange={(event) => setFilterMode(event.target.value as typeof filterMode)}>
              <option value="">All answer modes</option><option value="short">Short</option><option value="long">Long</option><option value="mcq">MCQ</option>
            </select>
            <input aria-label="Bank source filter" className={inputClass} placeholder="Source (admin_authored, admin_import…)" value={filterSource} onChange={(event) => setFilterSource(event.target.value)} />
          </div>
          <button type="button" onClick={() => void listApproved()} disabled={busy} className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Load approved bank</button>
          <div className="mt-4 grid gap-2">
            {items.map((item) => (
              <button key={item.revision_id} type="button" onClick={() => void inspectRevision(item.revision_id)} className="rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-indigo-400">
                <span className="font-semibold">{item.question_text}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {item.board_id}/{item.class_id}/{item.subject_id}{item.chapter_id ? `/${item.chapter_id}` : ""} · {item.answer_mode} · {item.source} · v{item.version_no}
                </span>
                <span className="mt-1 block text-xs text-slate-500">Embedding: {item.embedding_status} · Variations: {item.variation_count} · Approved {new Date(item.approved_at).toLocaleString()}</span>
              </button>
            ))}
            {!busy && items.length === 0 ? <p className="text-sm text-slate-500">No approved bank entries loaded.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Create admin-authored approved question</h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">The successful action records approved status, actor, timestamp, and an audit entry.</p>
          <ApprovedQuestionEditor value={draft} onChange={setDraft} idPrefix="bank-create" />
          <button type="button" onClick={() => void createApproved()} disabled={busy} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create approved revision</button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Bulk import approved questions</h2>
          <p className="mt-1 text-sm text-slate-500">Select the catalogue scope once, then upload a JSON array. Use optional question_visual_ids and answer_visual_ids arrays; legacy visual_ids is rejected. Every item is validated before the transaction starts.</p>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium">Board
                <select aria-label="Import board" className={`${inputClass} mt-1`} value={importScope.board_id} onChange={(event) => setImportScope({ board_id: event.target.value, class_id: "", subject_id: "", chapter_id: "" })}>
                  <option value="">{boards.loading ? "Loading boards..." : "Select Board"}</option>
                  {boards.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Class
                <select aria-label="Import class" className={`${inputClass} mt-1`} value={importScope.class_id} disabled={!importScope.board_id || classes.loading} onChange={(event) => setImportScope({ ...importScope, class_id: event.target.value, subject_id: "", chapter_id: "" })}>
                  <option value="">{classes.loading ? "Loading classes..." : "Select Class"}</option>
                  {classes.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Subject
                <select aria-label="Import subject" className={`${inputClass} mt-1`} value={importScope.subject_id} disabled={!importScope.class_id || subjects.loading} onChange={(event) => setImportScope({ ...importScope, subject_id: event.target.value, chapter_id: "" })}>
                  <option value="">{subjects.loading ? "Loading subjects..." : "Select Subject"}</option>
                  {subjects.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Chapter
                <select aria-label="Import chapter" className={`${inputClass} mt-1`} value={importScope.chapter_id} disabled={!importScope.subject_id || chapters.loading} onChange={(event) => setImportScope({ ...importScope, chapter_id: event.target.value })}>
                  <option value="">{chapters.loading ? "Loading chapters..." : "Select Chapter"}</option>
                  {chapters.data?.map((item) => <option key={item.slug} value={item.slug}>{item.chapter_number}. {item.title}</option>)}
                </select>
              </label>
            </div>
            <label className="text-sm font-medium">Question Bank JSON
              <input aria-label="Question Bank JSON file" type="file" accept="application/json,.json" className="mt-1 block text-sm" onChange={(event) => void selectImportFile(event.target.files?.[0] ?? null)} />
            </label>
            {importFileName ? <p className="text-xs text-slate-500">Loaded: {importFileName}</p> : null}
            <textarea aria-label="Approved questions import JSON" className={`${inputClass} min-h-52 font-mono`} value={importJson} onChange={(event) => { setImportJson(event.target.value); setImportFileName(""); }} spellCheck={false} />
            <button type="button" onClick={() => void importApproved()} disabled={busy || !importScopeComplete} className="w-fit rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Validate and import JSON</button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Inspect and manage an approved revision</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Approved revision ID" className={inputClass} placeholder="Approved revision UUID" value={revisionId} onChange={(event) => setRevisionId(event.target.value)} />
            <button type="button" onClick={() => void inspectRevision()} disabled={busy || !revisionId.trim()} className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Open revision</button>
            <button type="button" onClick={() => void loadHistory()} disabled={busy || !revisionId.trim()} className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Load history</button>
          </div>
          {revision ? (
            <div className="mt-5 grid gap-5">
              <dl className="grid gap-2 rounded-lg bg-slate-50 p-4 text-sm md:grid-cols-3">
                <div><dt className="font-medium">Scope</dt><dd>{revision.board_id}/{revision.class_id}/{revision.subject_id}{revision.chapter_id ? `/${revision.chapter_id}` : ""}</dd></div>
                <div><dt className="font-medium">Mode/style</dt><dd>{revision.answer_mode}/{revision.answer_style}</dd></div>
                <div><dt className="font-medium">Revision</dt><dd className="break-all font-mono text-xs">{revision.revision_id}</dd></div>
              </dl>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify({
                blocks: revision.blocks,
                citations: revision.citations,
                question_visuals: revision.question_visuals,
                answer_visuals: revision.answer_visuals,
              }, null, 2)}</pre>

              <div className="grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Add approved variation</h3>
                  <textarea aria-label="Approved question variation" className={`${inputClass} mt-2 min-h-24`} placeholder="Student paraphrase" value={variation} onChange={(event) => setVariation(event.target.value)} maxLength={4000} />
                  <button type="button" onClick={() => void addVariation()} disabled={busy || !variation.trim()} className="mt-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add and queue embedding</button>
                </div>
                <div>
                  <h3 className="font-semibold">Question Visuals <span className="rounded bg-indigo-100 px-1.5 text-xs text-indigo-800">QUESTION</span></h3>
                  <textarea aria-label="Question Visual IDs" className={`${inputClass} mt-2 min-h-24 font-mono`} value={questionVisualIds} onChange={(event) => setQuestionVisualIds(event.target.value)} />
                  <h3 className="mt-3 font-semibold">Answer Visuals <span className="rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">ANSWER</span></h3>
                  <textarea aria-label="Answer Visual IDs" className={`${inputClass} mt-2 min-h-24 font-mono`} value={answerVisualIds} onChange={(event) => setAnswerVisualIds(event.target.value)} />
                  <button type="button" onClick={() => void saveVisuals()} disabled={busy} className="mt-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Validate and save links</button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Embedding operations</h3>
                    <p className="text-sm text-slate-500">Only approved active revisions and active variations can be reset and requeued.</p>
                  </div>
                  <button type="button" onClick={() => void requeueEmbedding()} disabled={busy} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Requeue revision embedding</button>
                </div>
              </div>

              {history ? (
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="font-semibold">Revision and variation history</h3>
                  <p className="mt-1 text-sm text-slate-500">Question ID: <span className="font-mono">{history.question_id}</span></p>
                  <div className="mt-3 grid gap-2">
                    {history.revisions.map((item) => (
                      <div key={item.revision_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">Revision v{item.version_no} · {item.review_status}</span>
                          <span className="text-xs text-slate-500">Embedding: {item.embedding_status}</span>
                        </div>
                        <p className="mt-1">{item.question_text}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.source} · {new Date(item.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2">
                    {history.variations.map((item) => (
                      <div key={item.variation_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <p>{item.variation_text}</p>
                        <p className="mt-1 text-xs text-slate-500">Embedding: {item.embedding_status} · {item.active ? "active" : "inactive"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void setVariationActive(item.variation_id, !item.active)} disabled={busy} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50">{item.active ? "Disable" : "Enable"} variation</button>
                          {item.active ? <button type="button" onClick={() => void requeueEmbedding(item.variation_id)} disabled={busy} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50">Requeue embedding</button> : null}
                        </div>
                      </div>
                    ))}
                    {history.variations.length === 0 ? <p className="text-sm text-slate-500">No approved variations yet.</p> : null}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-red-200 pt-5">
                <h3 className="font-semibold text-red-800">Archive active approved revision</h3>
                <p className="mt-1 text-sm text-red-700">Archiving removes this revision from approved reuse. The reason is required and audited; history is retained.</p>
                <textarea aria-label="Required archive reason" className={`${inputClass} mt-3 min-h-20 border-red-200`} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} maxLength={1000} placeholder="Required archive reason" />
                <button type="button" onClick={() => void archiveRevision()} disabled={busy || !archiveReason.trim()} className="mt-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Archive revision</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
