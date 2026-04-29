import { Button } from 'antd';
import type { ReactNode } from 'react';
import { AppModal } from '@/shared/ui/AppModal';

type AppDoubleActionModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
  width?: number | string;
  confirmText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  cancelAction?: () => void;
  cancelLoading?: boolean;
  cancelDisabled?: boolean;
  cancelDanger?: boolean;
  destroyOnHidden?: boolean;
};

/**
 * Double action modal with a fixed header/footer and scrollable body.
 */
export function AppDoubleActionModal({
  open,
  title,
  onClose,
  onConfirm,
  children,
  width = 560,
  confirmText = '저장',
  cancelText = '취소',
  confirmLoading = false,
  confirmDisabled = false,
  cancelAction,
  cancelLoading = false,
  cancelDisabled = false,
  cancelDanger = false,
  destroyOnHidden = true,
}: AppDoubleActionModalProps) {
  return (
    <AppModal
      open={open}
      title={title}
      onCancel={onClose}
      footer={
        <div className="tw-grid tw-w-full tw-grid-cols-2 tw-gap-2">
          <Button
            onClick={cancelAction ?? onClose}
            loading={cancelLoading}
            disabled={cancelDisabled}
            danger={cancelDanger}
            className="!tw-h-12 !tw-w-full !tw-rounded-xl !tw-border-slate-300 !tw-bg-white !tw-px-5 !tw-font-semibold !tw-text-slate-700 hover:!tw-border-slate-400 hover:!tw-text-slate-900"
          >
            {cancelText}
          </Button>
          <Button
            type="primary"
            onClick={onConfirm}
            loading={confirmLoading}
            disabled={confirmDisabled}
            className="!tw-h-12 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold hover:!tw-bg-[#152a45] disabled:!tw-bg-slate-300"
          >
            {confirmText}
          </Button>
        </div>
      }
      width={width}
      destroyOnHidden={destroyOnHidden}
      maskClosable={false}
      classNames={{
        content: '!tw-p-0',
        header:
          'tw-sticky tw-top-0 tw-z-10 tw-m-0 tw-border-b tw-border-slate-200 tw-bg-white tw-px-5 tw-py-4',
        body: 'wf-scrollbar-modal !tw-p-0 !tw-pr-0',
        footer:
          'tw-sticky tw-bottom-0 tw-z-10 tw-m-0 tw-border-t tw-border-slate-200 tw-bg-white tw-px-5 tw-py-4',
      }}
      styles={{
        content: { padding: 0 },
        header: { marginBottom: 0, padding: '16px 20px' },
        body: {
          padding: 0,
          paddingRight: 0,
          marginRight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        },
        footer: { marginTop: 0, padding: '16px 20px' },
      }}
    >
      {children}
    </AppModal>
  );
}
