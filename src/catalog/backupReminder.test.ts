import { afterEach, describe, expect, it } from 'vitest';
import { backupIsDue, markBackedUp } from './backupReminder';

afterEach(() => localStorage.clear());

describe('backup reminder', () => {
  it('is due when there has never been a backup', () => {
    expect(backupIsDue()).toBe(true);
  });

  it('is not due right after a backup, and due again two weeks later', () => {
    const now = Date.now();
    markBackedUp(now);
    expect(backupIsDue(now + 1000)).toBe(false);
    expect(backupIsDue(now + 15 * 24 * 3600 * 1000)).toBe(true);
  });
});
