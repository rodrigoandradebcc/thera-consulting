import { api } from './client';

export interface Customer {
  id: string;
  name: string;
  document: string;
  email: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateCustomerBody {
  name: string;
  document: string;
  email?: string;
}

export type UpdateCustomerBody = Partial<{ name: string; email: string; active: boolean }>;

export async function listCustomers(): Promise<Customer[]> {
  const { data } = await api.get<Customer[]>('/customers');
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await api.get<Customer>(`/customers/${id}`);
  return data;
}

export async function createCustomer(body: CreateCustomerBody): Promise<Customer> {
  const { data } = await api.post<Customer>('/customers', body);
  return data;
}

export async function updateCustomer(id: string, body: UpdateCustomerBody): Promise<Customer> {
  const { data } = await api.patch<Customer>(`/customers/${id}`, body);
  return data;
}

export async function listCustomerTransportTypes(id: string): Promise<string[]> {
  const { data } = await api.get<{ transportTypeIds: string[] }>(`/customers/${id}/transport-types`);
  return data.transportTypeIds;
}

/** Aditivo e idempotente: reenviar os mesmos ids não muda estado nem falha. */
export async function linkCustomerTransportTypes(
  id: string,
  transportTypeIds: string[],
): Promise<string[]> {
  const { data } = await api.post<{ transportTypeIds: string[] }>(
    `/customers/${id}/transport-types`,
    { transportTypeIds },
  );
  return data.transportTypeIds;
}
