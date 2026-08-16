"use client";

import type { Chapter } from "@/lib/firestore/types";

export function MultiChapterSelector({ chapters, selectedIds, onChange, disabled = false }: {
  chapters: Chapter[] | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(selectedIds);
  const toggle = (id: string) => onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  if (!chapters) return <p className="text-sm text-slate-500">Select a subject to load its chapters.</p>;
  if (!chapters.length) return <p className="text-sm text-slate-500">No active chapters are available for this subject.</p>;
  return (
    <fieldset disabled={disabled} className="rounded-lg border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">Chapters</legend>
      <div className="mb-3 flex gap-3 text-sm">
        <button type="button" onClick={() => onChange(chapters.map((chapter) => chapter.slug))} className="font-semibold text-blue-700 hover:underline">Select all</button>
        <button type="button" onClick={() => onChange([])} className="font-semibold text-slate-600 hover:underline">Clear all</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {chapters.map((chapter) => (
          <label key={chapter.slug} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(chapter.slug)} onChange={() => toggle(chapter.slug)} />
            <span>{chapter.chapter_number}. {chapter.title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
