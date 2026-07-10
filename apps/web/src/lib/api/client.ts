import axios from 'axios';
import { getActor } from '@/lib/actor';
import { toApiError } from '@/lib/errors';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  config.headers.set('X-Actor', getActor());
  return config;
});

// Toda a UI trabalha com ApiError. Nenhuma feature conhece AxiosError.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);
