import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:3000/api';

export const salesOrderFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 'OV-000001',
  customerId: '22222222-2222-4222-8222-222222222222',
  transportTypeId: '33333333-3333-4333-8333-333333333333',
  status: 'CRIADA' as const,
  total: '259.80',
  items: [
    { itemId: '44444444-4444-4444-8444-444444444444', sku: 'SKU-001', name: 'Palete', quantity: 2, unitPrice: '129.90' },
  ],
  schedule: null,
  createdAt: '2026-07-09T12:00:00.000Z',
};

export const handlers = [
  http.get(`${BASE}/sales-orders`, () => HttpResponse.json([salesOrderFixture])),
  http.get(`${BASE}/sales-orders/:id`, () => HttpResponse.json(salesOrderFixture)),
  http.get(`${BASE}/customers`, () => HttpResponse.json([])),
  http.get(`${BASE}/transport-types`, () => HttpResponse.json([])),
  http.get(`${BASE}/items`, () => HttpResponse.json([])),
];
