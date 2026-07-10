import type { ListSalesOrdersQuery } from '@/lib/api/sales-orders';

/**
 * Fonte única das chaves de cache. Invalidação por string literal espalhada
 * pelo código é como o cache de um app apodrece.
 */
export const queryKeys = {
  salesOrders: {
    all: ['sales-orders'] as const,
    list: (query: ListSalesOrdersQuery) => [...queryKeys.salesOrders.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.salesOrders.all, 'detail', id] as const,
    audit: (id: string) => [...queryKeys.salesOrders.all, 'audit', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: () => [...queryKeys.customers.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.customers.all, 'detail', id] as const,
    transportTypes: (id: string) => [...queryKeys.customers.all, id, 'transport-types'] as const,
  },
  transportTypes: {
    all: ['transport-types'] as const,
    list: () => [...queryKeys.transportTypes.all, 'list'] as const,
  },
  items: {
    all: ['items'] as const,
    list: () => [...queryKeys.items.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.items.all, 'detail', id] as const,
  },
} as const;
