import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSalesOrderFilters } from './useSalesOrderFilters';

function wrapperFor(initialEntry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const router = createMemoryRouter([{ path: '/', element: children }], {
      initialEntries: [initialEntry],
    });
    return <RouterProvider router={router} />;
  };
}

describe('useSalesOrderFilters', () => {
  it('lê os filtros da query string', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), {
      wrapper: wrapperFor('/?status=CRIADA&window=MANHA'),
    });

    expect(result.current.filters).toEqual({ status: 'CRIADA', window: 'MANHA' });
  });

  it('ignora valor de enum inválido vindo da URL', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), {
      wrapper: wrapperFor('/?status=CANCELADA'),
    });

    expect(result.current.filters.status).toBeUndefined();
  });

  it('escreve o filtro na URL, tornando-o compartilhável', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: wrapperFor('/') });

    act(() => result.current.setFilter('status', 'PLANEJADA'));

    expect(result.current.filters.status).toBe('PLANEJADA');
  });

  it('remove o filtro quando o valor é limpo', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), {
      wrapper: wrapperFor('/?status=CRIADA'),
    });

    act(() => result.current.setFilter('status', undefined));

    expect(result.current.filters.status).toBeUndefined();
  });
});
