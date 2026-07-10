import { Info, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getActor, setActor } from '@/lib/actor';
import { cn } from '@/lib/utils';

/**
 * Não há autenticação no escopo. O ator vai no header X-Actor de toda
 * requisição, o que torna a auditoria demonstrável: mude o nome, veja o log.
 * A UI se explica — o tooltip diz para que serve, para o campo não parecer
 * um input solto sem propósito.
 */
export function ActorField() {
  const [value, setValue] = useState(getActor);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="actor" className="eyebrow mb-0 hidden sm:block">
        Operador
      </Label>

      <div
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-md border border-input bg-background pl-2.5 pr-1',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
        )}
      >
        <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          id="actor"
          value={value}
          aria-label="Nome do operador — registrado na auditoria de cada ação"
          className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="seu nome"
          onChange={(event) => {
            setValue(event.target.value);
            setActor(event.target.value);
          }}
        />
      </div>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="O que é o operador?"
              className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Info aria-hidden="true" className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-56 text-xs">
            Cada ação que você faz é registrada na auditoria com este nome. Não há login: este
            campo é quem assina as operações.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
