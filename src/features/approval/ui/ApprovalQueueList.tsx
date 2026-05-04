import { useMemo } from 'react';
import { Empty, List, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { approvalApi } from '../api/approvalApi';
import type { GoalApprovalBundle } from '../model/types';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';

const { Text } = Typography;

type Props = {
  onSelect: (bundle: GoalApprovalBundle) => void;
};

export function ApprovalQueueList({ onSelect }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['my-approval-queue'],
    queryFn: () => approvalApi.listMyQueue(),
  });

  const memberIds = useMemo(() => data.map((b) => b.requestedBy), [data]);
  const { labelFor } = useMemberDisplayNames(memberIds);

  if (!isLoading && data.length === 0) {
    return <AppEmptyIllustrated description="처리 대기 중인 승인 요청이 없습니다." />;
  }

  return (
    <List
      loading={isLoading}
      dataSource={data}
      renderItem={(b) => (
        <List.Item
          className="tw-cursor-pointer hover:tw-bg-slate-50 !tw-px-3 !tw-rounded-xl"
          onClick={() => onSelect(b)}
        >
          <List.Item.Meta
            title={
              <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap">
                <Tag
                  color="gold"
                  className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
                >
                  {b.cycleKey}
                </Tag>
                <Text strong className="!tw-text-[14px] !tw-text-slate-900">
                  {labelFor(b.requestedBy)}
                </Text>
                {b.revision > 1 && (
                  <Tag
                    bordered={false}
                    className="!tw-m-0 !tw-rounded-full !tw-bg-amber-50 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-amber-700"
                  >
                    재상신 r{b.revision}
                  </Tag>
                )}
              </div>
            }
            description={
              <div className="tw-flex tw-items-center tw-gap-3 tw-text-sm tw-text-slate-500">
                <span>목표 {b.goalIds.length}개</span>
                <span className="tw-inline-flex tw-h-5 tw-items-center tw-rounded-full tw-bg-emerald-50 tw-px-2 tw-text-[11px] tw-font-semibold tw-text-emerald-700">
                  {b.weightSumSnapshot}%
                </span>
                <span className="tw-text-xs tw-text-slate-400">
                  {b.requestedAt ? new Date(b.requestedAt).toLocaleString('ko-KR') : ''}
                </span>
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
}
