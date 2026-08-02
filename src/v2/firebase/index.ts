export { isFirebaseConfigured, getFirebaseApp, getFirebaseAuth, getFirebaseDb } from './app';
export { readFirebaseConfig, readFishSponsorKey, isInsecureRemoteOrigin } from './config';
export {
  subscribeAuth,
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
  putFirebaseSecrets,
  readFirebaseSecrets,
  uploadProcessedPages,
  fetchProcessedPages,
  deleteFirebaseDocument,
} from './sync';
