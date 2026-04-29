import { Button } from 'antd';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AppModal } from '@/shared/ui/AppModal';

type AppSingleActionModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitText: string;
  children: ReactNode;
  width?: number | string;
  submitLoading?: boolean;
  submitDisabled?: boolean;
  submitButtonClassName?: string;
  destroyOnHidden?: boolean;
  zIndex?: number;
};

/**
 * 단일 액션 모달.
 * - 헤더(타이틀) / 푸터(단일 버튼)는 고정
 * - 본문(content)만 내부 스크롤
 */
export function AppSingleActionModal({
  open,
  title,
  onClose,
  onSubmit,
  submitText,
  children,
  width = 720,
  submitLoading = false,
  submitDisabled = false,
  submitButtonClassName,
  destroyOnHidden = true,
  zIndex,
}: AppSingleActionModalProps) {
  return (
    <AppModal
      open={open}
      title={title}
      onCancel={onClose}
      zIndex={zIndex}
      footer={
        <div className="tw-flex tw-items-center">
          <Button
            type="primary"
            onClick={onSubmit}
            loading={submitLoading}
            disabled={submitDisabled}
            className={clsx(
              '!tw-h-12 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold hover:!tw-bg-[#152a45] disabled:!tw-bg-slate-300',
              submitButtonClassName,
            )}
          >
            {submitText}
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

