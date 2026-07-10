import {
  Boxes,
  CalendarClock,
  LayoutDashboard,
  Package,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { ActorField } from '@/components/ActorField';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

const NAV: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sales-orders', label: 'Ordens de Venda', icon: Package },
  { to: '/scheduling', label: 'Agendamento', icon: CalendarClock },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/transport-types', label: 'Transportes', icon: Truck },
  { to: '/items', label: 'Itens', icon: Boxes },
];

export function AppLayout() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-primary focus:p-2 focus:text-on-primary"
      >
        Pular para o conteúdo
      </a>

      <aside className="border-b border-border bg-card md:border-b-0 md:border-r">
        <div className="p-4 text-lg font-semibold text-primary">OVGS</div>
        <nav aria-label="Navegação principal" className="flex gap-1 overflow-x-auto p-2 md:block">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-muted',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-card px-6 py-3">
          <ActorField />
          <ThemeToggle />
        </header>
        <main id="conteudo" className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
