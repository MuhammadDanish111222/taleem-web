"use client";

import { useEffect, useMemo, useState } from "react";
import { BoardSelector } from "@/components/selectors/BoardSelector";
import { ClassSelector } from "@/components/selectors/ClassSelector";
import { SubjectSelector } from "@/components/selectors/SubjectSelector";
import { MultiChapterSelector } from "@/components/tests/MultiChapterSelector";
import { PaperPreview } from "@/components/tests/PaperPreview";
import { getChapters } from "@/lib/firestore/catalogue";
import { useCatalogueOptions } from "@/lib/hooks/useCatalogueOptions";
import { useCatalogueSelection } from "@/lib/state/catalogueSelection";
import { useAuth } from "@/lib/auth/useAuth";
import { buildCustomSelectionSpec, buildPaperPresentationModel, CUSTOM_LIMIT_PER_SECTION, testPaperResponseSchema, type CustomDifficulty, type PaperPresentationModel } from "@/lib/tests/paper";
import { downloadPaperPdf } from "@/lib/tests/pdf";

type Mode = "board" | "custom";
type Counts = { mcq: number; short: number; long: number };
const EMPTY_COUNTS: Counts = { mcq: 10, short: 5, long: 2 };

const messages: Record<string, string> = {
  NO_ACTIVE_BLUEPRINT: "A Board Paper Pattern is not available for this subject yet. Please try Custom Paper instead.",
  INSUFFICIENT_QUESTION_BANK: "There are not enough approved questions for this paper configuration. Try fewer questions or different chapters.",
  INVALID_CUSTOM_SPEC: "This Custom Paper configuration is not valid. Please review your selections.",
  RATE_LIMITED: "You have generated several papers recently. Please try again shortly.",
  TEST_GENERATOR_TIMEOUT: "Paper generation took too long. Retry the same request.",
  TEST_GENERATOR_UNAVAILABLE: "The Test Generator is temporarily unavailable. Please try again.",
  AUTHENTICATION_EXPIRED: "Your sign-in has expired. Please sign in again.",
};

function newRequestId() { return crypto.randomUUID(); }

