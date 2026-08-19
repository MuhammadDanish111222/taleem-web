"use client";

import { useMemo, useState } from "react";
import {
  type BoardPaperBlueprintInput,
  type AskAdminRequest,
} from "@/lib/ai/adminContracts";
import { callAskAdmin } from "@/lib/client/askAdmin";
import { getBoards, getChapters, getClasses, getSubjects } from "@/lib/firestore/catalogue";
import { useCatalogueOptions } from "@/lib/hooks/useCatalogueOptions";

type Section = BoardPaperBlueprintInput["sections"][number];
type Coverage = {
  satisfiable: boolean;
  total_marks: number;
  reason: string | null;
  sections: Array<{ key: string; required_count: number; available_count: number; selected_count: number; shortfall: number; satisfiable: boolean }>;
};
type StoredBlueprint = { name: string; config: BoardPaperBlueprintInput; is_active: boolean };

const inputClass = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const defaultSection = (key: string, type: Section["type"]): Section => ({
  key,
  title: type === "mcq" ? "Multiple Choice Questions" : type === "short" ? "Short Questions" : "Long Questions",
  type,
  select_count: type === "mcq" ? 12 : type === "short" ? 15 : 5,
  attempt_count: type === "mcq" ? 12 : type === "short" ? 10 : 3,
  marks_each: type === "mcq" ? 1 : type === "short" ? 2 : 4,
  difficulty_distribution: {},
  chapter_distribution: {},
});

const defaultConfig = (): BoardPaperBlueprintInput => ({
  duration_minutes: 120,
  sections: [defaultSection("A", "mcq"), defaultSection("B", "short"), defaultSection("C", "long")],
});

