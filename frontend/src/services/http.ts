/// <reference types="vite/client" />

import axios, { type AxiosError, type AxiosInstance } from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

http.interceptors.request.use((config) => {
  const token = (window as any).__SV_ACCESS_TOKEN__;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AUTH_PATHS = ['/auth/login', '/auth/mfa/verify', '/auth/refresh', '/auth/logout', '/auth/me'];

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Não tenta refresh em rotas de auth (evita loop de 401)
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !AUTH_PATHS.some((p) => (originalRequest.url as string).includes(p))
    ) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = http
          .post('/auth/refresh', {}, { withCredentials: true })
          .then((res) => {
            const data = res.data as { accessToken?: string };
            if (data.accessToken) {
              (window as any).__SV_ACCESS_TOKEN__ = data.accessToken;
            }
            return data.accessToken ?? null;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }

      try {
        const token = await refreshPromise;
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return http(originalRequest);
        }
      } catch {
        // refresh falhou — deixa o 401 propagar
      }
    }

    return Promise.reject(error);
  },
);

export { http };
export type { AxiosError };
