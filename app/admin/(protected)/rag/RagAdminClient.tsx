"use client";

import { FormEvent, useEffect, useState } from "react";
import { getBoards, getClasses, getSubjects } from "@/lib/firestore/catalogue";
import { useCatalogueOptions } from "@/lib/hooks/useCatalogueOptions";

type Scope = { board_id: string; class_id: string; subject_id: string };
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
const fieldClass = "rounded border border-slate-600 bg-slate-900 p-2 text-white placeholder:text-slate-400";

async function csrf() { const response = await fetch("/api/auth/csrf", { credentials: "same-origin" }); return (await response.json()).csrfToken as string; }

export default function RagAdminClient() {
  const [scope, setScope] = useState<Scope>({ board_id: "", class_id: "", subject_id: "" });
  const [versions, setVersions] = useState<Version[]>([]); const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null); const [details, setDetails] = useState<Detail | null>(null);
  const [status, setStatus] = useState("Select a scope to inspect local corpus versions."); const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState({ chunk_id: "", id: "", text: "" });
  const [visual, setVisual] = useState({ id: "", title: "", description: "", review_status: "pending", display_policy: "llm_decide" });
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaResult, setQaResult] = useState<QaResult | null>(null);
  const [qaSearchStatus, setQaSearchStatus] = useState("");
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
  }, [scope, scopeComplete]);

  async function request(operation: string, corpusVersionId?: string, extra: Record<string, string> = {}, onError?: (message: string) => void) {
    setBusy(true); setStatus("Working…");
    try {
      const response = await fetch("/api/admin/rag", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrf() }, body: JSON.stringify({ operation, ...scope, corpus_version_id: corpusVersionId, ...extra }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "Request rejected");
      return body.data;
    } catch (error) { const message = error instanceof Error ? error.message : "Request failed"; setStatus(message); onError?.(message); return null; } finally { setBusy(false); }
  }
  async function refresh() { const result = await request("overview"); if (result) { setVersions(result.versions || []); setJobs(result.jobs || []); setSelected(null); setDetails(null); setStatus("Corpus versions and durable jobs loaded."); } }
  async function inspect(versionId: string) { const result = await request("inspect_version", versionId); if (result) { setSelected(versionId); setDetails(result); setQuestion({ chunk_id: result.chunks[0]?.id || "", id: "", text: "" }); setVisual({ id: "", title: "", description: "", review_status: "pending", display_policy: "llm_decide" }); setQaResult(null); setQaSearchStatus(""); setStatus("Version inspection loaded."); } }
  async function mutate(operation: string, extra: Record<string, string> = {}) { if (!selected) return; const result = await request(operation, selected, extra); if (result) { await refresh(); await inspect(selected); setStatus("Change saved; targeted local embedding work was queued where required."); } }
  async function pairedImport(event: FormEvent) {
    event.preventDefault();
    if (!scopeComplete) { setStatus("Enter board_id, class_id, and subject_id before importing files."); return; }
    if (!jsonlFile || !visualDocxFile) { setStatus("Choose both the external JSONL and Visual Extracts DOCX files."); return; }
    setBusy(true); setStatus("Validating paired chapter files locally before queueing…"); setImportSummary(null);
    try {
      const data = new FormData(); data.set("board_id", scope.board_id); data.set("class_id", scope.class_id); data.set("subject_id", scope.subject_id); data.set("jsonl", jsonlFile); data.set("visual_docx", visualDocxFile);
      const response = await fetch("/api/admin/rag/paired-import", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": await csrf() }, body: data });
      const body = await response.json(); if (!response.ok) throw new Error(`${body.message || "Paired import rejected"}${body.code ? ` (${body.code})` : ""}`);
      setImportSummary(body.data);
      setStatus(body.data.duplicate
        ? body.data.message
        : `Validated and queued local ingestion job ${body.data.job_id}. Visuals remain pending review until you approve them.`);
      await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Paired import failed"); } finally { setBusy(false); }
  }

  async function cleanupDrive(execute: boolean) {
    if (execute && !window.confirm("Permanently delete eligible importer-owned Drive visuals that are unreferenced and older than 24 hours?")) return;
    setBusy(true);
    setStatus(execute ? "Deleting eligible orphaned visuals..." : "Checking for safe orphaned visuals...");
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
      setStatus(execute
        ? `Deleted ${body.data.deleted_count} safe orphaned visual(s).`
        : `Cleanup preview found ${body.data.eligible_orphan_count} eligible orphaned visual(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Drive cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  async function runQaSearch() {
    if (!selected || !qaQuestion.trim()) return;
    setQaResult(null);
    setQaSearchStatus("Searching this corpus version…");
    const result = await request(
      "qa_search",
      selected,
      { question: qaQuestion.trim() },
      (message) => setQaSearchStatus(`QA search failed: ${message}`),
    ) as QaResult | null;
    if (!result) return;
    setQaResult(result);
    setQaSearchStatus(`QA search complete: ${result.strength} evidence · ${result.results.length} result(s).`);
    setStatus(`QA search: ${result.strength}; ${result.reason}; ${result.results.length} result(s).`);
  }

  const selectedChunkQuestions = details
    ? details.questions.filter((item) => item.chunk_id === question.chunk_id)
    : [];

  return <div className="max-w-6xl p-8">
    <h1 className="text-3xl font-bold">Local RAG QA</h1><p className="mt-2 text-sm">Local-admin-only. Image previews stream through the protected server proxy; storage references never appear here.</p>
    <form className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void refresh(); }}>
      <label className="text-sm">Board<select required value={scope.board_id} onChange={(event) => setScope({ board_id: event.target.value, class_id: "", subject_id: "" })} className={`mt-1 w-full ${fieldClass}`}><option value="">{boards.loading ? "Loading boards..." : "Select a board"}</option>{boards.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="text-sm">Class<select required value={scope.class_id} disabled={!scope.board_id || classes.loading} onChange={(event) => setScope({ ...scope, class_id: event.target.value, subject_id: "" })} className={`mt-1 w-full ${fieldClass}`}><option value="">{classes.loading ? "Loading classes..." : "Select a class"}</option>{classes.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="text-sm">Subject<select required value={scope.subject_id} disabled={!scope.class_id || subjects.loading} onChange={(event) => setScope({ ...scope, subject_id: event.target.value })} className={`mt-1 w-full ${fieldClass}`}><option value="">{subjects.loading ? "Loading subjects..." : "Select a subject"}</option>{subjects.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <button disabled={busy} className="self-end rounded bg-blue-700 p-2 text-white">Load local QA</button>
    </form><p className="mt-2 text-sm text-slate-300">This scope contains one corpus version for the whole subject. It can include many chapters; inspect a version to see each chapter.</p><p role="status" className="mt-3 text-sm">{status}</p>
    <section className="mt-6 rounded border p-4"><h2 className="text-xl font-semibold">Paired chapter import</h2><p className="mt-1 text-sm">Upload the external JSONL and matching Visual Extracts DOCX. Cropped visuals are stored privately; they begin pending with the llm_decide policy and still require your review.</p>
      {!scopeComplete && <p role="alert" className="mt-2 text-sm text-amber-700">Enter board_id, class_id, and subject_id above to enable import. Your last completed scope will be remembered on this browser.</p>}
      <form className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={(event) => void pairedImport(event)}>
        <label className="text-sm">External JSONL<input required accept=".jsonl,application/json,text/plain" type="file" onChange={(event) => setJsonlFile(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
        <label className="text-sm">Visual Extracts DOCX<input required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" type="file" onChange={(event) => setVisualDocxFile(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
        <button disabled={busy || !scopeComplete} title={!scopeComplete ? "Enter board_id, class_id, and subject_id first" : undefined} className="self-end rounded bg-blue-700 p-2 text-white">Validate and import</button>
      </form>
      {importSummary && <div className="mt-3 text-sm">{importSummary.duplicate ? importSummary.message : <>Validated: {importSummary.chunk_count} chunks, {importSummary.referenced_visual_count} referenced visuals, {importSummary.unused_visual_count} unused visuals. Queued: {importSummary.job_id} ({importSummary.job_status}).</>}{importSummary.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      <div className="mt-4 border-t border-slate-700 pt-3">
        <h3 className="font-medium">Old visual cleanup</h3>
        <p className="text-sm text-slate-300">Only importer-owned Drive visuals that are not referenced in Supabase and are older than 24 hours are eligible.</p>
        <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void cleanupDrive(false)} className="rounded border px-2 py-1">Preview cleanup</button><button type="button" disabled={busy || !cleanupSummary?.eligible_orphan_count} onClick={() => void cleanupDrive(true)} className="rounded border border-red-500 px-2 py-1 text-red-300">Delete eligible orphans</button></div>
        {cleanupSummary && <p className="mt-2 text-sm">Drive importer visuals: {cleanupSummary.importer_owned_count}; referenced: {cleanupSummary.referenced_count}; protected because newer than 24h: {cleanupSummary.young_unreferenced_count}; eligible: {cleanupSummary.eligible_orphan_count}; deleted: {cleanupSummary.deleted_count}.</p>}
      </div>
    </section>
    <section className="mt-6"><h2 className="text-xl font-semibold">Corpus versions</h2><p className="mt-1 text-sm text-slate-300"><strong>Inspect</strong> reviews chunks, questions and visuals. <strong>Approve QA</strong> records that you reviewed a complete version. <strong>Activate</strong> makes it live for students. Uploading another chapter automatically reuses the editable version or safely creates one from the active version.</p><div className="mt-2 space-y-2">{versions.map((v) => <div key={v.id} className="rounded border p-3"><div>Version {v.version_no} · {v.status} — chunks {v.embedded_chunk_count}/{v.expected_chunk_count}, questions {v.embedded_question_count}/{v.expected_question_count}</div><div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => void inspect(v.id)} className="rounded border px-2 py-1">Inspect</button>{v.status === "active" && <button title="Use this only when you want to edit the live version before importing another chapter." disabled={busy} onClick={() => void request("create_draft", v.id).then(refresh)} className="rounded border px-2 py-1">Start editable copy</button>}{v.status === "qa_ready" && <><button disabled={busy} onClick={() => void request("approve_qa", v.id).then(refresh)} className="rounded border px-2 py-1">Approve QA</button><button disabled={busy} onClick={() => void request("activate", v.id).then(refresh)} className="rounded border px-2 py-1">Activate for students</button></>}{v.status === "superseded" && <button disabled={busy} onClick={() => void request("rollback", v.id).then(refresh)} className="rounded border px-2 py-1">Rollback to this version</button>}</div></div>)}</div></section>
    <section className="mt-6"><h2 className="text-xl font-semibold">Durable jobs</h2><ul className="mt-2 text-sm">{jobs.map((job) => <li key={job.id}>{job.job_type}: {job.status} / {job.stage || "pending"} / {job.progress}% / attempts {job.attempt_count}/{job.max_attempts}{job.error_code ? ` / ${job.error_code}` : ""}</li>)}</ul></section>
    {selected && details && <section className="mt-8 space-y-6"><h2 className="text-xl font-semibold">Version inspection</h2><div><h3 className="font-medium">Chunks</h3><ul className="text-sm">{details.chunks.map((chunk) => <li key={chunk.id}>{chunk.chapter_id} · {chunk.topic_no} · {chunk.topic_title} · chunk {chunk.chunk_index + 1} · {chunk.embedding_status}</li>)}</ul></div>
      <form className="space-y-2 rounded border p-3" onSubmit={(event) => { event.preventDefault(); void mutate(question.id ? "edit_question" : "add_question", question.id ? { question_id: question.id, question_text: question.text } : { chunk_id: question.chunk_id, question_text: question.text }); setQuestion((v) => ({ ...v, id: "", text: "" })); }}><h3 className="font-medium">Expected question</h3><select value={question.chunk_id} onChange={(event) => setQuestion({ chunk_id: event.target.value, id: "", text: "" })} className={fieldClass}>{details.chunks.map((chunk) => <option key={chunk.id} value={chunk.id}>{chunk.chapter_id} · {chunk.topic_no} · {chunk.topic_title} · chunk {chunk.chunk_index + 1}</option>)}</select><input required value={question.text} onChange={(event) => setQuestion({ ...question, text: event.target.value })} className={`ml-2 ${fieldClass}`} /><button disabled={busy} className="ml-2 rounded border px-2 py-1">{question.id ? "Save" : "Add"}</button></form>
      <div><p className="text-sm font-medium">{selectedChunkQuestions.length} question(s) for the selected chunk</p><ul className="mt-1 text-sm">{selectedChunkQuestions.map((item) => <li key={item.id}>{item.question_text} · {item.embedding_status}<button className="ml-2 underline" onClick={() => setQuestion({ chunk_id: item.chunk_id, id: item.id, text: item.question_text })}>Edit</button><button className="ml-2 underline" onClick={() => void mutate("delete_question", { question_id: item.id })}>Delete</button></li>)}</ul>{selectedChunkQuestions.length === 0 && <p className="text-sm text-slate-400">No expected questions are linked to this chunk.</p>}</div>
      <form className="space-y-2 rounded border p-3" onSubmit={(event) => { event.preventDefault(); void mutate("edit_visual", visual); }}><h3 className="font-medium">Visual metadata</h3><select required value={visual.id} onChange={(event) => { const item = details.visuals.find((v) => v.id === event.target.value); if (item) setVisual(item); }} className={fieldClass}><option value="">Select a visual</option>{details.visuals.map((item) => <option key={item.id} value={item.id}>{item.visual_id}</option>)}</select><input required placeholder="Title" value={visual.title} onChange={(event) => setVisual({ ...visual, title: event.target.value })} className={`ml-2 ${fieldClass}`} /><textarea required placeholder="Description" value={visual.description} onChange={(event) => setVisual({ ...visual, description: event.target.value })} className={`ml-2 align-middle ${fieldClass}`} /><select value={visual.review_status} onChange={(event) => setVisual({ ...visual, review_status: event.target.value })} className={`ml-2 ${fieldClass}`}><option>pending</option><option>approved</option><option>rejected</option></select><select value={visual.display_policy} onChange={(event) => setVisual({ ...visual, display_policy: event.target.value })} className={`ml-2 ${fieldClass}`}><option>llm_decide</option><option>always</option><option>never</option></select><button disabled={busy || !visual.id} className="ml-2 rounded border px-2 py-1">Save visual</button></form>
      <ul className="text-sm">{details.visuals.map((item) => <li key={item.id}>{item.visual_id} · {item.review_status} · {item.display_policy}<a className="ml-2 underline" target="_blank" rel="noreferrer" href={`/api/admin/rag/visual/${encodeURIComponent(item.id)}?board_id=${encodeURIComponent(scope.board_id)}&class_id=${encodeURIComponent(scope.class_id)}&subject_id=${encodeURIComponent(scope.subject_id)}&corpus_version_id=${encodeURIComponent(selected)}`}>Preview</a></li>)}</ul>
      <section className="rounded border p-3"><h3 className="font-medium">Named-version QA search</h3><form className="mt-2" onSubmit={(event) => { event.preventDefault(); void runQaSearch(); }}><input required value={qaQuestion} onChange={(event) => setQaQuestion(event.target.value)} placeholder="Ask a question about this corpus version" className={fieldClass} /><button disabled={busy || !qaQuestion.trim()} className="ml-2 rounded border px-2 py-1">{busy && qaSearchStatus.startsWith("Searching") ? "Searching…" : "Run QA search"}</button></form>{qaSearchStatus && <p role="status" className="mt-2 text-sm">{qaSearchStatus}</p>}{qaResult && <ol className="mt-3 space-y-3 text-sm">{qaResult.results.map((item) => <li key={item.citation.citation_id} className="rounded border border-slate-700 p-2"><div className="font-medium">#{item.fused_rank} · {item.citation.chapter_id} · {item.citation.topic_no} · {item.citation.topic_title}</div><div className="text-slate-300">{item.contributions.map((entry) => `${entry.channel} rank ${entry.rank}`).join(" · ")}</div><p className="mt-1">{item.citation.content.length > 300 ? `${item.citation.content.slice(0, 300)}…` : item.citation.content}</p></li>)}</ol>}</section><div><h3 className="font-medium">Audit records</h3><ul className="text-sm">{details.audits.map((audit) => <li key={audit.id}>{audit.created_at}: {audit.action}</li>)}</ul></div></section>}
  </div>;
}