export default function BlueprintAdminClient() {
  const [scope, setScope] = useState({ board_id: "", class_id: "", subject_id: "" });
  const [name, setName] = useState("Board Paper Pattern");
  const [config, setConfig] = useState<BoardPaperBlueprintInput>(defaultConfig);
  const [active, setActive] = useState(false);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const boards = useCatalogueOptions("admin-blueprints-boards", getBoards);
  const classes = useCatalogueOptions(scope.board_id ? `admin-blueprints-classes:${scope.board_id}` : null, () => getClasses(scope.board_id));
  const subjects = useCatalogueOptions(scope.board_id && scope.class_id ? `admin-blueprints-subjects:${scope.board_id}:${scope.class_id}` : null, () => getSubjects(scope.board_id, scope.class_id));
  const chapters = useCatalogueOptions(scope.board_id && scope.class_id && scope.subject_id ? `admin-blueprints-chapters:${scope.board_id}:${scope.class_id}:${scope.subject_id}` : null, () => getChapters(scope.board_id, scope.class_id, scope.subject_id));
  const scopeReady = Boolean(scope.board_id && scope.class_id && scope.subject_id);
  const derivedMarks = useMemo(() => config.sections.reduce((sum, section) => sum + section.attempt_count * section.marks_each, 0), [config]);

  function updateScope(next: Partial<typeof scope>) {
    setScope((current) => ({ ...current, ...next }));
    setCoverage(null);
    setNotice("");
    setError("");
  }

  function updateSection(index: number, patch: Partial<Section>) {
    setConfig((current) => ({ ...current, sections: current.sections.map((section, i) => i === index ? { ...section, ...patch } : section) }));
    setCoverage(null);
  }

  function setQuota(index: number, kind: "difficulty_distribution" | "chapter_distribution", key: string, raw: string) {
    const count = Number(raw);
    setConfig((current) => ({
      ...current,
      sections: current.sections.map((section, i) => {
        if (i !== index) return section;
        const distribution = { ...section[kind] } as Record<string, number>;
        if (!raw) delete distribution[key];
        else if (Number.isInteger(count) && count > 0) distribution[key] = count;
        return { ...section, [kind]: distribution };
      }),
    }));
    setCoverage(null);
  }

  async function load() {
    if (!scopeReady) return setError("Select Board, Class, and Subject first.");
    setBusy(true); setError(""); setNotice(""); setCoverage(null);
    try {
      const result = await callAskAdmin<{ blueprint: StoredBlueprint | null }>({ operation: "blueprint_get", ...scope });
      if (result.blueprint) {
        setName(result.blueprint.name); setConfig(result.blueprint.config); setActive(result.blueprint.is_active);
        setNotice(result.blueprint.is_active ? "Active blueprint loaded." : "Inactive draft loaded.");
      } else {
        setConfig(defaultConfig()); setActive(false); setNotice("No saved blueprint for this scope; a default draft is ready.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load blueprint"); }
    finally { setBusy(false); }
  }

  function request(operation: "blueprint_preview" | "blueprint_save"): AskAdminRequest {
    return operation === "blueprint_preview"
      ? { operation, ...scope, blueprint: config, selection_seed: "admin-coverage" }
      : { operation, ...scope, blueprint: config, blueprint_name: name.trim(), blueprint_active: active, selection_seed: "blueprint-activation" };
  }

  async function checkCoverage() {
    if (!scopeReady) return setError("Select Board, Class, and Subject first.");
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await callAskAdmin<Coverage>(request("blueprint_preview"));
      setCoverage(result);
      setNotice(result.satisfiable ? "Exact coverage check passed." : "Exact coverage check found a shortfall.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Coverage check failed"); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!scopeReady || !name.trim()) return setError("Complete the scope and blueprint name first.");
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await callAskAdmin<{ blueprint: StoredBlueprint; coverage: Coverage }>(request("blueprint_save"));
      setActive(result.blueprint.is_active); setCoverage(result.coverage);
      setNotice(result.blueprint.is_active ? "Blueprint saved and activated." : "Blueprint saved as an inactive draft.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save blueprint"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl p-8 text-slate-900">
      <h1 className="text-3xl font-bold text-slate-900">Test Paper Blueprints</h1>
      <p className="mt-2 text-sm font-medium text-slate-600">Default board-paper pattern. Activation is blocked unless the approved bank can satisfy the exact rules.</p>
      
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <select className={inputClass} value={scope.board_id} onChange={(event) => updateScope({ board_id: event.target.value, class_id: "", subject_id: "" })}>
          <option value="">Select Board</option>
          {boards.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
        </select>
        <select className={inputClass} value={scope.class_id} disabled={!scope.board_id} onChange={(event) => updateScope({ class_id: event.target.value, subject_id: "" })}>
          <option value="">Select Class</option>
          {classes.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
        </select>
        <select className={inputClass} value={scope.subject_id} disabled={!scope.class_id} onChange={(event) => updateScope({ subject_id: event.target.value })}>
          <option value="">Select Subject</option>
          {subjects.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
        </select>
        <button type="button" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 shadow-sm" disabled={busy || !scopeReady} onClick={() => void load()}>
          Load blueprint
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-semibold text-slate-800">Pattern name
          <input className={`${inputClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-800">Duration (minutes)
          <input className={`${inputClass} mt-1.5`} type="number" min="1" max="600" value={config.duration_minutes} onChange={(event) => setConfig((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} />
        </label>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-slate-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Derived attempted marks</span>
          <div className="mt-1 text-2xl font-bold text-slate-900">{derivedMarks}</div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {config.sections.map((section, index) => (
          <section key={`${section.key}-${index}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
            <div className="grid gap-3 md:grid-cols-6">
              <label className="text-xs font-semibold text-slate-800">Key
                <input className={`${inputClass} mt-1`} value={section.key} onChange={(event) => updateSection(index, { key: event.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-800 md:col-span-2">Title
                <input className={`${inputClass} mt-1`} value={section.title} onChange={(event) => updateSection(index, { title: event.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-800">Type
                <select className={`${inputClass} mt-1`} value={section.type} onChange={(event) => updateSection(index, { type: event.target.value as Section["type"] })}>
                  <option value="mcq">MCQ</option>
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-800">Show
                <input className={`${inputClass} mt-1`} type="number" min="1" value={section.select_count} onChange={(event) => updateSection(index, { select_count: Number(event.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-slate-800">Attempt
                <input className={`${inputClass} mt-1`} type="number" min="1" value={section.attempt_count} onChange={(event) => updateSection(index, { attempt_count: Number(event.target.value) })} />
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="text-xs font-semibold text-slate-800">Marks each
                <input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" value={section.marks_each} onChange={(event) => updateSection(index, { marks_each: Number(event.target.value) })} />
              </label>
              <div className="text-xs font-medium text-slate-700 md:col-span-3 pt-5">
                Attempted section marks: <strong className="text-slate-900 font-bold">{section.attempt_count * section.marks_each}</strong>
              </div>
            </div>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">Optional difficulty quotas</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as const).map((difficulty) => (
                    <label key={difficulty} className="text-xs font-medium text-slate-700 capitalize">
                      {difficulty}
                      <input className={`${inputClass} mt-1`} type="number" min="1" placeholder="Any" value={section.difficulty_distribution[difficulty] ?? ""} onChange={(event) => setQuota(index, "difficulty_distribution", difficulty, event.target.value)} />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Optional chapter quotas</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {chapters.data?.map((chapter) => (
                    <label key={chapter.slug} className="text-xs font-medium text-slate-700 truncate" title={chapter.title}>
                      {chapter.title}
                      <input className={`${inputClass} mt-1`} type="number" min="1" placeholder="Any" value={section.chapter_distribution[chapter.slug] ?? ""} onChange={(event) => setQuota(index, "chapter_distribution", chapter.slug, event.target.value)} />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" className="mt-4 text-xs font-bold text-red-700 hover:text-red-800 disabled:opacity-50" disabled={config.sections.length === 1} onClick={() => setConfig((current) => ({ ...current, sections: current.sections.filter((_, i) => i !== index) }))}>
              Remove section
            </button>
          </section>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 shadow-sm" onClick={() => setConfig((current) => ({ ...current, sections: [...current.sections, defaultSection(`S${current.sections.length + 1}`, "short")] }))}>
          + Add section
        </button>
        <button type="button" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 shadow-sm" disabled={busy || !scopeReady} onClick={() => void checkCoverage()}>
          Check coverage
        </button>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Activate after save
        </label>
        <button type="button" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 shadow-sm" disabled={busy || !scopeReady} onClick={() => void save()}>
          Save blueprint
        </button>
      </div>

      {coverage && (
        <div className={`mt-5 rounded-xl border p-5 ${coverage.satisfiable ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p className="font-bold">{coverage.satisfiable ? "Coverage OK" : "Coverage not satisfied"} · Total attempted marks: {coverage.total_marks}</p>
          {coverage.sections.map((item) => (
            <p key={item.key} className="mt-1 text-sm font-medium">
              Section {item.key}: need {item.required_count}, available {item.available_count}, allocatable {item.selected_count}
              {item.shortfall ? ` — short by ${item.shortfall}` : ""}
            </p>
          ))}
        </div>
      )}

      {notice && <p className="mt-4 text-sm font-semibold text-emerald-700">{notice}</p>}
      {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
