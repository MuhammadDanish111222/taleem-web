"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  getBoards,
  getChapters,
  getClasses,
  getExaminationBoards,
  getSubjects,
} from "@/lib/firestore/catalogue";
import { useCatalogueOptions } from "@/lib/hooks/useCatalogueOptions";
import {
  AdminResourceDto,
  AdminResourceVersionDto,
  ResourceType,
} from "@/lib/resources/types";

const inputClass =
  "w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50";
const MAX_PDF_MIB = 150;
const MAX_PDF_BYTES = MAX_PDF_MIB * 1024 * 1024;

async function responseBody(response: Response): Promise<{ error?: string; [key: string]: unknown }> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { error?: string; [key: string]: unknown };
  } catch {
    return {};
  }
}

async function csrf(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to obtain security token");
  return (await response.json()).csrfToken;
}

export default function ContentAdminClient() {
  const [resources, setResources] = useState<AdminResourceDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, AdminResourceVersionDto[]>>({});

  const [type, setType] = useState<ResourceType>("book");
  const [title, setTitle] = useState("");
  const [boardId, setBoardId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [examinationBoardId, setExaminationBoardId] = useState("");
  const [paperYear, setPaperYear] = useState(String(new Date().getFullYear()));
  const [paperSession, setPaperSession] = useState("annual");
  const [paperType, setPaperType] = useState("subjective");
  const [language, setLanguage] = useState("en");
  const [curriculumVersion, setCurriculumVersion] = useState(String(new Date().getFullYear()));
  const [displayOrder, setDisplayOrder] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [replacement, setReplacement] = useState<AdminResourceDto | null>(null);

  const boards = useCatalogueOptions("admin-content-boards", getBoards);
  const classes = useCatalogueOptions(
    boardId ? `admin-content-classes:${boardId}` : null,
    () => getClasses(boardId),
  );
  const subjects = useCatalogueOptions(
    boardId && classId ? `admin-content-subjects:${boardId}:${classId}` : null,
    () => getSubjects(boardId, classId),
  );
  const chapters = useCatalogueOptions(
    boardId && classId && subjectId
      ? `admin-content-chapters:${boardId}:${classId}:${subjectId}`
      : null,
    () => getChapters(boardId, classId, subjectId),
  );
  const examinationBoards = useCatalogueOptions(
    boardId ? `admin-content-examination-boards:${boardId}` : null,
    () => getExaminationBoards(boardId),
  );

  const loadResources = useCallback(async (cursor?: string) => {
    cursor ? setBusyId("load-more") : setListLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/content${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load content");
      setResources((current) => (cursor ? [...current, ...body.resources] : body.resources));
      setNextCursor(body.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load content");
    } finally {
      setListLoading(false);
      setBusyId(null);
    }
  }, []);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  const activeFormResource = replacement;
  const effective = useMemo(
    () =>
      activeFormResource
        ? {
            type: activeFormResource.type,
            title: activeFormResource.title,
            boardId: activeFormResource.boardId,
            classId: activeFormResource.classId,
            subjectId: activeFormResource.subjectId,
            chapterId: activeFormResource.chapterId ?? "",
            examinationBoardId: activeFormResource.examinationBoardId ?? "",
            paperYear: activeFormResource.paperYear?.toString() ?? "",
            paperSession: activeFormResource.paperSession ?? "",
            paperType: activeFormResource.paperType ?? "",
            language: activeFormResource.language,
            curriculumVersion: activeFormResource.curriculumVersion,
            displayOrder: activeFormResource.displayOrder.toString(),
          }
        : {
            type,
            title,
            boardId,
            classId,
            subjectId,
            chapterId,
            examinationBoardId,
            paperYear,
            paperSession,
            paperType,
            language,
            curriculumVersion,
            displayOrder,
          },
    [
      activeFormResource,
      boardId,
      chapterId,
      classId,
      curriculumVersion,
      displayOrder,
      examinationBoardId,
      language,
      paperSession,
      paperType,
      paperYear,
      subjectId,
      title,
      type,
    ],
  );

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!file) {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(
        `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. The maximum PDF size is ${MAX_PDF_MIB} MB.`,
      );
      return;
    }
    if (!effective.boardId || !effective.classId || !effective.subjectId) {
      setError("Select a board, class and subject.");
      return;
    }
    if (effective.type === "past_paper" && !effective.examinationBoardId) {
      setError("Select an examination board for the past paper.");
      return;
    }

    setBusyId("upload");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("operation", replacement ? "replace_version" : "create_resource");
      if (replacement) form.set("resourceId", replacement.id);
      form.set("type", effective.type);
      form.set("title", effective.title);
      form.set("boardId", effective.boardId);
      form.set("classId", effective.classId);
      form.set("subjectId", effective.subjectId);
      if (effective.chapterId) form.set("chapterId", effective.chapterId);
      if (effective.type === "past_paper") {
        form.set("examinationBoardId", effective.examinationBoardId);
        form.set("paperYear", effective.paperYear);
        form.set("paperSession", effective.paperSession);
        form.set("paperType", effective.paperType);
      }
      form.set("language", effective.language);
      form.set("curriculumVersion", effective.curriculumVersion);
      form.set("displayOrder", effective.displayOrder);

      const token = await csrf();
      const response = await fetch("/api/admin/content/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-CSRF-Token": token,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: form,
      });
      const body = await responseBody(response);
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error(`The PDF is too large. The maximum PDF size is ${MAX_PDF_MIB} MB.`);
        }
        throw new Error(body.error || `Upload failed (HTTP ${response.status})`);
      }
      setSuccess(
        replacement
          ? `New version uploaded for “${replacement.title}”.`
          : "Upload complete. The PDF is a DRAFT and is not visible to students yet. Click Publish in Uploaded content below.",
      );
      setFile(null);
      setReplacement(null);
      await loadResources();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  const mutate = async (
    resource: AdminResourceDto,
    action: "publish" | "hide" | "archive" | "restore",
  ) => {
    setBusyId(resource.id);
    setError(null);
    setSuccess(null);
    try {
      const token = await csrf();
      const response = await fetch(`/api/admin/content/${resource.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Content update failed");
      setSuccess(`“${resource.title}” is now ${body.resource.status}.`);
      await loadResources();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Content update failed");
    } finally {
      setBusyId(null);
    }
  };

  const toggleVersions = async (resourceId: string) => {
    if (versions[resourceId]) {
      setVersions((current) => {
        const next = { ...current };
        delete next[resourceId];
        return next;
      });
      return;
    }
    setBusyId(`versions:${resourceId}`);
    try {
      const response = await fetch(`/api/admin/content/${resourceId}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load versions");
      setVersions((current) => ({ ...current, [resourceId]: body.versions }));
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Unable to load versions");
    } finally {
      setBusyId(null);
    }
  };

  const selectClass = (value: string) => {
    setClassId(value);
    setSubjectId("");
    setChapterId("");
  };
  const selectBoard = (value: string) => {
    setBoardId(value);
    setClassId("");
    setSubjectId("");
    setChapterId("");
    setExaminationBoardId("");
  };
  const selectSubject = (value: string) => {
    setSubjectId(value);
    setChapterId("");
  };

  return (
    <div className="p-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-white">Content Management</h1>
          <p className="mt-2 text-slate-400">
            Upload private PDFs, review drafts, publish for students, or safely hide and archive content.
          </p>
        </header>

        {error && <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-200">{error}</div>}
        {success && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-200">{success}</div>}

        <form onSubmit={upload} className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">
                {replacement ? "Upload replacement version" : "Upload new content"}
              </h2>
              {replacement && (
                <p className="mt-1 text-sm text-slate-400">
                  Replacing “{replacement.title}”. Its existing version remains in history.
                </p>
              )}
            </div>
            {replacement && (
              <button type="button" onClick={() => setReplacement(null)} className="text-sm text-blue-300 hover:text-blue-200">
                Cancel replacement
              </button>
            )}
          </div>

          {!replacement && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span>Content type</span>
                <select value={type} onChange={(event) => setType(event.target.value as ResourceType)} className={inputClass}>
                  <option value="book">Book</option>
                  <option value="note">Note</option>
                  <option value="past_paper">Past paper</option>
                </select>
              </label>
              <label className="space-y-1 text-sm xl:col-span-2">
                <span>Title</span>
                <input required value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} placeholder="e.g. Chemistry Chapter 1 Notes" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Display order</span>
                <input required type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} className={inputClass} />
              </label>

              <label className="space-y-1 text-sm">
                <span>Board</span>
                <select required value={boardId} onChange={(event) => selectBoard(event.target.value)} className={inputClass}>
                  <option value="">Select board</option>
                  {boards.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Class</span>
                <select required value={classId} onChange={(event) => selectClass(event.target.value)} disabled={!boardId || classes.loading} className={inputClass}>
                  <option value="">Select class</option>
                  {classes.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Subject</span>
                <select required value={subjectId} onChange={(event) => selectSubject(event.target.value)} disabled={!classId || subjects.loading} className={inputClass}>
                  <option value="">Select subject</option>
                  {subjects.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Chapter (optional)</span>
                <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} disabled={!subjectId || chapters.loading} className={inputClass}>
                  <option value="">Whole subject / all chapters</option>
                  {chapters.data?.map((item) => <option key={item.slug} value={item.slug}>{item.chapter_number}. {item.title}</option>)}
                </select>
              </label>

              {type === "past_paper" && (
                <>
                  <label className="space-y-1 text-sm">
                    <span>Examination board</span>
                    <select required value={examinationBoardId} onChange={(event) => setExaminationBoardId(event.target.value)} disabled={!boardId || examinationBoards.loading} className={inputClass}>
                      <option value="">Select examination board</option>
                      {examinationBoards.data?.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Paper year</span>
                    <input required type="number" min="1900" max="2100" value={paperYear} onChange={(event) => setPaperYear(event.target.value)} className={inputClass} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Session</span>
                    <select value={paperSession} onChange={(event) => setPaperSession(event.target.value)} className={inputClass}>
                      <option value="annual">Annual</option>
                      <option value="supplementary">Supplementary</option>
                      <option value="model">Model paper</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Paper type</span>
                    <select value={paperType} onChange={(event) => setPaperType(event.target.value)} className={inputClass}>
                      <option value="subjective">Subjective</option>
                      <option value="objective">Objective</option>
                      <option value="combined">Combined</option>
                    </select>
                  </label>
                </>
              )}

              <label className="space-y-1 text-sm">
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)} className={inputClass}>
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Curriculum version</span>
                <input required value={curriculumVersion} onChange={(event) => setCurriculumVersion(event.target.value)} className={inputClass} placeholder="e.g. 2026" />
              </label>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="min-w-72 flex-1 space-y-1 text-sm">
              <span>PDF file</span>
              <input
                required
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className={`${inputClass} file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-white`}
              />
              <span className="block text-xs text-slate-400">
                Maximum 150 MB.
                {file ? ` Selected: ${(file.size / 1024 / 1024).toFixed(1)} MB.` : ""}
              </span>
            </label>
            <button disabled={busyId === "upload"} className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
              {busyId === "upload" ? "Uploading and validating…" : replacement ? "Upload new version" : "Upload draft"}
            </button>
          </div>
        </form>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Uploaded content</h2>
            <button onClick={() => void loadResources()} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">Refresh</button>
          </div>

          {listLoading ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-10 text-center text-slate-400">Loading content…</div>
          ) : resources.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-10 text-center text-slate-400">No content has been uploaded yet.</div>
          ) : (
            resources.map((resource) => (
              <article key={resource.id} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-800 px-2 py-1 text-xs uppercase text-slate-300">{resource.type.replace("_", " ")}</span>
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${resource.status === "published" ? "bg-emerald-950 text-emerald-300" : resource.status === "archived" ? "bg-red-950 text-red-300" : "bg-amber-950 text-amber-300"}`}>{resource.status}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-white">{resource.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {resource.boardId} / {resource.classId} / {resource.subjectId}
                      {resource.chapterId ? ` / ${resource.chapterId}` : " / whole subject"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {resource.status === "draft" || resource.status === "hidden" ? (
                      <button disabled={busyId === resource.id} onClick={() => void mutate(resource, "publish")} className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-60">Publish</button>
                    ) : null}
                    {resource.status === "published" && (
                      <>
                        <a href={`/content/${resource.id}`} target="_blank" className="rounded bg-blue-700 px-3 py-2 text-sm font-medium hover:bg-blue-600">Open</a>
                        <button disabled={busyId === resource.id} onClick={() => void mutate(resource, "hide")} className="rounded bg-amber-800 px-3 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-60">Hide</button>
                      </>
                    )}
                    {(resource.status === "draft" || resource.status === "hidden") && (
                      <button onClick={() => { setReplacement(resource); setFile(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600">New version</button>
                    )}
                    {resource.status !== "archived" && resource.status !== "published" && (
                      <button disabled={busyId === resource.id} onClick={() => void mutate(resource, "archive")} className="rounded bg-red-950 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-900 disabled:opacity-60">Archive</button>
                    )}
                    {resource.status === "archived" && (
                      <button disabled={busyId === resource.id} onClick={() => void mutate(resource, "restore")} className="rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-60">Restore draft</button>
                    )}
                    <button onClick={() => void toggleVersions(resource.id)} className="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">
                      {versions[resource.id] ? "Hide versions" : "Versions"}
                    </button>
                  </div>
                </div>
                {versions[resource.id] && (
                  <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                    {versions[resource.id].map((version) => (
                      <div key={version.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
                        <span>{version.originalFilename} · {version.pageCount} pages · {(version.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                        <span>{new Date(version.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
          {nextCursor && (
            <button disabled={busyId === "load-more"} onClick={() => void loadResources(nextCursor)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60">
              {busyId === "load-more" ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
