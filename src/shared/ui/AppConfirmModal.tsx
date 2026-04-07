import { AppModal } from '@/shared/ui/AppModal';

type Props = {
  open: boolean;
  title: string;
  onOk: () => void;
  onCancel: () => void;
  children: React.ReactNode;
};

export function AppConfirmModal({ open, title, onOk, onCancel, children }: Props) {
  return (
    <AppModal open={open} title={title} onOk={onOk} onCancel={onCancel}>
      {children}
    </AppModal>
  );
}
