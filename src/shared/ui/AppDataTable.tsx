import { Table } from 'antd';
import type { TableProps } from 'antd';

export function AppDataTable<T extends object>(props: TableProps<T>) {
  return <Table<T> size="middle" {...props} />;
}
