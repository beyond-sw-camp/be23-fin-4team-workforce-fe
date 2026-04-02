import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().min(1),
  VITE_APP_ENV: z.string().min(1),
  VITE_API_BASE_URL: z.string().url(),
  VITE_ENABLE_MSW: z.enum(['true', 'false']).default('false'),
  VITE_LOG_LEVEL: z.string().default('info'),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_BUILD_COMMIT_SHA: z.string().optional(),
});

const parsed = envSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid env: ${parsed.error.message}`);
}

export const env = {
  ...parsed.data,
  VITE_ENABLE_MSW: parsed.data.VITE_ENABLE_MSW === 'true',
};
