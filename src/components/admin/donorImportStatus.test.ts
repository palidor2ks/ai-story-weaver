import { describe, it, expect } from 'bun:test';
import { isStalledImport, STALE_IMPORT_MS } from './donorImportStatus';

const NOW = Date.UTC(2026, 5, 15, 14, 0, 0); // 2026-06-15T14:00:00Z
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('isStalledImport', () => {
  it('flags a running import with no recent progress', () => {
    expect(isStalledImport('running', iso(STALE_IMPORT_MS + 1000), iso(STALE_IMPORT_MS + 1000), NOW)).toBe(true);
  });

  it('does not flag a running import that just made progress', () => {
    expect(isStalledImport('running', iso(5000), iso(60_000), NOW)).toBe(false);
  });

  it('never flags terminal statuses, even if old', () => {
    for (const status of ['completed', 'completed_with_errors', 'cancelled', 'undone']) {
      expect(isStalledImport(status, iso(STALE_IMPORT_MS * 10), iso(STALE_IMPORT_MS * 10), NOW)).toBe(false);
    }
  });

  it('falls back to started_at when last_progress_at is null (pre-heartbeat rows)', () => {
    expect(isStalledImport('running', null, iso(STALE_IMPORT_MS + 1000), NOW)).toBe(true);
    expect(isStalledImport('running', null, iso(1000), NOW)).toBe(false);
  });

  it('uses last_progress_at over started_at when present', () => {
    // Started long ago but progressed recently -> still active, not stalled.
    expect(isStalledImport('running', iso(1000), iso(STALE_IMPORT_MS * 5), NOW)).toBe(false);
  });

  it('treats an unparseable timestamp as not stalled', () => {
    expect(isStalledImport('running', 'not-a-date', 'also-bad', NOW)).toBe(false);
  });
});
