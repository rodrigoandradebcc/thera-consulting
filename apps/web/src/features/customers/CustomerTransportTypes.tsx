import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTransportTypesQuery } from '@/features/transport-types/queries';
import { toApiError } from '@/lib/errors';
import { useCustomerTransportTypesQuery, useLinkTransportTypes } from './queries';

/**
 * A semântica da API é aditiva: nada é removido. Por isso o botão diz
 * "Adicionar transportes", não "Salvar lista".
 */
export function CustomerTransportTypes({ customerId }: { customerId: string }) {
  const authorized = useCustomerTransportTypesQuery(customerId);
  const transportTypes = useTransportTypesQuery();
  const link = useLinkTransportTypes(customerId);
  const [selected, setSelected] = useState<string[]>([]);

  async function add(): Promise<void> {
    try {
      await link.mutateAsync(selected);
      toast.success('Transportes autorizados.');
      setSelected([]);
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  // "Pendente" e "erro" nunca podem colapsar para "nenhum transporte": essa
  // mensagem é crítica para o negócio (bloqueia OVs) e só é verdadeira
  // quando a busca teve sucesso e voltou vazia.
  if (authorized.isPending || transportTypes.isPending) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium">Transportes autorizados</p>
        <p className="text-sm text-slate-600">Carregando transportes…</p>
      </div>
    );
  }

  if (authorized.isError || transportTypes.isError) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium">Transportes autorizados</p>
        <ErrorState
          error={authorized.error ?? transportTypes.error}
          onRetry={() => {
            void authorized.refetch();
            void transportTypes.refetch();
          }}
        />
      </div>
    );
  }

  const current = authorized.data;
  const available = transportTypes.data.filter((t) => t.active && !current.includes(t.id));

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <p className="text-sm font-medium">Transportes autorizados</p>

      {current.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nenhum. Sem ao menos um, este cliente não pode ter ordens de venda.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {current.map((id) => {
            const t = transportTypes.data.find((x) => x.id === id);
            return (
              <li key={id} className="rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-border">
                {t?.name ?? id}
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <>
          <fieldset className="space-y-2">
            <legend className="sr-only">Transportes disponíveis</legend>
            {available.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Checkbox
                  id={`tt-${t.id}`}
                  checked={selected.includes(t.id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => (checked === true ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                  }
                />
                <Label htmlFor={`tt-${t.id}`}>{t.name}</Label>
              </div>
            ))}
          </fieldset>

          <Button size="sm" disabled={selected.length === 0 || link.isPending} onClick={() => void add()}>
            Adicionar transportes
          </Button>
        </>
      )}
    </div>
  );
}
