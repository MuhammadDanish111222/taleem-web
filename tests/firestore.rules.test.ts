import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setDoc, doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-taleem-test',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const getUnauthedDb = () => testEnv.unauthenticatedContext().firestore();

  it('allows public reads of site_settings/default', async () => {
    const db = getUnauthedDb();
    await assertSucceeds(getDoc(doc(db, 'site_settings/default')));
  });

  it('denies public writes to site_settings/default', async () => {
    const db = getUnauthedDb();
    await assertFails(setDoc(doc(db, 'site_settings/default'), { any: 'data' }));
  });

  it('allows reading active boards', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'boards/board1'), { active: true });
    });
    const db = getUnauthedDb();
    await assertSucceeds(getDoc(doc(db, 'boards/board1')));
  });

  it('denies reading inactive boards', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'boards/board1'), { active: false });
    });
    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'boards/board1')));
  });

  it('denies reading active class if board is inactive', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: false });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
    });
    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'boards/board1/classes/class1')));
  });

  it('allows reading active class if board is active', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
    });
    const db = getUnauthedDb();
    await assertSucceeds(getDoc(doc(db, 'boards/board1/classes/class1')));
  });

  it('denies all public writes to catalogue', async () => {
    const db = getUnauthedDb();
    await assertFails(setDoc(doc(db, 'boards/board1'), { active: true }));
    await assertFails(setDoc(doc(db, 'boards/board1/classes/class1'), { active: true }));
  });
  
  it('denies writes by authenticated users (clients)', async () => {
    const authDb = testEnv.authenticatedContext('user1').firestore();
    await assertFails(setDoc(doc(authDb, 'boards/board1'), { active: true }));
  });

  it('allows reading active examination boards when parent board is active', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/examinationBoards/lhr'), { active: true, name: 'BISE Lahore' });
    });
    const db = getUnauthedDb();
    await assertSucceeds(getDoc(doc(db, 'boards/board1/examinationBoards/lhr')));
  });

  it('denies reading active examination boards when parent board is inactive', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: false });
      await setDoc(doc(db, 'boards/board1/examinationBoards/lhr'), { active: true, name: 'BISE Lahore' });
    });
    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'boards/board1/examinationBoards/lhr')));
  });

  it('allows reading active chapter node with parentNodeId when board/class/subject are active', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/c1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/c1/subjects/s1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/c1/subjects/s1/chapters/ch1'), { active: true, parentNodeId: 'parent-ch' });
    });
    const db = getUnauthedDb();
    await assertSucceeds(getDoc(doc(db, 'boards/board1/classes/c1/subjects/s1/chapters/ch1')));
  });

  it('allows past_paper collection query matching getSubjectPastPapersGrouped field combination and validates active hierarchy', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/c1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/c1/subjects/s1'), { active: true });
      await setDoc(doc(db, 'resources/pp1'), {
        status: 'published',
        boardId: 'board1',
        classId: 'c1',
        subjectId: 's1',
        type: 'past_paper',
        displayOrder: 1,
        title: 'Past Paper 1',
      });
    });

    const db = getUnauthedDb();
    const q = query(
      collection(db, 'resources'),
      where('status', '==', 'published'),
      where('boardId', '==', 'board1'),
      where('classId', '==', 'c1'),
      where('subjectId', '==', 's1'),
      where('type', '==', 'past_paper'),
      orderBy('displayOrder', 'asc')
    );

    await assertSucceeds(getDocs(q));

    // Assert unauthenticated client cannot read resource if parent board becomes inactive
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'boards/board1'), { active: false });
    });

    await assertFails(getDoc(doc(db, 'resources/pp1')));
  });
});


