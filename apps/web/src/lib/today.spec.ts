import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayLocalIso } from './today';

describe('todayLocalIso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa a data local (São Paulo), não a UTC, tarde da noite', () => {
    // 23:30 em São Paulo (UTC-3) já é 02:30 UTC do dia seguinte. Se a função
    // usasse `toISOString()`, devolveria '2026-07-10' em vez de '2026-07-09'.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T02:30:00Z')); // 2026-07-09T23:30:00-03:00

    expect(todayLocalIso()).toBe('2026-07-09');
    expect(todayLocalIso(7)).toBe('2026-07-16');
  });

  it('rola o ano corretamente ao somar dias no fim de dezembro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-28T15:00:00Z')); // 2026-12-28T12:00:00-03:00

    expect(todayLocalIso(7)).toBe('2027-01-04');
  });
});
