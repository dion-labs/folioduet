/**
 * PageEcho Firestore namespace inside shared project `dionlabs-fe92e`.
 *
 * Same Firebase project as the Dion Labs blog/landing — separate *codebase*.
 * Blog still owns root collections (`blog_stats`, `feature_stats`, `leads`).
 * PageEcho owns everything under this top-level collection:
 *
 *   pageecho/{uid}
 *     secrets/keys
 *     library/{documentId}
 *       pages/{pageKey}
 */
export const PAGEECHO_ROOT = 'pageecho';

export function pageechoUserPath(uid: string): [string, string] {
  return [PAGEECHO_ROOT, uid];
}

export function pageechoSecretsPath(uid: string): [string, string, string, string] {
  return [PAGEECHO_ROOT, uid, 'secrets', 'keys'];
}

export function pageechoLibraryPath(uid: string): [string, string, string] {
  return [PAGEECHO_ROOT, uid, 'library'];
}

export function pageechoDocumentPath(
  uid: string,
  documentId: string,
): [string, string, string, string] {
  return [PAGEECHO_ROOT, uid, 'library', documentId];
}

export function pageechoPagesPath(
  uid: string,
  documentId: string,
): [string, string, string, string, string] {
  return [PAGEECHO_ROOT, uid, 'library', documentId, 'pages'];
}

/** Shared, user-independent catalog (samples + baked audio). */
export function pageechoCatalogSamplePath(sampleId: string): [string, string, string, string] {
  return [PAGEECHO_ROOT, 'catalog', 'samples', sampleId];
}

export function pageechoCatalogPagesPath(sampleId: string): [string, string, string, string, string] {
  return [PAGEECHO_ROOT, 'catalog', 'samples', sampleId, 'pages'];
}

export function pageechoCatalogAudioPath(sampleId: string): [string, string, string, string, string] {
  return [PAGEECHO_ROOT, 'catalog', 'samples', sampleId, 'audio'];
}
