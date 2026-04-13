import { useQuery } from '@tanstack/react-query';
import { Avatar, Descriptions, Spin, Tag, Typography } from 'antd';
import { EMPLOYMENT_TYPE_KO, MEMBER_STATUS_KO } from '@/app/locale/app-ko';
import { memberApi } from '@/features/member/api/memberApi';

function memberStatusTagColor(status: string | undefined): 'green' | 'gold' | 'volcano' | 'default' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'DORMANT') return 'gold';
  if (status === 'LEAVE') return 'volcano';
  return 'default';
}

function memberStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  const ko = MEMBER_STATUS_KO[status as keyof typeof MEMBER_STATUS_KO];
  return ko ?? status;
}

export function OrgChartMemberSidePanel({
  memberId,
  chartMemberStatus,
}: {
  memberId: string | null;
  /** 상세 API에 memberStatus가 없을 때 조직도 응답 값으로 보완 */
  chartMemberStatus?: string;
}) {
  const { data: member, isLoading, isError } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId!),
    enabled: Boolean(memberId),
    staleTime: 30_000,
  });

  if (!memberId) {
    return (
      <div className="tw-flex tw-h-full tw-min-h-[200px] tw-flex-col tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50/60 tw-px-3 tw-py-6">
        <Typography.Text type="secondary" className="tw-text-center tw-text-sm">
          조직도에서 직원 이름을 선택하면
          <br />
          기본 프로필이 여기에 표시됩니다.
        </Typography.Text>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="tw-flex tw-min-h-[200px] tw-items-center tw-justify-center tw-py-8">
        <Spin />
      </div>
    );
  }

  if (isError || !member) {
    return (
      <Typography.Text type="danger" className="tw-text-sm">
        구성원 정보를 불러오지 못했습니다.
      </Typography.Text>
    );
  }

  const employmentStatus = member.memberStatus ?? chartMemberStatus;

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <div className="tw-text-sm tw-font-semibold tw-text-slate-800">상세 조회</div>
      <div className="tw-flex tw-flex-col tw-items-center tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-4">
        <Avatar
          src={member.profileUrl || undefined}
          size={72}
          className={member.profileUrl ? '[&_img]:tw-object-cover' : 'tw-bg-slate-200 tw-text-slate-600'}
        >
          {(member.name?.[0] ?? '?').toUpperCase()}
        </Avatar>
        <div className="tw-text-center">
          <div className="tw-text-base tw-font-semibold tw-text-slate-900">{member.name}</div>
          <div className="tw-mt-0.5 tw-truncate tw-text-xs tw-text-slate-500" title={member.email}>
            {member.email}
          </div>
        </div>
      </div>
      <Descriptions
        bordered
        column={1}
        size="small"
        className="[&_.ant-descriptions-item-label]:tw-min-w-[6.75rem] [&_.ant-descriptions-item-label]:tw-whitespace-nowrap"
      >
        <Descriptions.Item label="사번">{member.sabun}</Descriptions.Item>
        <Descriptions.Item label="입사일">{member.joinDate}</Descriptions.Item>
        <Descriptions.Item label="고용 형태">
          {EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType}
        </Descriptions.Item>
        <Descriptions.Item label="재직 상태">
          <Tag color={memberStatusTagColor(employmentStatus)}>{memberStatusLabel(employmentStatus)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="조직">{member.organizationName ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="직급">{member.jobGradeName ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="직책">{member.jobTitleName ?? '—'}</Descriptions.Item>
      </Descriptions>
    </div>
  );
}
