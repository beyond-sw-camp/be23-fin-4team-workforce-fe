import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/app/config/env';
import { parseApiError } from '@/shared/api/error-parser';
import { unwrapApiResponse } from '@/shared/api/response';
import { getAccessToken, setAccessToken } from '@/shared/stores/authTokenStore';

export const httpClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
});

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

type RefreshResponse = {
  accessToken?: string;
  access_token?: string;
};

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await axios.post(
        `${env.VITE_API_BASE_URL}/member/generate-at`,
        {},
        {
          timeout: 15000,
          withCredentials: true,
        },
      );
      const data = unwrapApiResponse<RefreshResponse>(response.data);
      const nextToken = data?.accessToken ?? data?.access_token ?? null;
      setAccessToken(nextToken);
      return nextToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isPublicAuthRoute(url: string) {
  return ['/member/login', '/member/email/', '/member/reset-password/'].some((path) => url.includes(path));
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const status = error?.response?.status;
    const requestUrl: string = config?.url ?? '';
    const isRefreshCall = requestUrl.includes('/member/generate-at');
    const isPublicAuthCall = isPublicAuthRoute(requestUrl);
    const alreadyRetried = Boolean(config?._retry);

    if (status === 401 && !alreadyRetried && !isRefreshCall && !isPublicAuthCall && config) {
      config._retry = true;
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${refreshed}`;
        return httpClient.request(config);
      }
    }

    return Promise.reject(parseApiError(error));
  },
);
