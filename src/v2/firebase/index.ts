export { isFirebaseConfigured, getFirebaseApp, getFirebaseAuth, getFirebaseDb } from './app';
export { readFirebaseConfig, readFishSponsorKey, isInsecureRemoteOrigin } from './config';
export {
  subscribeAuth,
  waitForAuthReady,
  signInWithGoogle,
  signOutUser,
  ensureUserProfile,
  ensureAnonymousSession,
  completeGoogleRedirectIfPresent,
  consumeAuthError,
} from './auth';
export { trackEvent, reportError, installGlobalErrorReporting } from './analytics';
export {
  fetchFirebaseBootstrap,
  putFirebasePreferences,
  putFirebaseLibrary,
  putFirebaseActiveDocumentId,
  putFirebaseSecrets,
  readFirebaseSecrets,
  uploadProcessedPages,
  fetchProcessedPages,
  deleteFirebaseDocument,
} from './sync';
