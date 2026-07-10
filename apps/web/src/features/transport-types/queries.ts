import { useQuery } from '@tanstack/react-query';
import { listTransportTypes } from '@/lib/api/transport-types';
import { queryKeys } from '@/lib/query-keys';

export function useTransportTypesQuery() {
  return useQuery({ queryKey: queryKeys.transportTypes.list(), queryFn: listTransportTypes });
}
