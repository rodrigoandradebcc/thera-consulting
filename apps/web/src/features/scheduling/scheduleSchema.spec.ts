import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleSchema } from './scheduleSchema';

describe('scheduleSchema', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aceita a data de hoje mesmo tarde da noite no fuso local (São Paulo)', () => {
    // 23:30 em São Paulo (UTC-3) já é 02:30 UTC do dia seguinte. Se `today()`
    // usar `toISOString()`, a comparação lexicográfica vai comparar contra o
    // dia seguinte em UTC e rejeitar a data de hoje como "passada".
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T02:30:00Z')); // 2026-07-09T23:30:00-03:00

    const result = scheduleSchema.safeParse({ scheduledDate: '2026-07-09', window: 'MANHA' });

    expect(result.success).toBe(true);
  });
});
