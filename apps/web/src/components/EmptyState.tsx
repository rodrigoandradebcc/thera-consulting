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
    <div className="grid place-items-center gap-4 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <Inbox className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
