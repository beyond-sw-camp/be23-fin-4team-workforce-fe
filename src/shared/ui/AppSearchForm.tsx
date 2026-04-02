import { Form } from 'antd';
import type { PropsWithChildren } from 'react';

export function AppSearchForm({ children }: PropsWithChildren) {
  return (
    <Form layout="inline" className="tw-mb-4">
      {children}
    </Form>
  );
}
