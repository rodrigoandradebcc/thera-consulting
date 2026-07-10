import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createItem, listItems } from '@/lib/api/items';
import { queryKeys } from '@/lib/query-keys';

export function useItemsQuery() {
  return useQuery({ queryKey: queryKeys.items.list(), queryFn: listItems });
}

export function useCreateItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.items.all }),
  });
}
