import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ensureAnonymousSession } from './auth';
import { getFirebaseDb, isFirebaseConfigured } from './app';

export const FEEDBACK_CATEGORIES = [
  'getting_started',
  'voice_quality',
  'reading_experience',
  'missing_feature',
  'something_broke',
  'other',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackSurface = 'home' | 'reader';
export type FeedbackDocumentKind = 'none' | 'pdf' | 'markdown-zip';
export type FeedbackVoiceMode = 'fish' | 'inworld' | 'system';

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  surface: FeedbackSurface;
  documentKind: FeedbackDocumentKind;
  isSample: boolean;
  voiceMode: FeedbackVoiceMode;
}

export const MAX_FEEDBACK_MESSAGE_LENGTH = 2000;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function normalizeFeedbackInput(input: FeedbackInput): FeedbackInput {
  if (!FEEDBACK_CATEGORIES.includes(input.category)) {
    throw new Error('Choose the option that best matches your feedback.');
  }

  return {
    ...input,
    message: input.message
      .replace(CONTROL_CHARACTERS, '')
      .trim()
      .slice(0, MAX_FEEDBACK_MESSAGE_LENGTH),
  };
}

/**
 * Store product feedback without requiring a Google account. Firebase still
 * creates/restores the private anonymous session used elsewhere in FolioDuet,
 * allowing Firestore rules to reject completely unauthenticated spam writes.
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error('Feedback is temporarily unavailable. Please try again later.');
  }

  const user = await ensureAnonymousSession();
  if (!user) {
    throw new Error('Could not connect a private guest session. Please try again.');
  }

  const normalized = normalizeFeedbackInput(input);
  await addDoc(collection(getFirebaseDb(), 'folioduet_feedback'), {
    schemaVersion: 1,
    ...normalized,
    createdAt: serverTimestamp(),
  });
}
