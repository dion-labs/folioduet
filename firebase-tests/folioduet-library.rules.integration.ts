import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let env: RulesTestEnvironment;
const paths = ['pageecho/alice', 'pageecho/alice/secrets/keys', 'pageecho/alice/library/book', 'pageecho/alice/library/book/pages/000000'];
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-folioduet-isolation', firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  } });
});
beforeEach(async () => { await env.clearFirestore(); });
afterAll(async () => { await env.cleanup(); });

describe('FolioDuet library, progress and secret isolation', () => {
  it('allows owner operations on profile, keys, library and processed pages', async () => {
    const db = env.authenticatedContext('alice').firestore();
    for (const path of paths) {
      const ref = doc(db, path);
      await assertSucceeds(setDoc(ref, { fixture: 'synthetic', progress: 0 }));
      await assertSucceeds(updateDoc(ref, { progress: 4 }));
      expect((await assertSucceeds(getDoc(ref))).data()?.progress).toBe(4);
      await assertSucceeds(deleteDoc(ref));
    }
  });

  it('denies another user and signed-out clients every owner operation', async () => {
    const owner = env.authenticatedContext('alice').firestore();
    for (const path of paths) await setDoc(doc(owner, path), { fixture: 'private synthetic' });
    for (const db of [env.authenticatedContext('bob').firestore(), env.unauthenticatedContext().firestore()]) {
      for (const path of paths) {
        const ref = doc(db, path);
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { fixture: 'replacement' }));
        await assertFails(deleteDoc(ref));
      }
      await assertFails(getDocs(collection(db, 'pageecho/alice/library')));
    }
  });

  it('isolates anonymous users without denying their own processed text', async () => {
    const guest = env.authenticatedContext('guest-a', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    const other = env.authenticatedContext('guest-b', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertSucceeds(setDoc(doc(guest, 'pageecho/guest-a/library/book/pages/000000'), { markdown: 'Invented text.' }));
    await assertFails(getDoc(doc(other, 'pageecho/guest-a/library/book/pages/000000')));
  });

  it('syncs processed text and progress between independent same-owner clients', async () => {
    const a = env.authenticatedContext('alice').firestore();
    const b = env.authenticatedContext('alice').firestore();
    const page = 'pageecho/alice/library/book/pages/000000';
    await setDoc(doc(a, page), { markdown: 'Independent client sentinel.' });
    expect((await getDoc(doc(b, page))).data()?.markdown).toBe('Independent client sentinel.');
    await setDoc(doc(b, 'pageecho/alice/library/book'), { activeStreamIndex: 12 });
    expect((await getDoc(doc(a, 'pageecho/alice/library/book'))).data()?.activeStreamIndex).toBe(12);
  });

  it('keeps unrelated books intact when an owner deletes a disposable book', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await setDoc(doc(db, 'pageecho/alice/library/keep'), { marker: 'retain' });
    await setDoc(doc(db, 'pageecho/alice/library/delete'), { marker: 'delete' });
    await deleteDoc(doc(db, 'pageecho/alice/library/delete'));
    expect((await getDocs(collection(db, 'pageecho/alice/library'))).docs.map((d) => d.id)).toEqual(['keep']);
  });
});
