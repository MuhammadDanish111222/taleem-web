import { collection, query, where, orderBy, getDocs, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { Board, ClassDoc, Subject, Chapter } from './types';

export async function getBoards(): Promise<Board[]> {
  const boardsRef = collection(db, 'boards');
  const q = query(boardsRef, where('active', '==', true), orderBy('display_order', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data() as Board);
}

export async function getClasses(boardId: string): Promise<ClassDoc[]> {
  const classesRef = collection(db, `boards/${boardId}/classes`);
  const q = query(classesRef, where('active', '==', true), orderBy('display_order', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data() as ClassDoc);
}

export async function getSubjects(boardId: string, classId: string): Promise<Subject[]> {
  const subjectsRef = collection(db, `boards/${boardId}/classes/${classId}/subjects`);
  const q = query(subjectsRef, where('active', '==', true), orderBy('display_order', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data() as Subject);
}

export async function getChapters(boardId: string, classId: string, subjectId: string): Promise<Chapter[]> {
  const chaptersRef = collection(db, `boards/${boardId}/classes/${classId}/subjects/${subjectId}/chapters`);
  const q = query(chaptersRef, where('active', '==', true), orderBy('display_order', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data() as Chapter);
}
