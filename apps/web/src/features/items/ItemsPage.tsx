import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toApiError } from '@/lib/errors';
import { money } from '@/lib/format';
import { useCreateItem, useItemsQuery } from './queries';

const itemSchema = z.object({
  sku: z.string().min(1, 'Informe o SKU.'),
  name: z.string().min(1, 'Informe o nome.'),
  // String, não number: dinheiro não passa por float nem na fronteira.
  unitPrice: z.string().regex(/^\d+\.\d{2}$/, 'Use o formato 0.00, com duas casas decimais.'),
});
type ItemForm = z.infer<typeof itemSchema>;

function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const createItem = useCreateItem();
  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: { sku: '', name: '', unitPrice: '' },
  });

  async function onSubmit(values: ItemForm): Promise<void> {
    try {
      await createItem.mutateAsync(values);
      toast.success('Item criado.');
      setOpen(false);
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('sku', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" className="size-4" /> Novo item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo item</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="sku" className="mb-1.5">SKU</Label>
            <Input id="sku" {...form.register('sku')} />
            {form.formState.errors.sku && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.sku.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="name" className="mb-1.5">Nome</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="unitPrice" className="mb-1.5">Preço unitário</Label>
            <Input id="unitPrice" inputMode="decimal" {...form.register('unitPrice')} />
            <p className="mt-1 text-xs text-muted-foreground">
              Duas casas decimais, ex.: 89.50. A API não aceita outros formatos.
            </p>
            {form.formState.errors.unitPrice && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.unitPrice.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createItem.isPending}>Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ItemsPage() {
  const query = useItemsQuery();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Itens"
        description="Catálogo. Itens são imutáveis após a criação."
        actions={<CreateItemDialog />}
      />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState title="Nenhum item" description="Cadastre o primeiro item do catálogo." />
      )}
      {query.isSuccess && query.data.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-panel md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Preço unitário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="tabular">{item.sku}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="tabular text-right">{money(item.unitPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {query.data.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-panel">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular text-right">{money(item.unitPrice)}</span>
                </div>
                <p className="tabular mt-1 text-sm text-muted-foreground">{item.sku}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
