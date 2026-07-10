import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '@/domain/status-machine';
import type { DeliveryWindow, ListSalesOrdersQuery } from '@/lib/api/sales-orders';

const WINDOWS: readonly DeliveryWindow[] = ['MANHA', 'TARDE', 'INTEGRAL'];

type FilterKey = keyof ListSalesOrdersQuery;

function asStatus(value: string | null): SalesOrderStatus | undefined {
  return SALES_ORDER_STATUSES.includes(value as SalesOrderStatus)
    ? (value as SalesOrderStatus)
    : undefined;
}

function asWindow(value: string | null): DeliveryWindow | undefined {
  return WINDOWS.includes(value as DeliveryWindow) ? (value as DeliveryWindow) : undefined;
}

function asText(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

/**
 * A URL é a fonte de verdade dos filtros. Um filtro em useState não sobrevive
 * a um refresh nem pode ser compartilhado por link.
 */
export function useSalesOrderFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<ListSalesOrdersQuery>(() => {
    const result: ListSalesOrdersQuery = {};
    const status = asStatus(params.get('status'));
    const window = asWindow(params.get('window'));
    const customerId = asText(params.get('customerId'));
    const transportTypeId = asText(params.get('transportTypeId'));
    const scheduledFrom = asText(params.get('scheduledFrom'));
    const scheduledTo = asText(params.get('scheduledTo'));

    if (status !== undefined) result.status = status;
    if (window !== undefined) result.window = window;
    if (customerId !== undefined) result.customerId = customerId;
    if (transportTypeId !== undefined) result.transportTypeId = transportTypeId;
    if (scheduledFrom !== undefined) result.scheduledFrom = scheduledFrom;
    if (scheduledTo !== undefined) result.scheduledTo = scheduledTo;
    return result;
  }, [params]);

  const setFilter = useCallback(
    (key: FilterKey, value: string | undefined) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === undefined || value.length === 0) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  return { filters, setFilter, clear };
}
