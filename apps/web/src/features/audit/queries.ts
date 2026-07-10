import { useQuery } from '@tanstack/react-query';
import { listAudit } from '@/lib/api/audit';
import { queryKeys } from '@/lib/query-keys';

export function useAuditQuery(salesOrderId: string) {
  return useQuery({
    queryKey: queryKeys.salesOrders.audit(salesOrderId),
    queryFn: () => listAudit(salesOrderId),
  });
}
