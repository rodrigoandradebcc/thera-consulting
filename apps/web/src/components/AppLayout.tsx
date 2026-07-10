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
    <div className="min-h-dvh md:grid md:grid-cols-[16.5rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        Pular para o conteúdo
      </a>

      <aside className="z-20 border-b border-border bg-card shadow-panel md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        {/* Marca */}
        <div className="flex items-center gap-3 px-5 py-4">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-on-primary shadow-sm"
          >
            <Package className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">OVGS</p>
            <p className="eyebrow">Ordens de Venda</p>
          </div>
        </div>

        <div className="mx-4 border-t border-border" />

        <nav
          aria-label="Navegação principal"
          className="flex gap-1 overflow-x-auto p-3 md:flex-col md:gap-0.5"
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  // Barra de acento à esquerda no item ativo (só no layout vertical).
                  'md:before:absolute md:before:left-0 md:before:top-1/2 md:before:hidden md:before:h-5 md:before:w-0.5 md:before:-translate-y-1/2 md:before:rounded-full md:before:bg-primary',
                  isActive
                    ? // dark:text-blue-300 mantém o texto ativo em AA (4.5:1+) sobre o tint no tema escuro.
                      'bg-primary/10 text-primary md:before:block dark:bg-primary/15 dark:text-blue-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-border bg-card/80 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <ActorField />
          <ThemeToggle />
        </header>
        <main id="conteudo" className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
