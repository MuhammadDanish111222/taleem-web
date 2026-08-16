"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ScopeKind = "global" | "subject" | "class_subject" | "account_tier";
type Definition = { key: string; value_type: "integer" | "number" | "boolean" | "enum"; default: unknown; minimum: number | null; maximum: number | null; hard_ceiling: number | null; allowed_values: string[]; scopes: ScopeKind[]; description: string; owner: string; };

async function csrf(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const data = await response.json();
  return data.csrfToken;
}

export default function AiSettingsClient() {
  const [registry, setRegistry] = useState<Definition[]>([]);
  const [key, setKey] = useState(""); const [scope, setScope] = useState<ScopeKind>("global"); const [valueLoading, setValueLoading] = useState(true);
  const [subjectId, setSubjectId] = useState(""); const [classId, setClassId] = useState(""); const [tier, setTier] = useState("anonymous"); const [rawValue, setRawValue] = useState(""); const [message, setMessage] = useState("");
  const current = useMemo(() => registry.find((item) => item.key === key), [registry, key]);
  const load = useCallback(async () => { const response = await fetch("/api/admin/ai-settings", { cache: "no-store" }); if (!response.ok) { setMessage("Settings are unavailable."); return; } const data = await response.json(); setRegistry(data.registry); setKey((selected) => selected || data.registry[0]?.key || ""); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (current && !current.scopes.includes(scope)) setScope(current.scopes[0]); }, [current, scope]);
  useEffect(() => { if (!key || !current) return; const params = new URLSearchParams({ key, scope_kind: scope }); if (scope === "subject" || scope === "class_subject") { if (!subjectId) { setValueLoading(true); return; } params.set("subject_id", subjectId); } if (scope === "class_subject") { if (!classId) { setValueLoading(true); return; } params.set("class_id", classId); } if (scope === "account_tier") { const keyTier = key.split(".").pop(); if (keyTier) { setTier(keyTier); params.set("account_tier", keyTier); } } setValueLoading(true); fetch(`/api/admin/ai-settings?${params}`, { cache:"no-store" }).then(async r => { if (!r.ok) throw new Error(); const item=(await r.json()).selected; setRawValue(String(item.value)); }).catch(() => setMessage("Current setting value is unavailable.")).finally(()=>setValueLoading(false)); }, [key, scope, subjectId, classId, current]);
  const valueFor = () => { if (current?.value_type === "boolean") return rawValue === "true"; if (current?.value_type === "integer" || current?.value_type === "number") return Number(rawValue); return rawValue; };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!current || valueLoading || rawValue === "" || !Number.isFinite(valueFor() as number) && (current.value_type === "integer" || current.value_type === "number")) return; const selectedScope: Record<string, string> = { kind: scope }; if (scope === "subject" || scope === "class_subject") selectedScope.subject_id = subjectId; if (scope === "class_subject") selectedScope.class_id = classId; if (scope === "account_tier") selectedScope.account_tier = key.split(".").pop() || tier; const response = await fetch("/api/admin/ai-settings", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": await csrf() }, body: JSON.stringify({ key, scope: selectedScope, value: valueFor() }) }); const data = await response.json().catch(() => ({})); setMessage(response.ok ? "Setting saved. The next relevant request will use it." : `Setting rejected: ${data.code ?? "RUNTIME_SETTING_REJECTED"}`); if (response.ok) await load(); };
  return <section className="p-8 max-w-4xl"><h1 className="text-2xl font-bold">AI runtime settings</h1><p className="mt-2 text-sm text-gray-600">Only allowlisted operational settings are editable. Prompts remain in Ask Prompts; the grounded-evidence rule and all secrets stay locked in code or environment configuration.</p><form onSubmit={submit} className="mt-6 grid gap-4 rounded border bg-white p-5">
    <label>Setting<select className="ml-2 border p-2" value={key} onChange={(e) => { setKey(e.target.value); setRawValue(""); }}>{registry.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}</select></label>
    <p className="text-sm">{current?.description} <span className="text-gray-500">Owner: {current?.owner}; bounds: {current?.minimum ?? "—"} to {current?.maximum ?? "—"}.</span></p>
    <label>Scope<select className="ml-2 border p-2" value={scope} onChange={(e) => setScope(e.target.value as ScopeKind)}>{current?.scopes.map((item) => <option key={item}>{item}</option>)}</select></label>
    {(scope === "subject" || scope === "class_subject") && <label>Subject <input required className="ml-2 border p-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} /></label>}
    {scope === "class_subject" && <label>Class <input required className="ml-2 border p-2" value={classId} onChange={(e) => setClassId(e.target.value)} /></label>}
    {scope === "account_tier" && <label>Tier <input className="ml-2 border p-2" value={key.split(".").pop() || tier} readOnly /></label>}
    {current?.value_type === "boolean" ? <label>Value <select className="ml-2 border p-2" value={rawValue} onChange={(e) => setRawValue(e.target.value)}><option value="true">true</option><option value="false">false</option></select></label> : current?.value_type === "enum" ? <label>Value <select className="ml-2 border p-2" value={rawValue} onChange={(e) => setRawValue(e.target.value)}>{current.allowed_values.map((value) => <option key={value}>{value}</option>)}</select></label> : <label>Value <input required type="number" min={current?.minimum ?? undefined} max={current?.maximum ?? undefined} className="ml-2 border p-2" value={rawValue} onChange={(e) => setRawValue(e.target.value)} /></label>}
    <button disabled={valueLoading || rawValue === ""} className="w-fit rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" type="submit">{valueLoading ? "Loading current value…" : "Save setting"}</button>{message && <p role="status" className="text-sm">{message}</p>}</form></section>;
}
