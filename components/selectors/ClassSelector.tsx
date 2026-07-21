'use client';

import React from 'react';
import { useCatalogueSelection } from '../../lib/state/catalogueSelection';
import { useCatalogueOptions } from '../../lib/hooks/useCatalogueOptions';
import { getClasses } from '../../lib/firestore/catalogue';

export function ClassSelector() {
  const { boardId, classId, setClass } = useCatalogueSelection();
  
  const fetchKey = boardId ? `classes-${boardId}` : null;
  const { data: classes, loading, error, retry } = useCatalogueOptions(
    fetchKey, 
    () => getClasses(boardId!)
  );

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="class-select" className="text-sm font-medium text-red-600">Failed to load classes</label>
        <button onClick={retry} className="px-4 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">Retry</button>
      </div>
    );
  }

  const disabled = !boardId || loading;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="class-select" className="text-sm font-medium text-gray-700">Class</label>
      <select
        id="class-select"
        value={classId || ''}
        onChange={(e) => setClass(e.target.value || null)}
        disabled={disabled}
        aria-busy={loading}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:bg-gray-100 p-2 border"
      >
        <option value="">
          {!boardId ? 'Select a Board first' : loading ? 'Loading classes...' : 'Select a Class'}
        </option>
        {classes?.map((cls) => (
          <option key={cls.slug} value={cls.slug}>
            {cls.name}
          </option>
        ))}
      </select>
    </div>
  );
}
