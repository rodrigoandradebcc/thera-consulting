import type { InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActor } from '@/lib/actor';
import { ApiError } from '@/lib/errors';
import { api } from './client';

/**
 * Estes testes exercitam os interceptors reais registrados em `client.ts`
 * (não uma reimplementação deles). Um adapter fake substitui apenas a
 * camada de transporte HTTP, então a requisição continua passando pelos
 * interceptors de request/response de verdade.
 */
describe('api client', () => {
  const originalAdapter = api.defaults.adapter;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it('envia X-Actor: web quando localStorage está vazio', async () => {
    let captured: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      captured = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await api.get('/qualquer');

    expect(captured?.headers.get('X-Actor')).toBe('web');
  });

  it('envia X-Actor com o valor definido por setActor', async () => {
    setActor('rodrigo');
    let captured: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      captured = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await api.get('/qualquer');

    expect(captured?.headers.get('X-Actor')).toBe('rodrigo');
  });

  it('normaliza uma resposta de erro da API em ApiError, não em AxiosError', async () => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Request failed with status code 409', undefined, config, undefined, {
        status: 409,
        statusText: 'Conflict',
        data: {
          statusCode: 409,
          error: 'InvalidStatusTransition',
          message: 'Transição de CRIADA para ENTREGUE não é permitida.',
        },
        headers: {},
        config,
      });
    };

    await expect(api.get('/pedidos/1')).rejects.toBeInstanceOf(ApiError);

    try {
      await api.get('/pedidos/1');
      expect.unreachable('a requisição deveria ter rejeitado');
    } catch (err) {
      expect(err).not.toBeInstanceOf(AxiosError);
      if (!(err instanceof ApiError)) throw err;
      expect(err.statusCode).toBe(409);
      expect(err.error).toBe('InvalidStatusTransition');
    }
  });
});
