import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setDoc, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - Resources', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-taleem-test-resources',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  }, 30000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const getUnauthedDb = () => testEnv.unauthenticatedContext().firestore();
  const getAuthedDb = () => testEnv.authenticatedContext('user1').firestore();

  it('allows reading published resource with fully active hierarchy', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1/subjects/subject1'), { active: true });
      await setDoc(doc(db, 'resources/res1'), {
        status: 'published',
        boardId: 'board1',
        classId: 'class1',
        subjectId: 'subject1',
        chapterId: null,
      });
    });

    const db = getUnauthedDb();
    await assertSucceeds(getDoc(doc(db, 'resources/res1')));
  });

  it('denies reading published resource with inactive board', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: false });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1/subjects/subject1'), { active: true });
      await setDoc(doc(db, 'resources/res1'), {
        status: 'published',
        boardId: 'board1',
        classId: 'class1',
        subjectId: 'subject1',
        chapterId: null,
      });
    });

    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'resources/res1')));
  });

  it('denies reading draft resource', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1/subjects/subject1'), { active: true });
      await setDoc(doc(db, 'resources/res1'), {
        status: 'draft',
        boardId: 'board1',
        classId: 'class1',
        subjectId: 'subject1',
        chapterId: null,
      });
    });

    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'resources/res1')));
  });

  it('denies reading version document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1/subjects/subject1'), { active: true });
      await setDoc(doc(db, 'resources/res1'), {
        status: 'published',
        boardId: 'board1',
        classId: 'class1',
        subjectId: 'subject1',
      });
      await setDoc(doc(db, 'resources/res1/versions/ver1'), { some: 'data' });
    });

    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'resources/res1/versions/ver1')));
  });

  it('denies all public writes to resources', async () => {
    const db = getUnauthedDb();
    await assertFails(setDoc(doc(db, 'resources/res1'), { status: 'draft' }));
  });
  
  it('denies writes by authenticated clients', async () => {
    const db = getAuthedDb();
    await assertFails(setDoc(doc(db, 'resources/res1'), { status: 'draft' }));
  });

  it('allows published query and denies unconstrained query', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/b1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1/subjects/s1'), { active: true });
      await setDoc(doc(db, 'resources/res1_pub'), {
        status: 'published',
        boardId: 'b1',
        classId: 'c1',
        subjectId: 's1',
        chapterId: null,
      });
    });

    const db = getUnauthedDb();
    const q1 = query(
      collection(db, 'resources'), 
      where('status', '==', 'published'),
      where('boardId', '==', 'b1'),
      where('classId', '==', 'c1'),
      where('subjectId', '==', 's1'),
      where('chapterId', '==', null)
    );
    await assertSucceeds(getDocs(q1));

    const q2 = query(collection(db, 'resources'));
    await assertFails(getDocs(q2));
  });

  it('denies access to admin_audit_logs', async () => {
    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'admin_audit_logs/log1')));
  });

  it('denies reading a published resource if its parent class becomes inactive', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Setup active hierarchy initially
      await setDoc(doc(db, 'boards/board1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: true });
      await setDoc(doc(db, 'boards/board1/classes/class1/subjects/subject1'), { active: true });
      
      // Publish resource
      await setDoc(doc(db, 'resources/res_parent_disabled'), {
        status: 'published',
        boardId: 'board1',
        classId: 'class1',
        subjectId: 'subject1',
        chapterId: null,
      });
    });

    const db = getUnauthedDb();
    // Verify it's readable
    await assertSucceeds(getDoc(doc(db, 'resources/res_parent_disabled')));

    // Now disable the parent class
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/board1/classes/class1'), { active: false });
    });

    // Verify it's no longer readable
    await assertFails(getDoc(doc(db, 'resources/res_parent_disabled')));
  });
  it('denies reading a published resource with mismatched hierarchy', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/b1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1/subjects/s1'), { active: true });
      // Here, resource has c2 instead of c1, so boards/b1/classes/c2 will not exist
      await setDoc(doc(db, 'resources/res_mismatch'), {
        status: 'published',
        boardId: 'b1',
        classId: 'c2',
        subjectId: 's1',
        chapterId: null,
      });
    });

    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'resources/res_mismatch')));
  });

  it('denies reading hidden resource', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/b1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1/subjects/s1'), { active: true });
      await setDoc(doc(db, 'resources/res_hidden'), {
        status: 'hidden',
        boardId: 'b1',
        classId: 'c1',
        subjectId: 's1',
      });
    });

    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'resources/res_hidden')));
  });

  it('denies reading archived resource', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'boards/b1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1'), { active: true });
      await setDoc(doc(db, 'boards/b1/classes/c1/subjects/s1'), { active: true });
      await setDoc(doc(db, 'resources/res_archived'), {
        status: 'archived',
        boardId: 'b1',
        classId: 'c1',
        subjectId: 's1',
      });
    });

    const db = getUnauthedDb();
    await assertFails(getDoc(doc(db, 'resources/res_archived')));
  });

  it('denies writes by authenticated student client', async () => {
    const db = testEnv.authenticatedContext('student1', { role: 'student' }).firestore();
    await assertFails(setDoc(doc(db, 'resources/res1'), { status: 'draft' }));
  });

  it('denies writes by authenticated admin client', async () => {
    const db = testEnv.authenticatedContext('admin1', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(db, 'resources/res1'), { status: 'draft' }));
  });

  it('denies writing to admin_audit_logs', async () => {
    const db = getUnauthedDb();
    await assertFails(setDoc(doc(db, 'admin_audit_logs/log1'), { action: 'test' }));
  });

  it('denies version document write', async () => {
    const db = getUnauthedDb();
    await assertFails(setDoc(doc(db, 'resources/res1/versions/v1'), { storageKey: 'test' }));
  });
});
