import { describe, it, expect, beforeEach } from 'vitest';
import { useCatalogueSelection } from './catalogueSelection';

describe('useCatalogueSelection', () => {
  beforeEach(() => {
    // Reset state before each test
    useCatalogueSelection.getState().resetAll();
  });

  it('cascades board change: clears class, subject, chapter', () => {
    const store = useCatalogueSelection.getState();
    store.setBoard('board-1');
    store.setClass('class-1');
    store.setSubject('subject-1');
    store.setChapter('chapter-1');

    useCatalogueSelection.getState().setBoard('board-2');
    
    const updated = useCatalogueSelection.getState();
    expect(updated.boardId).toBe('board-2');
    expect(updated.classId).toBeNull();
    expect(updated.subjectId).toBeNull();
    expect(updated.chapterId).toBeNull();
  });

  it('cascades class change: clears subject, chapter', () => {
    const store = useCatalogueSelection.getState();
    store.setBoard('board-1');
    store.setClass('class-1');
    store.setSubject('subject-1');
    store.setChapter('chapter-1');

    useCatalogueSelection.getState().setClass('class-2');
    
    const updated = useCatalogueSelection.getState();
    expect(updated.boardId).toBe('board-1');
    expect(updated.classId).toBe('class-2');
    expect(updated.subjectId).toBeNull();
    expect(updated.chapterId).toBeNull();
  });

  it('cascades subject change: clears chapter', () => {
    const store = useCatalogueSelection.getState();
    store.setBoard('board-1');
    store.setClass('class-1');
    store.setSubject('subject-1');
    store.setChapter('chapter-1');

    useCatalogueSelection.getState().setSubject('subject-2');
    
    const updated = useCatalogueSelection.getState();
    expect(updated.boardId).toBe('board-1');
    expect(updated.classId).toBe('class-1');
    expect(updated.subjectId).toBe('subject-2');
    expect(updated.chapterId).toBeNull();
  });

  it('chapter change only affects chapter', () => {
    const store = useCatalogueSelection.getState();
    store.setBoard('board-1');
    store.setClass('class-1');
    store.setSubject('subject-1');
    store.setChapter('chapter-1');

    useCatalogueSelection.getState().setChapter('chapter-2');
    
    const updated = useCatalogueSelection.getState();
    expect(updated.boardId).toBe('board-1');
    expect(updated.classId).toBe('class-1');
    expect(updated.subjectId).toBe('subject-1');
    expect(updated.chapterId).toBe('chapter-2');
  });
});
