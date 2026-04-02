import { Empty, Result } from 'antd';
import type { FallbackProps } from 'react-error-boundary';
import { AppButton } from '@/shared/ui/AppButton';

export function AppEmpty() {
  return <Empty description="No data" />;
}

export function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <Result
      status="error"
      title="Something went wrong"
      subTitle={error.message}
      extra={
        <AppButton onClick={resetErrorBoundary} variant="secondary">
          Retry
        </AppButton>
      }
    />
  );
}
