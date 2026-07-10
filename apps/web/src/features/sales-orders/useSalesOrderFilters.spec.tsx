import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type DataRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSalesOrderFilters } from './useSalesOrderFilters';

/**
 * Além do Wrapper, expõe o router criado para que os testes possam observar
 * `router.state.location.search` diretamente — o estado de navegação real,
 * não o valor de retorno do hook. Isso garante que os testes falhem se o
 * hook parar de escrever na URL (ex.: um refactor para useState).
 */
function wrapperFor(initialEntry: string): {
  Wrapper: ({ children }: { children: ReactNode }) => ReactNode;
  getRouter: () => DataRouter;
} {
  let router: DataRouter | undefined;

  function Wrapper({ children }: { children: ReactNode }) {
    router = createMemoryRouter([{ path: '/', element: children }], {
      initialEntries: [initialEntry],
    });
    return <RouterProvider router={router} />;
  }

  return {
    Wrapper,
    getRouter: () => {
      if (!router) throw new Error('router ainda não foi inicializado');
      return router;
    },
  };
}

describe('useSalesOrderFilters', () => {
  it('lê os filtros da query string', () => {
    const { Wrapper } = wrapperFor('/?status=CRIADA&window=MANHA');
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    expect(result.current.filters).toEqual({ status: 'CRIADA', window: 'MANHA' });
  });

  it('ignora valor de enum inválido vindo da URL', () => {
    const { Wrapper } = wrapperFor('/?status=CANCELADA');
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    expect(result.current.filters.status).toBeUndefined();
  });

  it('escreve o filtro na URL, tornando-o compartilhável', () => {
    const { Wrapper } = wrapperFor('/');
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    act(() => result.current.setFilter('status', 'PLANEJADA'));

    expect(result.current.filters.status).toBe('PLANEJADA');
  });

  it('remove o filtro quando o valor é limpo', () => {
    const { Wrapper } = wrapperFor('/?status=CRIADA');
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    act(() => result.current.setFilter('status', undefined));

    expect(result.current.filters.status).toBeUndefined();
  });

  it('escreve status=PLANEJADA na URL de verdade, não só no retorno do hook', () => {
    const { Wrapper, getRouter } = wrapperFor('/');
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    act(() => result.current.setFilter('status', 'PLANEJADA'));

    expect(getRouter().state.location.search).toBe('?status=PLANEJADA');
  });

  it('remove o parâmetro "status" da URL por completo, sem deixar "status=" vazio', () => {
    const { Wrapper, getRouter } = wrapperFor('/?status=CRIADA');
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    act(() => result.current.setFilter('status', undefined));

    const search = getRouter().state.location.search;
    expect(search).not.toContain('status');
    expect(search).toBe('');
  });

  it('clear() remove todos os parâmetros da URL de uma vez', () => {
    const { Wrapper, getRouter } = wrapperFor(
      '/?status=CRIADA&window=MANHA&customerId=8f14e45f-ceea-467e-8a90-000000000001',
    );
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: Wrapper });

    act(() => result.current.clear());

    expect(getRouter().state.location.search).toBe('');
  });
});
