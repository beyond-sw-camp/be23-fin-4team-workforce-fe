import { Drawer } from 'antd';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
}>;

export function AppDrawerForm({ open, title, onClose, children }: Props) {
  return (
    <Drawer open={open} title={title} onClose={onClose} destroyOnClose>
      {children}
    </Drawer>
  );
}
