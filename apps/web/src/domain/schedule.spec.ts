import { describe, expect, it } from 'vitest';
import type { DeliveryWindow, SalesOrder } from '@/lib/api/sales-orders';
import { countConfirmedBySlot, isCountFull, isSlotFull, MAX_DELIVERIES_PER_SLOT, slotKey } from './schedule';

function orderWith(
  status: 'PENDENTE' | 'CONFIRMADO',
  date = '2099-08-01',
  window: DeliveryWindow = 'MANHA',
): SalesOrder {
  return {
    id: crypto.randomUUID(),
    number: 'OV-000001',
    customerId: 'c',
    transportTypeId: 't',
    status: 'PLANEJADA',
    total: '0.00',
    items: [],
    schedule: { scheduledDate: date, window, status, rescheduleCount: 0 },
    createdAt: '',
  };
}

describe('countConfirmedBySlot', () => {
  it('conta apenas agendamentos CONFIRMADOS', () => {
    const counts = countConfirmedBySlot([
      orderWith('CONFIRMADO'),
      orderWith('CONFIRMADO'),
      orderWith('PENDENTE'),
    ]);
    expect(counts.get(slotKey('2099-08-01', 'MANHA'))).toBe(2);
  });

  it('separa por data e janela', () => {
    const counts = countConfirmedBySlot([orderWith('CONFIRMADO', '2099-08-01'), orderWith('CONFIRMADO', '2099-08-02')]);
    expect(counts.get(slotKey('2099-08-01', 'MANHA'))).toBe(1);
    expect(counts.get(slotKey('2099-08-02', 'MANHA'))).toBe(1);
  });

  it('não mescla janelas diferentes na mesma data', () => {
    const counts = countConfirmedBySlot([
      orderWith('CONFIRMADO', '2099-08-01', 'MANHA'),
      orderWith('CONFIRMADO', '2099-08-01', 'TARDE'),
    ]);
    expect(counts.get(slotKey('2099-08-01', 'MANHA'))).toBe(1);
    expect(counts.get(slotKey('2099-08-01', 'TARDE'))).toBe(1);
  });

  it('ignora OVs sem agendamento', () => {
    const semAgenda = { ...orderWith('PENDENTE'), schedule: null };
    expect(countConfirmedBySlot([semAgenda]).size).toBe(0);
  });
});

describe('isSlotFull', () => {
  it('fica cheio no limite de capacidade', () => {
    const cheios = Array.from({ length: MAX_DELIVERIES_PER_SLOT }, () => orderWith('CONFIRMADO'));
    expect(isSlotFull(cheios, '2099-08-01', 'MANHA')).toBe(true);
  });

  it('não fica cheio abaixo do limite', () => {
    const quase = Array.from({ length: MAX_DELIVERIES_PER_SLOT - 1 }, () => orderWith('CONFIRMADO'));
    expect(isSlotFull(quase, '2099-08-01', 'MANHA')).toBe(false);
  });
});

describe('isCountFull', () => {
  it('não fica cheio um abaixo do limite', () => {
    expect(isCountFull(MAX_DELIVERIES_PER_SLOT - 1)).toBe(false);
  });

  it('fica cheio no limite', () => {
    expect(isCountFull(MAX_DELIVERIES_PER_SLOT)).toBe(true);
  });
});
