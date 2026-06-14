import { describe, it, expect } from 'vitest';
import { statusLabel, statusBadgeClass, isSettled } from './order-status';

describe('order-status', () => {
  it('maps known statuses to Japanese labels', () => {
    expect(statusLabel('settled')).toBe('着金済み');
    expect(statusLabel('bookkept')).toBe('記帳完了');
    expect(statusLabel('review_failed')).toBe('差し戻し');
    expect(statusLabel('settling')).toBe('送金中');
  });

  it('falls back to the raw status for unknown values', () => {
    expect(statusLabel('something_new')).toBe('something_new');
  });

  it('returns a badge class for every status (and a fallback)', () => {
    expect(statusBadgeClass('settled')).toContain('emerald');
    expect(statusBadgeClass('unknown')).toContain('neutral');
  });

  it('treats settled and bookkept as settled for totals', () => {
    expect(isSettled('settled')).toBe(true);
    expect(isSettled('bookkept')).toBe(true);
    expect(isSettled('review_passed')).toBe(false);
    expect(isSettled('created')).toBe(false);
  });
});
