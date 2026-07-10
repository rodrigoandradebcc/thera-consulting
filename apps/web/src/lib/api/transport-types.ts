import { api } from './client';

export interface TransportType {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export async function listTransportTypes(): Promise<TransportType[]> {
  const { data } = await api.get<TransportType[]>('/transport-types');
  return data;
}

export async function createTransportType(body: {
  code: string;
  name: string;
}): Promise<TransportType> {
  const { data } = await api.post<TransportType>('/transport-types', body);
  return data;
}

/** `code` é imutável na API: identificador estável já referenciado por OVs. */
export async function updateTransportType(
  id: string,
  body: Partial<{ name: string; active: boolean }>,
): Promise<TransportType> {
  const { data } = await api.patch<TransportType>(`/transport-types/${id}`, body);
  return data;
}
