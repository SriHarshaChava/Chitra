/**
 * Asks the browser to keep Chitra's local data even when storage is under pressure.
 *
 * Browsers only grant this in some situations (for example after the user has
 * interacted with the site), so it is requested from a button rather than on load.
 * Returns true if storage is now persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
