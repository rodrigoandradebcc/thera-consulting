import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react';
import { Fragment, useState } from 'react';
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
import { CustomerTransportTypes } from './CustomerTransportTypes';
import { useCreateCustomer, useCustomersQuery, useUpdateCustomer } from './queries';

const customerSchema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  document: z.string().regex(/^\d{11,14}$/, 'CPF ou CNPJ: 11 a 14 dígitos.'),
  email: z.union([z.string().email('E-mail inválido.'), z.literal('')]),
});
type CustomerForm = z.infer<typeof customerSchema>;

const editCustomerSchema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  email: z.union([z.string().email('E-mail inválido.'), z.literal('')]),
});
type EditCustomerForm = z.infer<typeof editCustomerSchema>;

function CreateCustomerDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateCustomer();
  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', document: '', email: '' },
  });

  async function onSubmit(values: CustomerForm): Promise<void> {
    try {
      const { email, ...rest } = values;
      await create.mutateAsync(email === '' ? rest : { ...rest, email });
      toast.success('Cliente criado.');
      setOpen(false);
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('document', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" className="size-4" /> Novo cliente</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name" className="mb-1.5">Nome</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="document" className="mb-1.5">Documento</Label>
            <Input id="document" inputMode="numeric" {...form.register('document')} />
            {form.formState.errors.document && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.document.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="email" className="mb-1.5">E-mail (opcional)</Label>
            <Input id="email" type="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCustomerDialog({
  id,
  name,
  email,
  documentNumber,
}: {
  id: string;
  name: string;
  email: string | null;
  documentNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const update = useUpdateCustomer(id);
  const form = useForm<EditCustomerForm>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: { name, email: email ?? '' },
  });

  function handleOpenChange(next: boolean): void {
    if (next) form.reset({ name, email: email ?? '' });
    setOpen(next);
  }

  async function onSubmit(values: EditCustomerForm): Promise<void> {
    try {
      const { email: emailValue, ...rest } = values;
      await update.mutateAsync(emailValue === '' ? rest : { ...rest, email: emailValue });
      toast.success('Cliente atualizado.');
      setOpen(false);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('email', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Editar cliente ${name}`}>
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-customer-name" className="mb-1.5">Nome</Label>
            <Input id="edit-customer-name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="edit-customer-document" className="mb-1.5">Documento</Label>
            <Input id="edit-customer-document" value={documentNumber} disabled readOnly />
          </div>
          <div>
            <Label htmlFor="edit-customer-email" className="mb-1.5">E-mail (opcional)</Label>
            <Input id="edit-customer-email" type="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <DialogFooter><Button type="submit" disabled={update.isPending}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateCustomer({ id, active }: { id: string; active: boolean }) {
  const update = useUpdateCustomer(id);
  const [confirming, setConfirming] = useState(false);

  async function run(): Promise<void> {
    try {
      await update.mutateAsync({ active: !active });
      toast.success(active ? 'Cliente desativado.' : 'Cliente reativado.');
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
      <DialogTrigger asChild><Button size="sm" variant="outline">Desativar</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Desativar cliente?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Baixa lógica: o registro é preservado e as OVs existentes continuam válidas.
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

export function CustomersPage() {
  const query = useCustomersQuery();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Cadastro"
        title="Clientes"
        description="Cada cliente precisa de ao menos um transporte autorizado para ter OVs."
        actions={<CreateCustomerDialog />}
      />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState title="Nenhum cliente" description="Cadastre o primeiro cliente." />
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((customer) => {
                const open = expanded === customer.id;
                return (
                  <Fragment key={customer.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={open}
                          aria-label={`${open ? 'Ocultar' : 'Mostrar'} transportes de ${customer.name}`}
                          onClick={() => setExpanded(open ? null : customer.id)}
                        >
                          {open ? (
                            <ChevronDown aria-hidden="true" className="size-4" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell className="tabular">{customer.document}</TableCell>
                      <TableCell>{customer.active ? 'Ativo' : 'Inativo'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <EditCustomerDialog
                            id={customer.id}
                            name={customer.name}
                            email={customer.email}
                            documentNumber={customer.document}
                          />
                          <DeactivateCustomer id={customer.id} active={customer.active} />
                        </div>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <CustomerTransportTypes customerId={customer.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
