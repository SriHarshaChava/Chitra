/** Remembers when the library was last backed up, to remind about it. */

export const LAST_BACKUP_KEY = 'chitra.lastBackup';
/** Remind about backups when the last one is older than this. */
const REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function lastBackupTime(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function backupIsDue(now = Date.now()): boolean {
  const last = lastBackupTime();
  return last === null || now - last > REMIND_AFTER_MS;
}

export function markBackedUp(now = Date.now()) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(now));
  } catch {
    // Only affects the reminder.
  }
}
