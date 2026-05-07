import { Button, type ModalProps } from 'antd';
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
  getContainer?: ModalProps['getContainer'];
  centered?: ModalProps['centered'];
  zIndex?: number;
  /** 있으면 기본 단일 제출 버튼 대신 사용(닫기·승인 등은 이 안에서 구성) */
  customFooter?: ReactNode;
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
  getContainer,
  centered,
  zIndex,
  customFooter,
}: AppSingleActionModalProps) {
  const defaultFooter = (
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
  );

  return (
    <AppModal
      open={open}
      title={title}
      onCancel={onClose}
      centered={centered}
      getContainer={getContainer}
      zIndex={zIndex}
      footer={customFooter !== undefined ? customFooter : defaultFooter}
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

