import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomersQuery, useCustomerTransportTypesQuery } from '@/features/customers/queries';
import { useItemsQuery } from '@/features/items/queries';
import { useTransportTypesQuery } from '@/features/transport-types/queries';
import { toApiError } from '@/lib/errors';
import { money } from '@/lib/format';
import {
  createSalesOrderSchema,
  estimateTotalCents,
  type CreateSalesOrderForm,
  type CreateSalesOrderFormInput,
} from './createSalesOrderSchema';
import { useCreateSalesOrder } from './queries';

const selectClass =
  'h-10 w-full rounded-md border border-border bg-card px-3 text-sm disabled:opacity-50';

export function CreateSalesOrderPage() {
  const navigate = useNavigate();
  const customers = useCustomersQuery();
  const transportTypes = useTransportTypesQuery();
  const items = useItemsQuery();
  const createOrder = useCreateSalesOrder();

  const form = useForm<CreateSalesOrderFormInput, unknown, CreateSalesOrderForm>({
    resolver: zodResolver(createSalesOrderSchema),
    defaultValues: { customerId: '', transportTypeId: '', items: [{ itemId: '', quantity: 1 }] },
  });
  const lines = useFieldArray({ control: form.control, name: 'items' });

  const customerId = form.watch('customerId');
  const authorized = useCustomerTransportTypesQuery(customerId === '' ? undefined : customerId);

  // Quando o cliente muda, o transporte selecionado pode não ser mais autorizado
  // (a opção some do <select> sem disparar onChange, deixando o form com um valor
  // obsoleto). Ignora a primeira renderização para não disparar um reset supérfluo
  // quando o campo já está vazio.
  const isFirstCustomerRender = useRef(true);
  useEffect(() => {
    if (isFirstCustomerRender.current) {
      isFirstCustomerRender.current = false;
      return;
    }
    form.resetField('transportTypeId');
  }, [customerId, form]);

  const allowedTransports = (transportTypes.data ?? []).filter(
    (t) => t.active && (authorized.data ?? []).includes(t.id),
  );

  const watchedItems = form.watch('items');
  const priceById = new Map((items.data ?? []).map((i) => [i.id, i.unitPrice]));
  const totalCents = estimateTotalCents(
    watchedItems
      .filter((line) => priceById.has(line.itemId))
      .map((line) => ({ quantity: Number(line.quantity), unitPrice: priceById.get(line.itemId)! })),
  );

  async function onSubmit(values: CreateSalesOrderForm): Promise<void> {
    try {
      // `total` nunca é enviado: o servidor calcula.
      const created = await createOrder.mutateAsync(values);
      toast.success('Ordem de venda criada.');
      void navigate(`/sales-orders/${created.id}`);
    } catch (error) {
      const apiError = toApiError(error);
      // 400 é campo; 409 é estado. Mensagem da API já vem em português e específica.
      if (apiError.statusCode === 409) form.setError('transportTypeId', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Nova operação" title="Nova Ordem de Venda" />

      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="customerId" className="mb-1.5">Cliente</Label>
            <select id="customerId" className={selectClass} {...form.register('customerId')}>
              <option value="">Selecione…</option>
              {(customers.data ?? []).filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {form.formState.errors.customerId && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.customerId.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="transportTypeId" className="mb-1.5">Tipo de transporte</Label>
            <select
              id="transportTypeId"
              className={selectClass}
              disabled={customerId === '' || authorized.isPending}
              {...form.register('transportTypeId')}
            >
              <option value="">Selecione…</option>
              {allowedTransports.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {customerId === ''
                ? 'Selecione um cliente para ver os transportes autorizados.'
                : allowedTransports.length === 0
                  ? 'Este cliente não tem transportes autorizados. Cadastre-os em Clientes.'
                  : 'Apenas transportes autorizados para este cliente.'}
            </p>
            {form.formState.errors.transportTypeId && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.transportTypeId.message}
              </p>
            )}
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Itens</legend>

          {lines.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor={`item-${index}`} className="mb-1.5">{`Item ${index + 1}`}</Label>
                <select
                  id={`item-${index}`}
                  className={selectClass}
                  {...form.register(`items.${index}.itemId`)}
                >
                  <option value="">Selecione…</option>
                  {(items.data ?? []).filter((i) => i.active).map((i) => (
                    <option key={i.id} value={i.id}>{`${i.sku} — ${i.name}`}</option>
                  ))}
                </select>
                {form.formState.errors.items?.[index]?.itemId?.message && (
                  <p role="alert" className="mt-1 text-sm text-destructive">
                    {form.formState.errors.items[index]?.itemId?.message}
                  </p>
                )}
              </div>
              <div className="w-32">
                <Label htmlFor={`qty-${index}`} className="mb-1.5">{`Quantidade ${index + 1}`}</Label>
                <Input
                  id={`qty-${index}`}
                  type="number"
                  min={1}
                  {...form.register(`items.${index}.quantity`)}
                />
                {form.formState.errors.items?.[index]?.quantity?.message && (
                  <p role="alert" className="mt-1 text-sm text-destructive">
                    {form.formState.errors.items[index]?.quantity?.message}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remover item ${index + 1}`}
                disabled={lines.fields.length === 1}
                onClick={() => lines.remove(index)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={() => lines.append({ itemId: '', quantity: 1 })}>
            <Plus aria-hidden="true" className="size-4" /> Adicionar item
          </Button>

          {form.formState.errors.items?.message !== undefined && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.items.message}
            </p>
          )}
        </fieldset>

        <div className="rounded-xl border border-border bg-muted p-4 shadow-panel">
          <p className="text-sm text-muted-foreground">Total estimado</p>
          <p className="tabular text-2xl font-semibold">{money((totalCents / 100).toFixed(2))}</p>
          <p className="text-xs text-muted-foreground">
            O valor final é calculado pelo servidor no momento da criação.
          </p>
        </div>

        <Button type="submit" disabled={createOrder.isPending}>
          {createOrder.isPending ? 'Criando…' : 'Criar ordem de venda'}
        </Button>
      </form>
    </>
  );
}
