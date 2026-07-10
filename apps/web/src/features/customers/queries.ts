import { useQuery } from '@tanstack/react-query';
import { listCustomers, listCustomerTransportTypes } from '@/lib/api/customers';
import { queryKeys } from '@/lib/query-keys';

export function useCustomersQuery() {
  return useQuery({ queryKey: queryKeys.customers.list(), queryFn: listCustomers });
}

export function useCustomerTransportTypesQuery(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.transportTypes(customerId ?? ''),
    queryFn: () => listCustomerTransportTypes(customerId as string),
    enabled: customerId !== undefined && customerId.length > 0,
  });
}
