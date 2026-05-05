import { Table } from 'antd';
import type { TableProps } from 'antd';
import { AppTablePanel } from '@/shared/ui/AppTablePanel';

export function AppDataTable<T extends object>(props: TableProps<T>) {
  return (
    <AppTablePanel>
      <Table<T> size="middle" {...props} />
    </AppTablePanel>
  );
}
