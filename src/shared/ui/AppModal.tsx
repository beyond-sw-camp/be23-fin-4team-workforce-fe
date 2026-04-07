import { Modal, type ModalProps } from 'antd';

const APP_MODAL_CONTENT =
  'tw-max-h-[min(92dvh,56rem)] tw-flex tw-flex-col tw-overflow-hidden';

/** 본문만 세로 스크롤 — flex로 높이 분배, 스크롤바는 wf-scrollbar-modal */
const APP_MODAL_BODY_SCROLL =
  'wf-scrollbar-modal tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden tw-overscroll-y-contain';

function mergeClass(extra: string | undefined, base: string): string {
  return [base, extra].filter(Boolean).join(' ');
}

/**
 * 앱 공통 모달: 화면 중앙, 카드 전체 높이는 뷰포트에 맞추고 긴 내용은 본문만 스크롤.
 * 스크롤바는 모달 전용(얇고 트랙 거의 없음) 스타일.
 */
export function AppModal({ centered = true, classNames, styles, ...rest }: ModalProps) {
  const bodyExtra = typeof classNames?.body === 'string' ? classNames.body : undefined;
  const contentExtra = typeof classNames?.content === 'string' ? classNames.content : undefined;
  return (
    <Modal
      centered={centered}
      classNames={{
        ...classNames,
        content: mergeClass(contentExtra, APP_MODAL_CONTENT),
        body: mergeClass(bodyExtra, APP_MODAL_BODY_SCROLL),
      }}
      styles={{
        ...styles,
        body: {
          flex: 1,
          minHeight: 0,
          maxHeight: 'none',
          ...styles?.body,
        },
      }}
      {...rest}
    />
  );
}
