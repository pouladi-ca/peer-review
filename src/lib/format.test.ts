import { describe, it, expect } from 'vitest';
import { daysUntil, dueLabel, todayISO } from './format';

describe('due dates', () => {
  const now = new Date(2026, 8, 10, 15, 0); // 10 Sep 2026, mid-afternoon
  it('counts whole local days and labels urgency', () => {
    expect(todayISO(now)).toBe('2026-09-10');
    expect(daysUntil('2026-09-10', now)).toBe(0);
    expect(daysUntil('2026-09-13', now)).toBe(3);
    expect(daysUntil('2026-09-08', now)).toBe(-2);
    expect(dueLabel('2026-09-10', now)).toEqual({ text: 'Due today', level: 'soon' });
    expect(dueLabel('2026-09-11', now)).toEqual({ text: 'Due tomorrow', level: 'soon' });
    expect(dueLabel('2026-09-15', now)).toEqual({ text: 'Due in 5 days', level: 'soon' });
    expect(dueLabel('2026-09-08', now)).toEqual({ text: 'Overdue by 2 days', level: 'overdue' });
    expect(dueLabel('2026-10-15', now).level).toBe('later');
    expect(dueLabel('2026-10-15', now).text).toMatch(/^Due /);
  });
});
