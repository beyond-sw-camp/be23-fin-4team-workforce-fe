import { Table } from 'antd';
import type { TableProps } from 'antd';

import { AppTablePanel } from '@/shared/ui/AppTablePanel';

type AppDataTableProps<T extends object> = TableProps<T> & {
  panelClassName?: string;
  bare?: boolean;
};

function AppDataTableBase<T extends object>({ bare, panelClassName, ...props }: AppDataTableProps<T>) {
  if (bare) {
    return <Table<T> size="middle" tableLayout="auto" {...props} />;
  }

  return (
    <AppTablePanel className={panelClassName}>
      <Table<T> size="middle" tableLayout="auto" {...props} />
    </AppTablePanel>
  );
}

export const AppDataTable = Object.assign(AppDataTableBase, {
  Summary: Table.Summary,
  Column: Table.Column,
  ColumnGroup: Table.ColumnGroup,
});
