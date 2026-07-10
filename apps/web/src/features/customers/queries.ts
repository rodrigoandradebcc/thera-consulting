import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomer,
  linkCustomerTransportTypes,
  listCustomers,
  listCustomerTransportTypes,
  updateCustomer,
  type CreateCustomerBody,
  type UpdateCustomerBody,
} from '@/lib/api/customers';
import { queryKeys } from '@/lib/query-keys';

export function useCustomersQuery() {
  return useQuery({ queryKey: queryKeys.customers.list(), queryFn: listCustomers });
}

export function useCustomerTransportTypesQuery(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.transportTypes(customerId ?? ''),
    queryFn: () => listCustomerTransportTypes(customerId ?? ''),
    enabled: customerId !== undefined && customerId.length > 0,
  });
}

export function useCreateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerBody) => createCustomer(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.customers.all }),
  });
}

export function useUpdateCustomer(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCustomerBody) => updateCustomer(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.customers.all }),
  });
}

export function useLinkTransportTypes(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (transportTypeIds: string[]) => linkCustomerTransportTypes(id, transportTypeIds),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.customers.transportTypes(id) }),
  });
}
