import { DeleteOutlined } from '@ant-design/icons';

/**
 * 삭제된 메시지 자리표시.
 * Phase 3: 회색 톤 + 휴지통 아이콘으로 차분하게 정리.
 */
export function ChatDeletedBody() {
  return (
    <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm tw-italic tw-text-slate-400">
      <DeleteOutlined className="tw-text-[12px]" aria-hidden />
      삭제된 메시지입니다.
    </span>
  );
}
