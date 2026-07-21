'use client';

import React from 'react';
import { useCatalogueSelection } from '../../lib/state/catalogueSelection';
import { useCatalogueOptions } from '../../lib/hooks/useCatalogueOptions';
import { getBoards } from '../../lib/firestore/catalogue';

export function BoardSelector() {
  const { boardId, setBoard } = useCatalogueSelection();
  const { data: boards, loading, error, retry } = useCatalogueOptions('boards', getBoards);

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="board-select" className="text-sm font-medium text-red-600">Failed to load boards</label>
        <button onClick={retry} className="px-4 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="board-select" className="text-sm font-medium text-gray-700">Board</label>
      <select
        id="board-select"
        value={boardId || ''}
        onChange={(e) => setBoard(e.target.value || null)}
        disabled={loading}
        aria-busy={loading}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:bg-gray-100 p-2 border"
      >
        <option value="">{loading ? 'Loading boards...' : 'Select a Board'}</option>
        {boards?.map((board) => (
          <option key={board.slug} value={board.slug}>
            {board.name}
          </option>
        ))}
      </select>
    </div>
  );
}
