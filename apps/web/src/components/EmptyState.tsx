import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border p-12 text-center">
      <Inbox aria-hidden="true" className="size-8 text-slate-400" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}
