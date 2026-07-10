import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { ApiError, isConflict, isNotFound, toApiError } from './errors';

function axiosErrorWithResponse(status: number, body: unknown): AxiosError {
  const error = new AxiosError('falhou');
  // @ts-expect-error resposta parcial é suficiente para o teste
  error.response = { status, data: body };
  return error;
}

describe('toApiError', () => {
  it('extrai statusCode, error e message do corpo normalizado da API', () => {
    const result = toApiError(
      axiosErrorWithResponse(409, {
        statusCode: 409,
        error: 'InvalidStatusTransition',
        message: 'Transição de CRIADA para ENTREGUE não é permitida.',
      }),
    );

    expect(result).toBeInstanceOf(ApiError);
    expect(result.statusCode).toBe(409);
    expect(result.error).toBe('InvalidStatusTransition');
    expect(result.message).toBe('Transição de CRIADA para ENTREGUE não é permitida.');
  });

  it('trata erro de rede sem resposta', () => {
    const result = toApiError(new AxiosError('Network Error'));

    expect(result.statusCode).toBe(0);
    expect(result.error).toBe('NetworkError');
    expect(result.message).toContain('conexão');
  });

  it('trata erro desconhecido sem vazar o objeto original', () => {
    const result = toApiError({ qualquer: 'coisa' });

    expect(result.statusCode).toBe(0);
    expect(result.error).toBe('UnknownError');
  });

  it('classifica por status', () => {
    expect(isConflict(toApiError(axiosErrorWithResponse(409, {})))).toBe(true);
    expect(isNotFound(toApiError(axiosErrorWithResponse(404, {})))).toBe(true);
    expect(isConflict(toApiError(axiosErrorWithResponse(400, {})))).toBe(false);
  });
});
