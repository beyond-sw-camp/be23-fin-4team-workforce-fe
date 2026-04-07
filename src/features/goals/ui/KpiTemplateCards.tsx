import { Spin, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { KpiCycle, KpiTemplate, MeasureType, UnitType } from '@/features/goals/model/types';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppPagination, appPaginationShowTotalLabel } from '@/shared/ui/AppPagination';

const { Text, Paragraph } = Typography;

const MEASURE_LABEL: Record<MeasureType, string> = {
  HIGHER_BETTER: '높을수록 유리',
  LOWER_BETTER: '낮을수록 유리',
  TARGET_MATCH: '목표 일치',
};

const UNIT_LABEL: Record<UnitType, string> = {
  NUMBER: '일반 수치',
  AMOUNT: '금액',
  PERCENTAGE: '백분율(%)',
  RATIO: '비율',
  CUSTOM: '사용자 정의',
};

const CYCLE_LABEL: Record<KpiCycle, string> = {
  MONTHLY: '월간',
  QUARTERLY: '분기',
  HALF_YEARLY: '반기',
  YEARLY: '연간',
};

export type KpiTemplateCardsProps = {
  templates: KpiTemplate[];
  loading?: boolean;
  emptyMessage: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
};

export function KpiTemplateCards({
  templates,
  loading,
  emptyMessage,
  pageSizeOptions = [12, 24, 48],
  defaultPageSize = 12,
}: KpiTemplateCardsProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const total = templates.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return templates.slice(start, start + pageSize);
  }, [templates, page, pageSize]);

  if (loading) {
    return (
      <div className="tw-flex tw-min-h-[240px] tw-items-center tw-justify-center tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200/90 tw-bg-[#fafbfc]">
        <Spin />
      </div>
    );
  }

  if (!total) {
    return (
      <AppEmptyIllustrated
        description={
          <div className="tw-max-w-lg tw-px-2 tw-text-center tw-mx-auto">
            <Paragraph className="!tw-mb-0 !tw-text-sm !tw-font-normal !tw-leading-relaxed !tw-text-slate-600">
              {emptyMessage}
            </Paragraph>
          </div>
        }
      />
    );
  }

  return (
    <div className="tw-flex tw-flex-col">
      <div className="tw-flex tw-flex-col">
        {slice.map((tpl) => (
          <div
            key={tpl.id}
            className="tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-py-5 last:tw-border-b-0"
          >
            <Tag className="!tw-m-0 tw-border-slate-200 tw-bg-slate-50 tw-text-slate-600">
              {CYCLE_LABEL[tpl.cycle] ?? tpl.cycle}
            </Tag>
            <div className="tw-mt-3 tw-text-lg tw-font-bold tw-leading-snug tw-text-[#1e3a5f]">{tpl.name}</div>
            <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-x-6 tw-gap-y-2 tw-text-sm">
              <div>
                <Text type="secondary" className="tw-mr-2 tw-text-xs">
                  측정
                </Text>
                <Tag className="!tw-m-0">{MEASURE_LABEL[tpl.measureType] ?? tpl.measureType}</Tag>
              </div>
              <div>
                <Text type="secondary" className="tw-mr-2 tw-text-xs">
                  단위
                </Text>
                <Text className="tw-text-slate-700">{UNIT_LABEL[tpl.unitType] ?? tpl.unitType}</Text>
              </div>
              <div>
                <Text type="secondary" className="tw-mr-2 tw-text-xs">
                  상한
                </Text>
                <Text className="tw-font-medium tw-tabular-nums tw-text-[#1e3a5f]">
                  {tpl.capPct != null ? `${tpl.capPct}%` : '—'}
                </Text>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AppPagination
        wrapClassName="tw-mt-1"
        current={page}
        pageSize={pageSize}
        total={total}
        showSizeChanger
        pageSizeOptions={pageSizeOptions.map(String)}
        onChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        showTotal={appPaginationShowTotalLabel}
      />
    </div>
  );
}
