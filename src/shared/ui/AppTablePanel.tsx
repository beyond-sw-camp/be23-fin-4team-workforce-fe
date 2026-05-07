import type { ReactNode } from 'react';

type AppTablePanelProps = {
  children: ReactNode;
  className?: string;
};

export const APP_TABLE_PANEL_CLASS =
  'wf-app-table-panel tw-w-full';

export function AppTablePanel({ children, className }: AppTablePanelProps) {
  return (
    <div className={[APP_TABLE_PANEL_CLASS, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
