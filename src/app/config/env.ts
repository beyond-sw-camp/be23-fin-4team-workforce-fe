import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().min(1),
  VITE_APP_ENV: z.string().min(1),
  VITE_API_BASE_URL: z.string().url(),
  /** 밀리초. 비우면 기본 60초. 외부 연동 등 느린 API용. */
  VITE_API_TIMEOUT_MS: z.string().optional(),
  VITE_ENABLE_MSW: z.enum(['true', 'false']).default('false'),
  VITE_LOG_LEVEL: z.string().default('info'),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_BUILD_COMMIT_SHA: z.string().optional(),
});

const parsed = envSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid env: ${parsed.error.message}`);
}

const DEFAULT_API_TIMEOUT_MS = 60_000;

function parseApiTimeoutMs(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_API_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_API_TIMEOUT_MS;
  return Math.min(180_000, Math.max(5_000, n));
}

export const env = {
  ...parsed.data,
  VITE_ENABLE_MSW: parsed.data.VITE_ENABLE_MSW === 'true',
  apiRequestTimeoutMs: parseApiTimeoutMs(parsed.data.VITE_API_TIMEOUT_MS),
};
