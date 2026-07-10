import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTransportType,
  listTransportTypes,
  updateTransportType,
} from '@/lib/api/transport-types';
import { queryKeys } from '@/lib/query-keys';

export function useTransportTypesQuery() {
  return useQuery({ queryKey: queryKeys.transportTypes.list(), queryFn: listTransportTypes });
}

export function useCreateTransportType() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createTransportType,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.transportTypes.all }),
  });
}

export function useUpdateTransportType(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ name: string; active: boolean }>) => updateTransportType(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.transportTypes.all }),
  });
}
