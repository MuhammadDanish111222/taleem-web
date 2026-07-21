'use client';

import React from 'react';
import { useCatalogueSelection } from '../../lib/state/catalogueSelection';
import { useCatalogueOptions } from '../../lib/hooks/useCatalogueOptions';
import { getChapters } from '../../lib/firestore/catalogue';

export function ChapterSelector() {
  const { boardId, classId, subjectId, chapterId, setChapter } = useCatalogueSelection();
  
  const fetchKey = boardId && classId && subjectId ? `chapters-${boardId}-${classId}-${subjectId}` : null;
  const { data: chapters, loading, error, retry } = useCatalogueOptions(
    fetchKey, 
    () => getChapters(boardId!, classId!, subjectId!)
  );

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="chapter-select" className="text-sm font-medium text-red-600">Failed to load chapters</label>
        <button onClick={retry} className="px-4 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">Retry</button>
      </div>
    );
  }

  const disabled = !subjectId || loading;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="chapter-select" className="text-sm font-medium text-gray-700">Chapter</label>
      <select
        id="chapter-select"
        value={chapterId || ''}
        onChange={(e) => setChapter(e.target.value || null)}
        disabled={disabled}
        aria-busy={loading}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:bg-gray-100 p-2 border"
      >
        <option value="">
          {!subjectId ? 'Select a Subject first' : loading ? 'Loading chapters...' : 'All Chapters'}
        </option>
        {chapters?.map((ch) => (
          <option key={ch.slug} value={ch.slug}>
            {ch.title}
          </option>
        ))}
      </select>
    </div>
  );
}
