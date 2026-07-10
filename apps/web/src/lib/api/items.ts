import { api } from './client';

export interface Item {
  id: string;
  sku: string;
  name: string;
  unitPrice: string;
  active: boolean;
}

export async function listItems(): Promise<Item[]> {
  const { data } = await api.get<Item[]>('/items');
  return data;
}

export async function getItem(id: string): Promise<Item> {
  const { data } = await api.get<Item>(`/items/${id}`);
  return data;
}

/** unitPrice viaja como string. Enviar number perderia precisão no caminho. */
export async function createItem(body: {
  sku: string;
  name: string;
  unitPrice: string;
}): Promise<Item> {
  const { data } = await api.post<Item>('/items', body);
  return data;
}
