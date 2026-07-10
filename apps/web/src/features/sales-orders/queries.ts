import { useQuery } from '@tanstack/react-query';
import { getSalesOrder, listSalesOrders, type ListSalesOrdersQuery } from '@/lib/api/sales-orders';
import { queryKeys } from '@/lib/query-keys';

export function useSalesOrdersQuery(filters: ListSalesOrdersQuery) {
  return useQuery({
    queryKey: queryKeys.salesOrders.list(filters),
    queryFn: () => listSalesOrders(filters),
  });
}

export function useSalesOrderQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.salesOrders.detail(id),
    queryFn: () => getSalesOrder(id),
  });
}
