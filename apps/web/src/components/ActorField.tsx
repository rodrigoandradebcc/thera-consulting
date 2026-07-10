import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getActor, setActor } from '@/lib/actor';

/**
 * Não há autenticação no escopo. O ator vai no header X-Actor de toda
 * requisição, o que torna a auditoria demonstrável: mude o nome, veja o log.
 */
export function ActorField() {
  const [value, setValue] = useState(getActor);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="actor" className="whitespace-nowrap text-sm text-slate-600">
        Você é:
      </Label>
      <Input
        id="actor"
        value={value}
        className="h-9 w-40"
        onChange={(event) => {
          setValue(event.target.value);
          setActor(event.target.value);
        }}
      />
    </div>
  );
}
