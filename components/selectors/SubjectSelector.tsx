'use client';

import React from 'react';
import { useCatalogueSelection } from '../../lib/state/catalogueSelection';
import { useCatalogueOptions } from '../../lib/hooks/useCatalogueOptions';
import { getSubjects } from '../../lib/firestore/catalogue';

export function SubjectSelector() {
  const { boardId, classId, subjectId, setSubject } = useCatalogueSelection();
  
  const fetchKey = boardId && classId ? `subjects-${boardId}-${classId}` : null;
  const { data: subjects, loading, error, retry } = useCatalogueOptions(
    fetchKey, 
    () => getSubjects(boardId!, classId!)
  );

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="subject-select" className="text-sm font-medium text-red-600">Failed to load subjects</label>
        <button onClick={retry} className="px-4 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">Retry</button>
      </div>
    );
  }

  const disabled = !classId || loading;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="subject-select" className="text-sm font-medium text-gray-700">Subject</label>
      <select
        id="subject-select"
        value={subjectId || ''}
        onChange={(e) => setSubject(e.target.value || null)}
        disabled={disabled}
        aria-busy={loading}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:bg-gray-100 p-2 border"
      >
        <option value="">
          {!classId ? 'Select a Class first' : loading ? 'Loading subjects...' : 'Select a Subject'}
        </option>
        {subjects?.map((sub) => (
          <option key={sub.slug} value={sub.slug}>
            {sub.name}
          </option>
        ))}
      </select>
    </div>
  );
}
