type WrappedApiResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export function unwrapApiResponse<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as WrappedApiResponse<T>).data as T;
  }
  return payload as T;
}
