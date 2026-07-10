import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSalesOrder,
  getSalesOrder,
  listSalesOrders,
  updateSalesOrderStatus,
  updateSalesOrderTransport,
  type CreateSalesOrderBody,
  type ListSalesOrdersQuery,
} from '@/lib/api/sales-orders';
import { type SalesOrderStatus } from '@/domain/status-machine';
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

export function useCreateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSalesOrderBody) => createSalesOrder(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}

export function useUpdateStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: SalesOrderStatus) => updateSalesOrderStatus(id, status),
    // A mutação também gerou um AuditLog: a timeline precisa recarregar.
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}

export function useUpdateTransport(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (transportTypeId: string) => updateSalesOrderTransport(id, transportTypeId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}
