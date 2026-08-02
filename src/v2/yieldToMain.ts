/** Yield the main thread so input / React updates can run between heavy work. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 24 });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}
