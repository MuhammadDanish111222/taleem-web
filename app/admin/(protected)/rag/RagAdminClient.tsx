"use client";

import { FormEvent, useEffect, useState } from "react";
import { getBoards, getClasses, getSubjects } from "@/lib/firestore/catalogue";
import { useCatalogueOptions } from "@/lib/hooks/useCatalogueOptions";

type Scope = { board_id: string; class_id: string; subject_id: string };
type ChapterItem = { chapter_id: string; status: string; chunk_count: number; embedded_chunk_count: number; corpus_version_id: string };
type Version = { id: string; version_no: number; status: string; expected_chunk_count: number; embedded_chunk_count: number; expected_question_count: number; embedded_question_count: number };
type ChunkDetail = { id: string; chapter_id: string; topic_no: string; topic_title: string; chunk_index: number; embedding_status: string };
type Detail = { chunks: ChunkDetail[]; questions: { id: string; chunk_id: string; question_text: string; embedding_status: string }[]; visuals: { id: string; visual_id: string; title: string; description: string; review_status: string; display_policy: string }[]; audits: { id: string; created_at: string; action: string }[] };
type Job = { id: string; job_type: string; status: string; stage: string | null; progress: number; attempt_count: number; max_attempts: number; error_code: string | null };
type QaResult = {
  strength: string;
  reason: string;
  results: {
    citation: { citation_id: string; content: string; chapter_id: string | null; topic_no: string | null; topic_title: string | null };
    fused_rank: number;
    contributions: { channel: string; rank: number }[];
  }[];
};

const RAG_SCOPE_STORAGE_KEY = "taleem-admin-rag-scope";
const fieldClass = "rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-500 shadow-sm";

async function csrf() { const response = await fetch("/api/auth/csrf", { credentials: "same-origin" }); return (await response.json()).csrfToken as string; }

