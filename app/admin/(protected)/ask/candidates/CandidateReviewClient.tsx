"use client";

import { useState } from "react";
import ApprovedQuestionEditor, {
  EMPTY_APPROVED_QUESTION,
  parseApprovedQuestion,
  type ApprovedQuestionDraft,
} from "@/components/admin/ask/ApprovedQuestionEditor";
import type { CandidateDetail, CandidateSummary } from "@/lib/ai/adminContracts";
import { callAskAdmin } from "@/lib/client/askAdmin";

const inputClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

function candidateDraft(item: CandidateDetail): ApprovedQuestionDraft {
  const citationIds = (item.citation_sources ?? [])
    .map((citation) => citation.citation_id)
    .filter((id): id is string => typeof id === "string");
  return {
    ...EMPTY_APPROVED_QUESTION,
    boardId: item.board_id,
    classId: item.class_id,
    subjectId: item.subject_id,
    chapterId: item.chapter_id ?? "",
    answerMode: item.answer_mode,
    question: item.raw_question,
    blocksJson: JSON.stringify(item.answer_blocks, null, 2),
    citationIds: citationIds.join("\n"),
    questionVisualIds: "",
    answerVisualIds: (item.visual_ids ?? []).join("\n"),
  };
}

export default function CandidateReviewClient() {
  const [items, setItems] = useState<CandidateSummary[]>([]);
  const [selected, setSelected] = useState<CandidateDetail | null>(null);
  const [draft, setDraft] = useState<ApprovedQuestionDraft>(EMPTY_APPROVED_QUESTION);
  const [boardId, setBoardId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [provider, setProvider] = useState("");
  const [mode, setMode] = useState<"" | "short" | "long" | "mcq">("");
  const [answerSource, setAnswerSource] = useState<"" | "syllabus_grounded" | "general_knowledge">("");
  const [sourceFeature, setSourceFeature] = useState<"" | "single_question">("");
  const [ageDays, setAgeDays] = useState("");
  const [retentionPreview, setRetentionPreview] = useState<{
    eligible_answers: number;
    eligible_requests_without_answer: number;
    eligible_total: number;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadCandidates() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{ items: CandidateSummary[] }>({
        operation: "candidate_list",
        ...(boardId.trim() ? { board_id: boardId.trim() } : {}),
        ...(classId.trim() ? { class_id: classId.trim() } : {}),
        ...(subjectId.trim() ? { subject_id: subjectId.trim() } : {}),
        ...(chapterId.trim() ? { chapter_id: chapterId.trim() } : {}),
        ...(mode ? { answer_mode: mode } : {}),
        ...(answerSource ? { answer_source: answerSource } : {}),
        ...(sourceFeature ? { source_feature: sourceFeature } : {}),
        ...(provider.trim() ? { provider: provider.trim() } : {}),
        ...(ageDays.trim() ? { age_days: Number(ageDays) } : {}),
        limit: 100,
      });
      setItems(result.items);
      setNotice(`${result.items.length} pending candidates loaded with server-side filters.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load candidates");
    } finally {
      setBusy(false);
    }
  }

  async function previewRetention() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{
        dry_run: true;
        eligible_answers: number;
        eligible_requests_without_answer: number;
        eligible_total: number;
      }>({ operation: "candidate_retention_preview" });
      setRetentionPreview(result);
      setNotice("Retention dry run completed. No rows were deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not preview candidate retention");
    } finally {
      setBusy(false);
    }
  }

  async function inspect(candidateId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{ item: CandidateDetail }>({
        operation: "candidate_inspect",
        candidate_id: candidateId,
      });
      setSelected(result.item);
      setDraft(candidateDraft(result.item));
      setRejectionReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not inspect candidate");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callAskAdmin<{ status: string }>({
        operation: "candidate_reject",
        candidate_id: selected.id,
        rejection_reason: rejectionReason,
      });
      setNotice("Candidate rejected with an audited reason.");
      setSelected(null);
      setItems((current) => current.filter((item) => item.id !== selected.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reject candidate");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const approvedQuestion = parseApprovedQuestion(draft);
      const result = await callAskAdmin<{ status: string; revision_id: string }>({
        operation: "candidate_approve",
        candidate_id: selected.id,
        approved_question: approvedQuestion,
      });
      setNotice(`Candidate approved as immutable bank revision ${result.revision_id}. Embedding was queued.`);
      setSelected(null);
      setItems((current) => current.filter((item) => item.id !== selected.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve candidate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl p-6 text-slate-900">
      <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Local-only Module 4</p>
      <h1 className="text-3xl font-bold text-slate-900">Generated candidate review</h1>
      <p className="mt-2 text-sm font-medium text-slate-600">Generated answers remain pending and are never trusted until an admin validates and corrects the complete revision.</p>

      <div className="my-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-4 text-slate-900">
        <input aria-label="Board filter" className={inputClass} placeholder="Board ID" value={boardId} onChange={(event) => setBoardId(event.target.value)} />
        <input aria-label="Class filter" className={inputClass} placeholder="Class ID" value={classId} onChange={(event) => setClassId(event.target.value)} />
        <input aria-label="Subject filter" className={inputClass} placeholder="Subject ID" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} />
        <input aria-label="Chapter filter" className={inputClass} placeholder="Chapter ID" value={chapterId} onChange={(event) => setChapterId(event.target.value)} />
        <input aria-label="Provider filter" className={inputClass} placeholder="Exact provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
        <select aria-label="Answer mode filter" className={inputClass} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="">All modes</option><option value="short">Short</option><option value="long">Long</option><option value="mcq">MCQ</option>
        </select>
        <select aria-label="Answer source filter" className={inputClass} value={answerSource} onChange={(event) => setAnswerSource(event.target.value as typeof answerSource)}>
          <option value="">All answer sources</option><option value="syllabus_grounded">Syllabus grounded</option><option value="general_knowledge">General AI</option>
        </select>
        <select aria-label="Source feature filter" className={inputClass} value={sourceFeature} onChange={(event) => setSourceFeature(event.target.value as typeof sourceFeature)}>
          <option value="">All source features</option><option value="single_question">Single Ask</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">At least
          <input aria-label="Minimum age in days" type="number" min="0" max="3650" className={`${inputClass} w-24`} value={ageDays} onChange={(event) => setAgeDays(event.target.value)} />
          days
        </label>
        <button type="button" onClick={() => void loadCandidates()} disabled={busy} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 shadow-sm">Load pending</button>
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg text-amber-950">Candidate retention dry run</h2>
            <p className="mt-1 text-sm font-medium text-amber-900">Preview expired pending/rejected rows before any separately authorized bounded cleanup. This control never deletes data.</p>
          </div>
          <button type="button" onClick={() => void previewRetention()} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 shadow-sm">Preview retention</button>
        </div>
        {retentionPreview ? (
          <p className="mt-3 text-sm font-semibold text-amber-950">
            Eligible answers: {retentionPreview.eligible_answers}; requests without answers: {retentionPreview.eligible_requests_without_answer}; total: {retentionPreview.eligible_total}.
          </p>
        ) : null}
      </div>

      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800 border border-emerald-200">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
          <h2 className="mb-3 font-bold text-lg text-slate-900">Pending candidates ({items.length})</h2>
          <div className="grid max-h-[54rem] gap-2 overflow-y-auto">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => void inspect(item.id)} className={`rounded-xl border p-3.5 text-left text-sm transition-colors ${selected?.id === item.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className="font-bold text-slate-900">{item.subject_id} · {item.answer_mode}</span>
                <span className="mt-1 block text-xs font-medium text-slate-600">{item.board_id}/{item.class_id}{item.chapter_id ? `/${item.chapter_id}` : ""}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.source_feature} · {item.answer_source} · {item.provider ?? "provider unavailable"} · {new Date(item.created_at).toLocaleString()}</span>
              </button>
            ))}
            {!busy && items.length === 0 ? <p className="text-sm font-medium text-slate-500">No matching pending candidates loaded.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-slate-900">
          {!selected ? <p className="text-sm font-medium text-slate-500">Select a pending candidate to inspect it safely.</p> : (
            <div className="grid gap-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Original candidate</h2>
                <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm md:grid-cols-2">
                  <div><dt className="font-semibold text-slate-600">Answer source</dt><dd className="font-medium text-slate-900">{selected.answer_source}</dd></div>
                  <div><dt className="font-semibold text-slate-600">Provider/model</dt><dd className="font-medium text-slate-900">{selected.provider ?? "not recorded"} / {selected.model ?? "not recorded"}</dd></div>
                  <div><dt className="font-semibold text-slate-600">Mode/style</dt><dd className="font-medium text-slate-900">{selected.answer_mode} / {selected.answer_style}</dd></div>
                  <div><dt className="font-semibold text-slate-600">Created</dt><dd className="font-medium text-slate-900">{new Date(selected.created_at).toLocaleString()}</dd></div>
                  <div><dt className="font-semibold text-slate-600">Source feature</dt><dd className="font-medium text-slate-900">{selected.source_feature}</dd></div>
                  <div><dt className="font-semibold text-slate-600">Prompt version</dt><dd className="break-all font-mono text-xs text-slate-900">{selected.prompt_version ?? "not recorded"}</dd></div>
                  <div><dt className="font-semibold text-slate-600">Corpus version</dt><dd className="break-all font-mono text-xs text-slate-900">{selected.corpus_version_id ?? "none (General AI)"}</dd></div>
                </dl>
                <h3 className="mt-4 text-sm font-bold text-slate-900">Original question</h3>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-900">{selected.raw_question}</p>
                <h3 className="mt-4 text-sm font-bold text-slate-900">Original blocks and provenance references</h3>
                <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100 font-mono">{JSON.stringify({
                  blocks: selected.answer_blocks,
                  citations: selected.citation_sources,
                  reviewed_visual_ids: selected.visual_ids,
                }, null, 2)}</pre>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h2 className="text-xl font-bold text-slate-900">Corrected approved revision</h2>
                <p className="mb-4 mt-1 text-sm font-medium text-slate-600">Review every field. Approval creates an immutable trusted revision, links this candidate, clears pending retention, and queues approved-only embeddings.</p>
                <ApprovedQuestionEditor value={draft} onChange={setDraft} idPrefix="candidate-approval" />
                <button type="button" onClick={() => void approve()} disabled={busy} className="mt-4 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 shadow-sm">Approve corrected revision</button>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h2 className="text-xl font-bold text-red-800">Reject candidate</h2>
                <textarea aria-label="Required rejection reason" className="mt-3 min-h-24 w-full rounded-lg border border-red-300 bg-white p-3 text-sm font-medium text-slate-900 focus:border-red-500 focus:outline-none placeholder:text-slate-400" placeholder="Required review reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} />
                <button type="button" onClick={() => void reject()} disabled={busy || !rejectionReason.trim()} className="mt-3 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 shadow-sm">Reject with reason</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
