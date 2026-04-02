import { ErrorBoundary } from 'react-error-boundary';
import type { PropsWithChildren } from 'react';
import { AppErrorFallback } from '@/shared/ui/AppFallbacks';

export function AppErrorBoundary({ children }: PropsWithChildren) {
  return <ErrorBoundary FallbackComponent={AppErrorFallback}>{children}</ErrorBoundary>;
}