export default function RagAdminClient() {
  const [scope, setScope] = useState<Scope>({ board_id: "", class_id: "", subject_id: "" });
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [inspectedChapter, setInspectedChapter] = useState<string | null>(null);
  const [details, setDetails] = useState<Detail | null>(null);
  const [status, setStatus] = useState("Select a scope to manage chapters.");
  const [busy, setBusy] = useState(false);
  
  // QA Testing
  const [testChapter, setTestChapter] = useState<string | null>(null);
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaResult, setQaResult] = useState<QaResult | null>(null);
  const [qaSearchStatus, setQaSearchStatus] = useState("");

  // Chapter Upload / Replace
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetChapter, setTargetChapter] = useState<string | null>(null);
  const [jsonlFile, setJsonlFile] = useState<File | null>(null);
  const [visualDocxFile, setVisualDocxFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<{ chunk_count: number; referenced_visual_count: number; unused_visual_count: number; warnings: string[]; job_id: string; job_status: string; duplicate?: boolean; message?: string } | null>(null);
  const [cleanupSummary, setCleanupSummary] = useState<{ mode: string; importer_owned_count: number; referenced_count: number; young_unreferenced_count: number; eligible_orphan_count: number; deleted_count: number } | null>(null);

  const scopeComplete = Boolean(scope.board_id.trim() && scope.class_id.trim() && scope.subject_id.trim());
  const boards = useCatalogueOptions("admin-rag-boards", getBoards);
  const classes = useCatalogueOptions(
    scope.board_id ? `admin-rag-classes:${scope.board_id}` : null,
    () => getClasses(scope.board_id),
  );
  const subjects = useCatalogueOptions(
    scope.board_id && scope.class_id ? `admin-rag-subjects:${scope.board_id}:${scope.class_id}` : null,
    () => getSubjects(scope.board_id, scope.class_id),
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RAG_SCOPE_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<Scope>;
      if (typeof parsed.board_id === "string" && typeof parsed.class_id === "string" && typeof parsed.subject_id === "string") {
        setScope({ board_id: parsed.board_id, class_id: parsed.class_id, subject_id: parsed.subject_id });
      }
    } catch {
      window.localStorage.removeItem(RAG_SCOPE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!scopeComplete) return;
    window.localStorage.setItem(RAG_SCOPE_STORAGE_KEY, JSON.stringify(scope));
    void refresh();
  }, [scope, scopeComplete]);

  async function request(operation: string, corpusVersionId?: string, extra: Record<string, string> = {}, onError?: (message: string) => void) {
    setBusy(true); setStatus("Working…");
    try {
      const response = await fetch("/api/admin/rag", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrf() }, body: JSON.stringify({ operation, ...scope, corpus_version_id: corpusVersionId, ...extra }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "Request rejected");
      return body.data;
    } catch (error) { const message = error instanceof Error ? error.message : "Request failed"; setStatus(message); onError?.(message); return null; } finally { setBusy(false); }
  }

  async function refresh() {
    if (!scopeComplete) return;
    const result = await request("overview");
    if (result) {
      setChapters(result.chapters || []);
      setVersions(result.versions || []);
      setJobs(result.jobs || []);
      setStatus("Chapter list loaded.");
    }
  }

  async function inspectChapter(ch: ChapterItem) {
    const result = await request("inspect_version", ch.corpus_version_id);
    if (result) {
      setSelectedVersion(ch.corpus_version_id);
      setInspectedChapter(ch.chapter_id);
      setDetails(result);
      setStatus(`Inspecting Chapter ${ch.chapter_id}.`);
    }
  }

  async function deleteChapter(chapterId: string) {
    if (!window.confirm(`Permanently delete Chapter ${chapterId}? LLM Q&A for this chapter will be purged and manual Q&A citation links will be cleared.`)) return;
    const result = await request("delete_chapter", undefined, { chapter_id: chapterId });
    if (result) {
      setStatus(`Chapter ${chapterId} deleted successfully.`);
      await refresh();
      if (inspectedChapter === chapterId) {
        setInspectedChapter(null);
        setDetails(null);
      }
    }
  }

  async function publishFirstSubject(versionId: string) {
    setBusy(true); setStatus("Publishing initial subject version for students...");
    try {
      const approved = await request("approve_qa", versionId, { rationale: "Initial publication approval by admin" });
      if (!approved) return;
      const activated = await request("activate", versionId);
      if (activated) {
        setStatus("Subject published successfully. Student retrieval is now active.");
        await refresh();
      }
    } finally { setBusy(false); }
  }

  async function pairedImport(event: FormEvent) {
    event.preventDefault();
    if (!scopeComplete) { setStatus("Select board, class, and subject first."); return; }
    if (!jsonlFile) { setStatus("Upload a JSONL file."); return; }
    setBusy(true); setStatus("Validating chapter files locally before queueing…"); setImportSummary(null);
    try {
      const data = new FormData();
      data.set("board_id", scope.board_id);
      data.set("class_id", scope.class_id);
      data.set("subject_id", scope.subject_id);
      data.set("action", targetChapter ? "replace" : "add");
      if (targetChapter) {
        data.set("expected_chapter_id", targetChapter);
      }
      data.set("jsonl", jsonlFile);
      if (visualDocxFile) data.set("visual_docx", visualDocxFile);

      const response = await fetch("/api/admin/rag/paired-import", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": await csrf() }, body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(`${body.message || "Chapter import rejected"}${body.code ? ` (${body.code})` : ""}`);
      setImportSummary(body.data);
      setStatus(body.data.duplicate ? body.data.message : `Chapter import queued successfully (Job: ${body.data.job_id}).`);
      setShowUploadModal(false);
      setJsonlFile(null);
      setVisualDocxFile(null);
      await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Chapter import failed"); } finally { setBusy(false); }
  }

  async function cleanupDrive(execute: boolean) {
    if (execute && !window.confirm("Permanently delete eligible unreferenced Drive visuals older than 24 hours?")) return;
    setBusy(true); setStatus(execute ? "Deleting orphaned visuals..." : "Checking orphaned visuals...");
    try {
      const response = await fetch("/api/admin/rag/drive-cleanup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrf() },
        body: JSON.stringify({ execute }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Drive cleanup failed");
      setCleanupSummary(body.data);
      setStatus(execute ? `Deleted ${body.data.deleted_count} orphaned visual(s).` : `Cleanup preview: ${body.data.eligible_orphan_count} eligible visual(s).`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Drive cleanup failed"); } finally { setBusy(false); }
  }

  async function runQaSearch() {
    const targetVer = versions.find((v) => v.status === "qa_ready") || versions.find((v) => v.status === "active");
    if (!targetVer || !qaQuestion.trim()) return;
    setQaResult(null); setQaSearchStatus("Searching corpus…");
    const result = await request(
      "qa_search",
      targetVer.id,
      { question: qaQuestion.trim(), chapter_id: testChapter || "" },
      (message) => setQaSearchStatus(`QA search failed: ${message}`),
    ) as QaResult | null;
    if (!result) return;
    setQaResult(result);
    setQaSearchStatus(`QA search complete: ${result.strength} evidence · ${result.results.length} result(s).`);
  }

  const activeVersion = versions.find((v) => v.status === "active");
  const qaReadyVersion = versions.find((v) => v.status === "qa_ready");

  return (
    <div className="max-w-6xl p-8 text-slate-900">
      <h1 className="text-3xl font-bold text-slate-900">Local RAG Admin</h1>
      <p className="mt-2 text-sm font-medium text-slate-600">Manage subject chapters, inspect chunks/visuals, and test student retrieval.</p>

      {/* Scope Selector */}
      <form className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void refresh(); }}>
        <label className="text-sm font-semibold text-slate-800">Board
          <select required value={scope.board_id} onChange={(e) => setScope({ board_id: e.target.value, class_id: "", subject_id: "" })} className={`mt-1 w-full ${fieldClass}`}>
            <option value="">{boards.loading ? "Loading boards..." : "Select Board"}</option>
            {boards.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-800">Class
          <select required value={scope.class_id} disabled={!scope.board_id || classes.loading} onChange={(e) => setScope({ ...scope, class_id: e.target.value, subject_id: "" })} className={`mt-1 w-full ${fieldClass}`}>
            <option value="">{classes.loading ? "Loading classes..." : "Select Class"}</option>
            {classes.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-800">Subject
          <select required value={scope.subject_id} disabled={!scope.class_id || subjects.loading} onChange={(e) => setScope({ ...scope, subject_id: e.target.value })} className={`mt-1 w-full ${fieldClass}`}>
            <option value="">{subjects.loading ? "Loading subjects..." : "Select Subject"}</option>
            {subjects.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
      </form>

      <p role="status" className="mt-4 text-sm font-semibold text-indigo-700">{status}</p>

      {/* First Publication Box */}
      {scopeComplete && !activeVersion && qaReadyVersion && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div>
            <h3 className="font-bold text-amber-900">First Chapter Ready for Publication</h3>
            <p className="text-xs font-medium text-amber-800">Publish this initial subject version to enable student RAG retrieval.</p>
          </div>
          <button
            onClick={() => void publishFirstSubject(qaReadyVersion.id)}
            className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600"
          >
            Publish to Students
          </button>
        </div>
      )}

      {/* Chapter List */}
      {scopeComplete && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Chapters</h2>
            <button
              onClick={() => { setTargetChapter(null); setJsonlFile(null); setVisualDocxFile(null); setShowUploadModal(true); }}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 shadow-sm"
            >
              + Add Chapter
            </button>
          </div>

          {chapters.length === 0 ? (
            <p className="mt-4 text-sm font-medium text-slate-500">No chapters found for this subject. Click <strong>+ Add Chapter</strong> to upload one.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-200">
              {chapters.map((ch) => (
                <div key={ch.chapter_id} className="flex flex-col justify-between py-3.5 sm:flex-row sm:items-center">
                  <div>
                    <span className="font-bold text-slate-900">Chapter {ch.chapter_id}</span>
                    <span className={`ml-3 inline-block rounded-md px-2.5 py-0.5 text-xs font-semibold ${ch.status === "Ready" ? "bg-emerald-100 text-emerald-800" : ch.status === "Embedding" ? "bg-amber-100 text-amber-800 animate-pulse" : "bg-slate-100 text-slate-700"}`}>
                      {ch.status}
                    </span>
                    <span className="ml-3 text-xs font-medium text-slate-600">{ch.embedded_chunk_count} / {ch.chunk_count} chunks</span>
                  </div>
                  <div className="mt-2 flex gap-2 sm:mt-0">
                    <button onClick={() => void inspectChapter(ch)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">Inspect</button>
                    <button onClick={() => { setTestChapter(ch.chapter_id); setQaResult(null); setQaSearchStatus(""); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">Test</button>
                    <button onClick={() => { setTargetChapter(ch.chapter_id); setJsonlFile(null); setVisualDocxFile(null); setShowUploadModal(true); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Replace</button>
                    <button onClick={() => void deleteChapter(ch.chapter_id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Add / Replace Chapter Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-900">
            <h3 className="text-lg font-bold text-slate-900">{targetChapter ? `Replace Chapter ${targetChapter}` : "Add New Chapter"}</h3>
            <p className="mt-1 text-xs font-medium text-slate-600">Supported modes: JSONL-only (reuses existing DB visuals) or JSONL + Visual Extracts DOCX.</p>
            <form className="mt-4 space-y-4" onSubmit={(e) => void pairedImport(e)}>
              <div>
                <label className="block text-xs font-semibold text-slate-800">Chapter JSONL (Required)</label>
                <input required accept=".jsonl,application/json,text/plain" type="file" onChange={(e) => setJsonlFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs font-medium text-slate-700" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800">Visual Extracts DOCX (Optional if JSONL reuses DB visuals)</label>
                <input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" type="file" onChange={(e) => setVisualDocxFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs font-medium text-slate-700" />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setShowUploadModal(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button disabled={busy || !jsonlFile} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 shadow-sm">
                  {busy ? "Processing..." : targetChapter ? "Validate & Replace" : "Validate & Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QA Test Box */}
      {testChapter && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Test QA Retrieval — Chapter {testChapter}</h3>
            <button onClick={() => setTestChapter(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Close</button>
          </div>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void runQaSearch(); }}>
            <input required value={qaQuestion} onChange={(e) => setQaQuestion(e.target.value)} placeholder={`Ask a question about Chapter ${testChapter}...`} className={`flex-1 ${fieldClass}`} />
            <button disabled={busy || !qaQuestion.trim() || (!activeVersion && !qaReadyVersion)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">Run Test</button>
          </form>
          {!activeVersion && !qaReadyVersion && <p className="mt-2 text-xs font-medium text-amber-700">Chapter must finish embedding before testing is available.</p>}
          {qaSearchStatus && <p role="status" className="mt-2 text-xs font-semibold text-slate-700">{qaSearchStatus}</p>}
          {qaResult && (
            <ol className="mt-4 space-y-3 text-sm">
              {qaResult.results.map((item) => (
                <li key={item.citation.citation_id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="font-bold text-emerald-800">#{item.fused_rank} · Chapter {item.citation.chapter_id} · Topic {item.citation.topic_no} ({item.citation.topic_title})</div>
                  <p className="mt-1 font-medium text-slate-800">{item.citation.content}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Chapter Inspection */}
      {inspectedChapter && details && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 space-y-6 shadow-sm text-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Inspection: Chapter {inspectedChapter}</h3>
            <button onClick={() => { setInspectedChapter(null); setDetails(null); }} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Close</button>
          </div>

          <div>
            <h4 className="font-bold text-sm text-slate-800">Chunks ({details.chunks.length})</h4>
            <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              {details.chunks.map((c) => (
                <li key={c.id} className="py-2 flex justify-between">
                  <span className="font-medium text-slate-800">Topic {c.topic_no} ({c.topic_title}) — chunk #{c.chunk_index + 1}</span>
                  <span className="font-semibold text-slate-600">{c.embedding_status}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm text-slate-800">Visuals ({details.visuals.length})</h4>
            <ul className="mt-2 space-y-2 text-xs">
              {details.visuals.map((v) => (
                <li key={v.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">{v.visual_id}</span> — <span className="font-medium text-slate-700">{v.title}</span> ({v.review_status})
                  </div>
                  <a className="font-semibold text-blue-700 underline hover:text-blue-800" target="_blank" rel="noreferrer" href={`/api/admin/rag/visual/${encodeURIComponent(v.id)}?board_id=${encodeURIComponent(scope.board_id)}&class_id=${encodeURIComponent(scope.class_id)}&subject_id=${encodeURIComponent(scope.subject_id)}&corpus_version_id=${encodeURIComponent(selectedVersion || "")}`}>Preview</a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Maintenance Cleanup */}
      {scopeComplete && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
          <h4 className="font-bold text-sm text-slate-800">Drive Visual Cleanup</h4>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void cleanupDrive(false)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">Preview Cleanup</button>
            <button type="button" disabled={busy || !cleanupSummary?.eligible_orphan_count} onClick={() => void cleanupDrive(true)} className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100">Delete Eligible Orphans</button>
          </div>
          {cleanupSummary && <p className="mt-2 text-xs font-semibold text-slate-600">Eligible: {cleanupSummary.eligible_orphan_count} | Deleted: {cleanupSummary.deleted_count}</p>}
        </section>
      )}

      {/* Durable Jobs */}
      {jobs.length > 0 && (
        <section className="mt-8">
          <h4 className="font-bold text-sm text-slate-800">Recent Ingestion Jobs</h4>
          <ul className="mt-2 space-y-1 text-xs font-medium text-slate-600">
            {jobs.slice(0, 5).map((j) => (
              <li key={j.id}>{j.job_type}: {j.status} ({j.progress}%) {j.error_code ? `- ${j.error_code}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
