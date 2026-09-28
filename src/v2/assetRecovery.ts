/** Asset failures are recoverable; document conversion failures are not retried. */
export class AssetLoadError extends Error {
  readonly code = 'ASSET_LOAD_FAILED';
}
export function notifyAssetFailure() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('folioduet:asset-failure'));
}
