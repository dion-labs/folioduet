import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const projectId = 'demo-dionlabs-folioduet-feedback';
let environment: RulesTestEnvironment;

function feedbackData(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    category: 'voice_quality',
    message: 'The narrator switched to a system voice.',
    surface: 'reader',
    documentKind: 'markdown-zip',
    isSample: true,
    voiceMode: 'fish',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

describe('shared Dion Labs Firestore rules: FolioDuet feedback', () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('allows a guest session to create one bounded feedback record', async () => {
    const guest = environment.authenticatedContext('anonymous-guest', {
      firebase: { sign_in_provider: 'anonymous' },
    }).firestore();

    await assertSucceeds(setDoc(
      doc(guest, 'folioduet_feedback', 'feedback_1'),
      feedbackData(),
    ));
  });

  it('denies unauthenticated submissions and malformed payloads', async () => {
    const publicDb = environment.unauthenticatedContext().firestore();
    const guest = environment.authenticatedContext('anonymous-guest').firestore();

    await assertFails(setDoc(
      doc(publicDb, 'folioduet_feedback', 'feedback_public'),
      feedbackData(),
    ));
    await assertFails(setDoc(
      doc(guest, 'folioduet_feedback', 'feedback_bad_category'),
      feedbackData({ category: 'secret_admin_note' }),
    ));
    await assertFails(setDoc(
      doc(guest, 'folioduet_feedback', 'feedback_too_long'),
      feedbackData({ message: 'x'.repeat(2001) }),
    ));
    await assertFails(setDoc(
      doc(guest, 'folioduet_feedback', 'feedback_extra_field'),
      feedbackData({ email: 'private@example.com' }),
    ));
  });

  it('keeps submitted feedback unreadable and immutable from clients', async () => {
    const guest = environment.authenticatedContext('anonymous-guest').firestore();
    const feedback = doc(guest, 'folioduet_feedback', 'feedback_private');
    await assertSucceeds(setDoc(feedback, feedbackData()));

    await assertFails(getDoc(feedback));
    await assertFails(updateDoc(feedback, { message: 'Changed' }));
    await assertFails(deleteDoc(feedback));
  });
});
