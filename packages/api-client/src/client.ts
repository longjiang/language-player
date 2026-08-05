import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiResponse, ApiError } from '@langplayer/shared';

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  getAccessToken?: () => Promise<string | null>;
  /** Called on 401 to mint a fresh access token (e.g. /auth/refresh). */
  refreshAccessToken?: () => Promise<string | null>;
  onError?: (error: ApiError) => void;
}

let clientInstance: AxiosInstance | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function createApiClient(config: ApiClientConfig): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout ?? 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Attach auth token to every request
  instance.interceptors.request.use(async (reqConfig) => {
    if (config.getAccessToken) {
      const token = await config.getAccessToken();
      if (token) {
        reqConfig.headers.Authorization = `Bearer ${token}`;
      }
    }
    return reqConfig;
  });

  // Normalize errors
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
      if (
        error.response?.status === 401 &&
        config.refreshAccessToken &&
        original &&
        !original._retry
      ) {
        original._retry = true;
        refreshPromise ??= config
          .refreshAccessToken()
          .finally(() => { refreshPromise = null; });
        const newToken = await refreshPromise;
        if (newToken) {
          original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
          return instance(original);
        }
      }
      const apiError: ApiError = {
        code: error.response?.status?.toString() ?? 'NETWORK_ERROR',
        message: error.response?.data?.message ?? error.message,
        details: error.response?.data,
      };
      config.onError?.(apiError);
      return Promise.reject(apiError);
    },
  );

  clientInstance = instance;
  return instance;
}

/** Singleton accessor — call `createApiClient` once at app init. */
export const apiClient = {
  get instance(): AxiosInstance {
    if (!clientInstance) {
      throw new Error('API client not initialized. Call createApiClient() first.');
    }
    return clientInstance;
  },
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    clientInstance!.get<T>(url, config).then((r) => r.data),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    clientInstance!.post<T>(url, data, config).then((r) => r.data),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    clientInstance!.put<T>(url, data, config).then((r) => r.data),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    clientInstance!.patch<T>(url, data, config).then((r) => r.data),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    clientInstance!.delete<T>(url, config).then((r) => r.data),
};
