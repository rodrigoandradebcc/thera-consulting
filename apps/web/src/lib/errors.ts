import { AxiosError } from 'axios';

/** Espelha o corpo do AllExceptionsFilter da API. */
interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly error: string;

  constructor(statusCode: number, error: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

function isApiErrorBody(data: unknown): data is ApiErrorBody {
  return (
    typeof data === 'object'
    && data !== null
    && 'statusCode' in data
    && 'error' in data
    && 'message' in data
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    const { response } = error;

    if (response === undefined) {
      return new ApiError(0, 'NetworkError', 'Sem conexão com o servidor. Tente novamente.');
    }

    const data: unknown = response.data;
    if (isApiErrorBody(data)) {
      const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
      return new ApiError(response.status, data.error, message);
    }

    return new ApiError(response.status, 'UnexpectedResponse', 'Resposta inesperada do servidor.');
  }

  return new ApiError(0, 'UnknownError', 'Ocorreu um erro inesperado.');
}

export const isValidation = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 400;
export const isNotFound = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 404;
export const isConflict = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 409;
