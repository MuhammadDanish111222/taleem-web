import { create } from 'zustand';

interface CatalogueSelectionState {
  boardId: string | null;
  classId: string | null;
  subjectId: string | null;
  chapterId: string | null;
  
  setBoard: (id: string | null) => void;
  setClass: (id: string | null) => void;
  setSubject: (id: string | null) => void;
  setChapter: (id: string | null) => void;
  resetAll: () => void;
}

export const useCatalogueSelection = create<CatalogueSelectionState>((set) => ({
  boardId: null,
  classId: null,
  subjectId: null,
  chapterId: null,

  setBoard: (id) => set({ 
    boardId: id, 
    classId: null, 
    subjectId: null, 
    chapterId: null 
  }),
  setClass: (id) => set({ 
    classId: id, 
    subjectId: null, 
    chapterId: null 
  }),
  setSubject: (id) => set({ 
    subjectId: id, 
    chapterId: null 
  }),
  setChapter: (id) => set({ 
    chapterId: id 
  }),
  resetAll: () => set({ 
    boardId: null, 
    classId: null, 
    subjectId: null, 
    chapterId: null 
  }),
}));
