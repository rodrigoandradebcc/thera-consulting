import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/errors';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const apiError = toApiError(error);
  return (
    <div
      role="alert"
      className="grid place-items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-12 text-center"
    >
      <AlertTriangle aria-hidden="true" className="size-8 text-destructive" />
      <div>
        <p className="font-medium">Não foi possível carregar</p>
        <p className="text-sm text-slate-600">{apiError.message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
