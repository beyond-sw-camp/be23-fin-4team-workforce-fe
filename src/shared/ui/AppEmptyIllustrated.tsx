import { Empty } from 'antd';
import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

/** 목표/템플릿 빈 화면 등 공통 — 일러스트(SVG) 높이 기준 */
export const APP_EMPTY_ILLUSTRATED_IMAGE_HEIGHT_PX = 60;

/**
 * Ant Design `Empty.PRESENTED_IMAGE_SIMPLE` + 성과 화면과 동일한 카드·정렬·아이콘 크기
 */
export function AppEmptyIllustrated({
  description,
  className,
}: {
  description: ReactNode;
  className?: string;
}) {
  return (
    <Empty
      className={twMerge(
        'tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200/90 tw-bg-[#fafbfc] tw-py-16',
        '[&_.ant-empty-image]:!tw-mb-0 [&_.ant-empty-image]:!tw-flex [&_.ant-empty-image]:!tw-justify-center [&_.ant-empty-image]:!tw-items-center',
        '[&_.ant-empty-description]:!tw-mt-4 [&_.ant-empty-description]:!tw-max-w-none [&_.ant-empty-description]:!tw-w-full',
        '[&_.ant-empty-description]:!tw-flex [&_.ant-empty-description]:!tw-justify-center',
        className,
      )}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      styles={{ image: { height: APP_EMPTY_ILLUSTRATED_IMAGE_HEIGHT_PX } }}
      description={description}
    />
  );
}
