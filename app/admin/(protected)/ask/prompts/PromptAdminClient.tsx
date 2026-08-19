"use client";

import { useEffect, useMemo, useState } from "react";
import type { PromptHistoryItem } from "@/lib/ai/adminContracts";
import { callAskAdmin } from "@/lib/client/askAdmin";

type PromptKey = "ask_grounded" | "ask_general";
type AnswerMode = "short" | "long";
type PromptType = "rag_short" | "rag_long" | "general_short" | "general_long";
type ScopeKind = "subject_global" | "exact";

const promptTypes: Record<PromptType, { label: string; promptKey: PromptKey; answerMode: AnswerMode }> = {
  rag_short: { label: "RAG Short", promptKey: "ask_grounded", answerMode: "short" },
  rag_long: { label: "RAG Long", promptKey: "ask_grounded", answerMode: "long" },
  general_short: { label: "General Short", promptKey: "ask_general", answerMode: "short" },
  general_long: { label: "General Long", promptKey: "ask_general", answerMode: "long" },
};

const inputClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export default function PromptAdminClient() {
  const [promptType, setPromptType] = useState<PromptType>("rag_short");
  const [scopeKind, setScopeKind] = useState<ScopeKind>("subject_global");
  const [boardId, setBoardId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [items, setItems] = useState<PromptHistoryItem[]>([]);
  const [content, setContent] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [testQuestion, setTestQuestion] = useState("");
  const [semanticThreshold, setSemanticThreshold] = useState("0.82");
  const [semanticScope, setSemanticScope] = useState("");
  const [testResult, setTestResult] = useState<{
    document: unknown;
    provider: string;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number };
    latency_ms: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const { promptKey, answerMode } = promptTypes[promptType];
  const scope = useMemo(() => ({
    ...(scopeKind === "exact" ? { board_id: boardId.trim(), class_id: classId.trim() } : {}),
    subject_id: subjectId.trim(),
  }), [boardId, classId, scopeKind, subjectId]);

  const scopeReady = Boolean(subjectId.trim())
    && (scopeKind === "subject_global" || Boolean(boardId.trim() && classId.trim()));

  useEffect(() => {
    // A selected prompt belongs to the exact key/mode/scope that loaded it.
    // Clear it whenever that identity changes so mutations cannot target a
    // stale prompt while the page displays a different scope.
    setItems([]);
    setSelectedId("");
    setContent("");
    setTestResult(null);
    setNotice("");
    setError("");
  }, [boardId, classId, promptType, scopeKind, subjectId]);

  async function loadSemanticThreshold() {
    if (!subjectId.trim()) return;
    try {
      const result = await callAskAdmin<{
        scope: { class_id: string | null; subject_id: string | null };
        semantic_similarity_threshold: number;
      }>({
        operation: "source_policy_get",
        subject_id: subjectId.trim(),
        ...(scopeKind === "exact" && classId.trim() ? { class_id: classId.trim() } : {}),
      });
      setSemanticThreshold(String(result.semantic_similarity_threshold));
      setSemanticScope(result.scope.class_id ? "class-specific" : "subject-global");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load semantic threshold");
    }
  }

  async function saveSemanticThreshold() {
    const value = Number(semanticThreshold);
    if (!Number.isFinite(value) || value < 0.80 || value > 0.99 || !subjectId.trim()) {
      setError("Use a semantic threshold from 0.80 to 0.99 and provide a subject ID.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{ semantic_similarity_threshold: number }>({
        operation: "source_policy_set_semantic_threshold",
        subject_id: subjectId.trim(),
        ...(scopeKind === "exact" && classId.trim() ? { class_id: classId.trim() } : {}),
        semantic_similarity_threshold: value,
      });
      setSemanticThreshold(String(result.semantic_similarity_threshold));
      setNotice("Approved-answer semantic threshold saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save semantic threshold");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(preferredId = selectedId) {
    if (!scopeReady) {
      setError("Complete the selected prompt scope before loading history.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await callAskAdmin<{ items: PromptHistoryItem[] }>({
        operation: "prompt_history",
        prompt_key: promptKey,
        answer_mode: answerMode,
        ...scope,
        limit: 100,
      });
      setItems(result.items);
      const active = result.items.find((item) => item.status === "active");
      const nextSelected = result.items.find((item) => item.id === preferredId) ?? active ?? result.items[0];
      setSelectedId(nextSelected?.id ?? "");
      setContent(nextSelected?.content ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load prompt history");
    } finally {
      setBusy(false);
    }
  }

  const selected = items.find((item) => item.id === selectedId);
  const active = items.find((item) => item.status === "active");

  function choose(item: PromptHistoryItem) {
    setSelectedId(item.id);
    setContent(item.content);
    setTestResult(null);
    setNotice("");
  }

  async function createDraft() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{ prompt_id: string; version: number }>({
        operation: "prompt_create_draft",
        prompt_key: promptKey,
        answer_mode: answerMode,
        ...scope,
        content,
      });
      setNotice(`Draft version ${result.version} created separately.`);
      await loadHistory(result.prompt_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create prompt draft");
    } finally {
      setBusy(false);
    }
  }

  async function updateDraft() {
    if (!selected || selected.status !== "draft") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{ prompt_id: string; version: number; status: string }>({
        operation: "prompt_update_draft",
        prompt_id: selected.id,
        content,
      });
      setNotice(`Draft version ${result.version} updated. The audited content hash was refreshed.`);
      await loadHistory(result.prompt_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update prompt draft");
    } finally {
      setBusy(false);
    }
  }

  async function testDraft() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callAskAdmin<{
        document: unknown;
        provider: string;
        model: string;
        usage: { prompt_tokens: number; completion_tokens: number };
        latency_ms: number;
      }>({
        operation: "prompt_test_draft",
        prompt_id: selected.id,
        question: testQuestion,
      });
      setTestResult(result);
      setNotice("Admin-paid draft test completed. Student quota was not used.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prompt test failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeActive(operation: "prompt_activate" | "prompt_rollback") {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callAskAdmin<{ active_prompt_id: string }>({ operation, prompt_id: selected.id });
      setNotice(operation === "prompt_activate" ? "Prompt activated and shared cache invalidated." : "Prompt rolled back and shared cache invalidated.");
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prompt activation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Local-only Module 4</p>
        <h1 className="text-3xl font-bold text-slate-900">Prompt management</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">Manage the four prompt types independently at an exact Board/Class/Subject scope or a Subject Global fallback. Prompt content remains server-admin data.</p>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3 text-slate-900">
        <label className="grid gap-1 text-sm font-semibold text-slate-800">Prompt type
          <select className={inputClass} value={promptType} onChange={(event) => setPromptType(event.target.value as PromptType)}>
            {Object.entries(promptTypes).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-800">Scope
          <select className={inputClass} value={scopeKind} onChange={(event) => setScopeKind(event.target.value as ScopeKind)}>
            <option value="subject_global">Subject Global</option>
            <option value="exact">Exact Board + Class + Subject</option>
          </select>
        </label>
        {scopeKind === "exact" ? <input aria-label="Board ID" className={inputClass} placeholder="Board ID" value={boardId} onChange={(event) => setBoardId(event.target.value)} /> : null}
        {scopeKind === "exact" ? <input aria-label="Class ID" className={inputClass} placeholder="Class ID" value={classId} onChange={(event) => setClassId(event.target.value)} /> : null}
        <input aria-label="Subject ID" className={inputClass} placeholder="Subject ID" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
        <h2 className="font-bold text-lg text-slate-900">Approved answer semantic threshold</h2>
        <p className="mt-1 text-sm font-medium text-slate-600">Minimum similarity required before an approved answer may be reused for a semantically similar question.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-800">Minimum similarity
            <input aria-label="Approved answer semantic threshold" className={`${inputClass} w-40`} type="number" min="0.80" max="0.99" step="0.01" value={semanticThreshold} onChange={(event) => setSemanticThreshold(event.target.value)} disabled={!subjectId.trim()} />
          </label>
          <button type="button" onClick={() => void loadSemanticThreshold()} disabled={busy || !subjectId.trim()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 shadow-sm disabled:opacity-50">Load current</button>
          <button type="button" onClick={() => void saveSemanticThreshold()} disabled={busy || !subjectId.trim() || (scopeKind === "exact" && !classId.trim())} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 shadow-sm disabled:opacity-50">Save threshold</button>
          <span className="pb-2 text-xs font-semibold text-slate-600">Current source: {semanticScope || "not loaded"}</span>
        </div>
      </div>

      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800 border border-emerald-200">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-lg text-slate-900">History</h2>
            <button type="button" className="text-sm font-semibold text-indigo-700 hover:text-indigo-800" onClick={() => void loadHistory()} disabled={busy || !scopeReady}>Load history</button>
          </div>
          <p className="mb-3 text-sm font-medium text-slate-600">Active: <span className="font-bold text-slate-900">{active ? `v${active.version}` : "none for this scope"}</span></p>
          <div className="grid max-h-[40rem] gap-2 overflow-y-auto">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => choose(item)} className={`rounded-xl border p-3 text-left text-sm transition-colors ${selectedId === item.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className="font-bold text-slate-900">v{item.version}</span>{" "}
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{item.status}</span>
                <span className="mt-1 block text-xs font-medium text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
              </button>
            ))}
            {!busy && items.length === 0 ? <p className="text-sm font-medium text-slate-500">No prompt versions found.</p> : null}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
            <h2 className="font-bold text-lg text-slate-900">Create or edit a draft</h2>
            <p className="mt-1 text-sm font-medium text-slate-600">Create a separate version, or update only the currently selected draft. Active and retired versions remain immutable.</p>
            <textarea aria-label="Prompt content" className="mt-4 min-h-72 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 placeholder:text-slate-400" value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void createDraft()} disabled={busy || !scopeReady || !content.trim()} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 shadow-sm">Create new draft</button>
              <button type="button" onClick={() => void updateDraft()} disabled={busy || !selected || selected.status !== "draft" || !content.trim()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 shadow-sm">Update selected draft</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
            <h2 className="font-bold text-lg text-slate-900">Test and activate selected version</h2>
            <p className="mt-1 text-sm font-medium text-slate-600">Draft tests are paid admin provider tests and do not consume student quota. They accept typed text only.</p>
            <textarea aria-label="Prompt test question" className="mt-4 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400" placeholder="Enter one controlled test question" value={testQuestion} onChange={(event) => setTestQuestion(event.target.value)} maxLength={4000} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void testDraft()} disabled={busy || !selected || selected.status !== "draft" || !testQuestion.trim()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 shadow-sm">Test draft</button>
              <button type="button" onClick={() => void changeActive("prompt_activate")} disabled={busy || !selected || selected.status !== "draft"} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 shadow-sm">Activate</button>
              <button type="button" onClick={() => void changeActive("prompt_rollback")} disabled={busy || !selected || selected.status !== "retired"} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 shadow-sm">Rollback</button>
            </div>
            {testResult ? (
              <div className="mt-4 rounded-xl bg-slate-950 p-4 text-sm text-slate-100 shadow-inner">
                <p className="font-semibold text-slate-200">Provider/model: <span className="font-mono text-emerald-400">{testResult.provider} / {testResult.model}</span></p>
                <p className="mt-1 text-xs text-slate-400">Tokens: {testResult.usage.prompt_tokens} prompt + {testResult.usage.completion_tokens} completion · Latency: {testResult.latency_ms} ms</p>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-200 font-mono">{JSON.stringify(testResult.document, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
