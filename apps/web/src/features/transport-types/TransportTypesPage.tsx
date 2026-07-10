import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus } from 'lucide-react';
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

const editSchema = z.object({ name: z.string().min(1, 'Informe o nome.') });
type EditForm = z.infer<typeof editSchema>;

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
            <Label htmlFor="code" className="mb-1.5">Código</Label>
            <Input id="code" {...form.register('code')} />
            <p className="mt-1 text-xs text-muted-foreground">Imutável após a criação.</p>
            {form.formState.errors.code && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.code.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="name" className="mb-1.5">Nome</Label>
            <Input id="name" {...form.register('name')} />
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ id, code, name }: { id: string; code: string; name: string }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateTransportType(id);
  const form = useForm<EditForm>({ resolver: zodResolver(editSchema), defaultValues: { name } });

  function handleOpenChange(next: boolean): void {
    if (next) form.reset({ name });
    setOpen(next);
  }

  async function onSubmit(values: EditForm): Promise<void> {
    try {
      await update.mutateAsync(values);
      toast.success('Tipo de transporte atualizado.');
      setOpen(false);
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Editar tipo de transporte ${name}`}>
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar tipo de transporte</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-transport-type-code" className="mb-1.5">Código</Label>
            <Input id="edit-transport-type-code" value={code} disabled readOnly />
            <p className="mt-1 text-xs text-muted-foreground">Imutável após a criação.</p>
          </div>
          <div>
            <Label htmlFor="edit-transport-type-name" className="mb-1.5">Nome</Label>
            <Input id="edit-transport-type-name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <DialogFooter><Button type="submit" disabled={update.isPending}>Salvar</Button></DialogFooter>
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
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditDialog id={t.id} code={t.code} name={t.name} />
                      <ToggleActive id={t.id} active={t.active} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
