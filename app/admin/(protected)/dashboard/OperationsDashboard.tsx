"use client";

import { useEffect, useState } from "react";

type Row = Record<string, unknown>;
type Dashboard = { summary: { job_count: number }; jobs: Row[]; rag: Row; answers: Row; retrieval: { numerator: number; denominator: number; rate: number }; providers: Row[]; quota: { blocks: number }; test_generation: { failures: number }; recent_failures: Row[] };
type Audit = { id: string; action: string; target_type: string; target_id: string; created_at: string };
const value = (item: unknown) => typeof item === "number" ? item : 0;

export default function OperationsDashboard() {
  const [window, setWindow] = useState("24h"); const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState("");
  const [audits, setAudits] = useState<Audit[]>([]); const [auditError, setAuditError] = useState(""); const [action, setAction] = useState(""); const [targetType, setTargetType] = useState(""); const [targetId, setTargetId] = useState(""); const [errorCode, setErrorCode] = useState(""); const [cursor, setCursor] = useState<string | null>(null); const [pageStart, setPageStart] = useState<string | null>(null); const [history, setHistory] = useState<Array<string | null>>([]);
  useEffect(() => { setData(null); setError(""); fetch(`/api/admin/operations/dashboard?window=${window}`, { cache: "no-store" }).then(async (response) => response.ok ? setData(await response.json()) : setError("Operational data is unavailable.")).catch(() => setError("Operational data is unavailable.")); }, [window]);
  const loadAudits = (next: string | null = null) => { setAuditError(""); const params = new URLSearchParams({ window, limit: "50" }); if (action) params.set("action", action); if (targetType) params.set("target_type", targetType); if (targetId) params.set("target_id", targetId); if (errorCode) params.set("error_code", errorCode); if (next) params.set("cursor", next); fetch(`/api/admin/operations/audits?${params}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const payload = await response.json(); setAudits(payload.items); setCursor(payload.next_cursor); }).catch(() => setAuditError("Audit history is unavailable.")); };
  // Filters are submitted explicitly; including the render-local loader would refetch on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setHistory([]); setPageStart(null); loadAudits(); }, [window]);
  const cards = data ? [["Jobs", data.summary.job_count], ["Retrieval empty", `${value(data.retrieval.numerator)}/${value(data.retrieval.denominator)} (${(value(data.retrieval.rate) * 100).toFixed(1)}%)`], ["Quota blocks", data.quota.blocks], ["General AI fallbacks", value(data.answers.general_fallbacks)], ["Approved-bank hits", value(data.answers.approved_bank_hits)], ["Pending candidates", value(data.answers.pending_candidates)], ["Test-generation failures", data.test_generation.failures]] : [];
  return (
    <main className="max-w-6xl p-8 text-slate-900">
      <h1 className="text-3xl font-bold text-slate-900">Operations dashboard</h1>
      <label className="mt-4 block font-medium text-slate-800">
        Time window{" "}
        <select
          aria-label="Time window"
          className="ml-2 rounded border border-slate-300 bg-white p-2 text-sm font-semibold text-slate-900 shadow-sm"
          value={window}
          onChange={(event) => setWindow(event.target.value)}
        >
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </label>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
      {!data && !error && <p className="mt-4 text-sm font-medium text-slate-600">Loading persisted operational data…</p>}
      {data && (
        <>
          <p className="mt-2 text-sm font-medium text-slate-600">
            All values are persisted data for this window; Multiple Ask rows follow their retention policy.
          </p>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {cards.map(([label, count]) => (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={String(label)}>
                <p className="text-sm font-semibold text-slate-600">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{String(count)}</p>
              </div>
            ))}
          </section>
          <Table title="Jobs" rows={data.jobs} />
          <Table title="RAG" rows={Object.entries(data.rag).map(([metric, count]) => ({ metric, count }))} />
          <Table title="Answers" rows={Object.entries(data.answers).map(([metric, count]) => ({ metric, count }))} />
          <Table title="Provider errors" rows={data.providers} />
          <Table title="Recent sanitized failures" rows={data.recent_failures} />
        </>
      )}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Audit history</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setHistory([]);
            setPageStart(null);
            loadAudits();
          }}
        >
          <input
            aria-label="Audit action"
            className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
          <input
            aria-label="Audit target type"
            className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Target type"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
          />
          <input
            aria-label="Audit target ID"
            className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Target ID"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          />
          <input
            aria-label="Audit error code"
            className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Error code"
            value={errorCode}
            onChange={(event) => setErrorCode(event.target.value)}
          />
          <button className="rounded-lg bg-blue-700 p-2.5 text-sm font-semibold text-white hover:bg-blue-600" type="submit">
            Search
          </button>
        </form>
        {auditError && <p role="alert" className="mt-4 text-sm font-medium text-red-700">{auditError}</p>}
        {!auditError && <Table title="" rows={audits as unknown as Row[]} />}
        <div className="mt-4 flex gap-2">
          <button
            disabled={!history.length}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              const prior = history.at(-1) ?? null;
              setHistory((items) => items.slice(0, -1));
              setPageStart(prior);
              loadAudits(prior);
            }}
          >
            Previous
          </button>
          <button
            disabled={!cursor}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              if (cursor) {
                setHistory((items) => [...items, pageStart]);
                setPageStart(cursor);
                loadAudits(cursor);
              }
            }}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}

function Table({ title, rows }: { title: string; rows: Row[] }) {
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <section className={title ? "mt-8" : "mt-4"}>
      {title && <h2 className="text-xl font-bold text-slate-900">{title}</h2>}
      {!rows.length ? (
        <p className="mt-2 text-sm font-medium text-slate-500">No retained records in this period.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-900">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-800">
                <tr>
                  {keys.map((key) => (
                    <th className="px-4 py-3" key={key}>
                      {key.replaceAll("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    {keys.map((key) => (
                      <td className="px-4 py-3 font-medium text-slate-900" key={key}>
                        {String(row[key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
