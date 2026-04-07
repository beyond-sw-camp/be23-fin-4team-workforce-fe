import { Typography } from 'antd';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';

const { Paragraph } = Typography;

const bodyWrapClass = 'tw-max-w-lg tw-px-2 tw-text-center tw-mx-auto';

export type GoalsEmptyPanelProps = {
  title: string;
  hint: string;
};

/** 목표 리스트·보드 공통 빈 화면(일러스트 + 두 줄 멘트) */
export function GoalsEmptyPanel({ title, hint }: GoalsEmptyPanelProps) {
  const description = (
    <div className={`${bodyWrapClass} tw-space-y-2`}>
      <Paragraph className="!tw-mb-0 !tw-text-[15px] !tw-font-semibold !tw-leading-snug !tw-text-[#1e3a5f]">
        {title}
      </Paragraph>
      <Paragraph className="!tw-mb-0 !tw-text-sm !tw-font-normal !tw-leading-relaxed !tw-text-slate-500">
        {hint}
      </Paragraph>
    </div>
  );

  return <AppEmptyIllustrated description={description} />;
}
