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
import { useCreateTransportType, useTransportTypesQuery, useUpdateTransportType } from './queries';

const schema = z.object({
  code: z.string().regex(/^[A-Z0-9_]+$/, 'Use apenas A-Z, 0-9 e _'),
  name: z.string().min(1, 'Informe o nome.'),
});
type Form = z.infer<typeof schema>;

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateTransportType();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { code: '', name: '' } });

  async function onSubmit(values: Form): Promise<void> {
    try {
      await create.mutateAsync(values);
      toast.success('Tipo de transporte criado.');
      setOpen(false);
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('code', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" className="size-4" /> Novo tipo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo tipo de transporte</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="code">Código</Label>
            <Input id="code" {...form.register('code')} />
            <p className="mt-1 text-xs text-muted-foreground">Imutável após a criação.</p>
            {form.formState.errors.code && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.code.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...form.register('name')} />
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActive({ id, active }: { id: string; active: boolean }) {
  const update = useUpdateTransportType(id);
  const [confirming, setConfirming] = useState(false);

  async function run(): Promise<void> {
    try {
      await update.mutateAsync({ active: !active });
      toast.success(active ? 'Tipo desativado.' : 'Tipo reativado.');
      setConfirming(false);
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  if (!active) {
    return (
      <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => void run()}>
        Reativar
      </Button>
    );
  }

  return (
    <Dialog open={confirming} onOpenChange={setConfirming}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Desativar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Desativar tipo de transporte?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Baixa lógica: o registro é preservado, e as OVs existentes continuam válidas.
          Ele deixa de ser oferecido em novas OVs.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={update.isPending} onClick={() => void run()}>
            Desativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransportTypesPage() {
  const query = useTransportTypesQuery();

  return (
    <>
      <PageHeader
        title="Tipos de Transporte"
        description="Novos tipos entram sem alterar regra de negócio."
        actions={<CreateDialog />}
      />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState title="Nenhum tipo de transporte" description="Cadastre o primeiro tipo de transporte." />
      )}
      {query.isSuccess && query.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tabular">{t.code}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.active ? 'Ativo' : 'Inativo'}</TableCell>
                  <TableCell className="text-right"><ToggleActive id={t.id} active={t.active} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