export function TestGeneratorClient() {
  const { user, loading: authLoading, signInGoogle } = useAuth();
  const { boardId, classId, subjectId } = useCatalogueSelection();
  const [mode, setMode] = useState<Mode>("board");
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [difficulty, setDifficulty] = useState<CustomDifficulty>("mixed");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [paper, setPaper] = useState<PaperPresentationModel | null>(null);
  const [error, setError] = useState<{ code: string; retryable: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);
  const chapterKey = boardId && classId && subjectId ? `test-chapters-${boardId}-${classId}-${subjectId}` : null;
  const chapters = useCatalogueOptions(chapterKey, () => getChapters(boardId!, classId!, subjectId!));

  useEffect(() => { setChapterIds([]); }, [boardId, classId, subjectId]);
  const totalQuestions = counts.mcq + counts.short + counts.long;
  const ready = !!boardId && !!classId && !!subjectId && (mode === "board" || (chapterIds.length > 0 && totalQuestions > 0));
  const customSpec = useMemo(() => {
    try { return buildCustomSelectionSpec({ chapterIds, mcqCount: counts.mcq, shortCount: counts.short, longCount: counts.long, difficulty }); }
    catch { return null; }
  }, [chapterIds, counts, difficulty]);

  async function generate(reuseRequestId = false) {
    if (!user || !ready || generating || (mode === "custom" && !customSpec)) return;
    const activeRequestId = reuseRequestId && requestId ? requestId : newRequestId();
    if (!reuseRequestId) setRequestId(activeRequestId);
    setGenerating(true); setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/tests/generate", {
        method: "POST", cache: "no-store", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(mode === "board" ? { mode, boardId, classId, subjectId, requestId: activeRequestId } : { mode, boardId, classId, subjectId, requestId: activeRequestId, spec: customSpec }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = typeof (data as { error?: { code?: unknown } })?.error?.code === "string" ? (data as { error: { code: string } }).error.code : "TEST_GENERATOR_UNAVAILABLE";
        throw Object.assign(new Error(code), { code, retryable: response.status >= 500 || code === "TEST_GENERATOR_TIMEOUT" });
      }
      const parsed = testPaperResponseSchema.safeParse(data);
      if (!parsed.success) throw Object.assign(new Error("TEST_GENERATOR_UNAVAILABLE"), { code: "TEST_GENERATOR_UNAVAILABLE", retryable: true });
      setPaper(buildPaperPresentationModel(parsed.data));
    } catch (caught) {
      const value = caught as { code?: string; retryable?: boolean };
      setError({ code: value.code ?? "TEST_GENERATOR_UNAVAILABLE", retryable: value.retryable ?? true });
    } finally { setGenerating(false); }
  }

  function setCount(kind: keyof Counts, value: string) {
    const count = Math.max(0, Math.min(CUSTOM_LIMIT_PER_SECTION, Number.parseInt(value, 10) || 0));
    setCounts((previous) => ({ ...previous, [kind]: count }));
  }

  if (authLoading) return <main className="mx-auto max-w-5xl p-6" aria-busy="true">Loading Test Generator…</main>;
  if (!user) return <main className="mx-auto max-w-xl p-6 sm:p-10"><section className="rounded-xl border bg-white p-6 shadow-sm"><h1 className="text-2xl font-bold">Test Paper Generator</h1><p className="mt-2 text-slate-700">Sign in to generate an ephemeral practice paper.</p><button type="button" onClick={() => void signInGoogle()} className="mt-5 rounded-md bg-blue-700 px-4 py-2 font-semibold text-white">Sign in with Google</button></section></main>;
  if (paper) return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><div className="mx-auto mb-5 flex max-w-4xl flex-wrap gap-3"><button type="button" onClick={() => void downloadPaperPdf(paper)} className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white">Download PDF</button><button type="button" onClick={() => { setPaper(null); setRequestId(null); setError(null); }} className="rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800">Edit Settings</button><button type="button" onClick={() => { setPaper(null); void generate(false); }} disabled={generating} className="rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 disabled:opacity-50">Generate New Paper</button></div><PaperPreview paper={paper} /></main>;

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><h1 className="text-3xl font-bold text-slate-950">Test Paper Generator</h1><p className="mt-2 text-slate-600">Configure a paper, preview it, then download your copy. Generated papers are not saved.</p>
    <div className="mt-6 grid grid-cols-2 rounded-lg border border-slate-200 p-1"><button type="button" aria-pressed={mode === "board"} onClick={() => setMode("board")} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "board" ? "bg-blue-700 text-white" : "text-slate-700"}`}>Board Paper Pattern</button><button type="button" aria-pressed={mode === "custom"} onClick={() => setMode("custom")} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "custom" ? "bg-blue-700 text-white" : "text-slate-700"}`}>Custom Paper</button></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><BoardSelector /><ClassSelector /><SubjectSelector /></div>
    {mode === "custom" && <div className="mt-6 space-y-5"><MultiChapterSelector chapters={chapters.data} selectedIds={chapterIds} onChange={(ids) => setChapterIds([...new Set(ids)])} disabled={chapters.loading} /><fieldset><legend className="text-sm font-semibold text-slate-800">Question counts</legend><div className="mt-2 grid gap-3 sm:grid-cols-3">{([['mcq', 'MCQs'], ['short', 'Short Questions'], ['long', 'Long Questions']] as const).map(([kind, label]) => <label key={kind} className="text-sm font-medium text-slate-700">{label}<input type="number" min="0" max={CUSTOM_LIMIT_PER_SECTION} value={counts[kind]} onChange={(event) => setCount(kind, event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 p-2" /></label>)}</div><p className="mt-2 text-xs text-slate-500">Marks: MCQ 1, Short 2, Long 4. You attempt every selected question.</p></fieldset><label className="block text-sm font-semibold text-slate-800">Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as CustomDifficulty)} className="mt-1 block w-full rounded-md border border-slate-300 p-2"><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div>}
    {error && <div role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-900"><p>{messages[error.code] ?? messages.TEST_GENERATOR_UNAVAILABLE}</p>{error.retryable && <button type="button" onClick={() => void generate(true)} disabled={generating} className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 font-semibold">Retry</button>}</div>}
    <button type="button" onClick={() => void generate()} disabled={!ready || generating || (mode === "custom" && !customSpec)} className="mt-7 w-full rounded-md bg-blue-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300" aria-busy={generating}>{generating ? "Generating your paper…" : "Generate Paper"}</button>
  </section></main>;
}
