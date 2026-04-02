import { Modal } from 'antd';

type Props = {
  open: boolean;
  title: string;
  onOk: () => void;
  onCancel: () => void;
  children: React.ReactNode;
};

export function AppConfirmModal({ open, title, onOk, onCancel, children }: Props) {
  return (
    <Modal open={open} title={title} onOk={onOk} onCancel={onCancel}>
      {children}
    </Modal>
  );
}
