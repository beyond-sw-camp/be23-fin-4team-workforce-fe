import {
  BankOutlined,
  CalendarOutlined,
  CarryOutOutlined,
  IdcardOutlined,
  MessageOutlined,
  MoreOutlined,
  RiseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Avatar, Button, Dropdown, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { EMPLOYMENT_TYPE_KO, MEMBER_STATUS_KO } from '@/app/locale/app-ko';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi } from '@/features/member/api/memberApi';
import { useHrAccess } from '@/features/permissions/useHrAccess';

function memberStatusValueClass(status: string | undefined): string {
  if (status === 'ACTIVE') return 'tw-text-emerald-600';
  if (status === 'DORMANT') return 'tw-text-amber-600';
  if (status === 'LEAVE') return 'tw-text-slate-500';
  return 'tw-text-slate-900';
}

function memberStatusDisplay(status: string | undefined): string {
  if (!status) return '—';
  if (status === 'ACTIVE') return '재직 중';
  const ko = MEMBER_STATUS_KO[status as keyof typeof MEMBER_STATUS_KO];
  return ko ?? status;
}

function memberStatusDotClass(status: string | undefined): string {
  if (status === 'ACTIVE') return 'tw-bg-emerald-500';
  if (status === 'DORMANT') return 'tw-bg-amber-400';
  if (status === 'LEAVE') return 'tw-bg-slate-400';
  return 'tw-bg-slate-300';
}

function initialsFromName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  if (t.length >= 2) return t.slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

function InfoRow({
  icon,
  label,
  value,
  valueClassName,
  valueTitle,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  valueTitle?: string;
}) {
  return (
    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-py-2.5 tw-text-sm">
      <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2.5 tw-text-slate-500">
        <span className="tw-flex tw-size-4 tw-shrink-0 tw-items-center tw-justify-center tw-text-[15px] tw-leading-none tw-text-slate-400">
          {icon}
        </span>
        <span className="tw-shrink-0">{label}</span>
      </div>
      <div
        className={`tw-min-w-0 tw-truncate tw-text-right tw-text-sm tw-font-medium tw-text-slate-900 ${valueClassName ?? ''}`}
        title={valueTitle}
      >
        {value}
      </div>
    </div>
  );
}

export function OrgChartMemberSidePanel({
  memberId,
  chartMemberStatus,
  onOpenMessenger,
  onClose,
}: {
  memberId: string | null;
  /** 상세 API에 memberStatus가 없을 때 조직도 응답 값으로 보완 */
  chartMemberStatus?: string;
  /** 메신저(1:1) 플로팅 창을 열고 해당 멤버와 대화로 진입 */
  onOpenMessenger?: (targetMemberId: string) => void;
  /** 구성원 상세로 이동할 때 조직도 모달을 닫기 위해 사용 */
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAccessMemberDirectory } = useHrAccess();
  const { data: member, isLoading, isError } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId!),
    enabled: Boolean(memberId),
    staleTime: 30_000,
  });

  if (!memberId) {
    return (
      <div className="tw-flex tw-h-full tw-min-h-[200px] tw-flex-col tw-items-center tw-justify-center tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-white/80 tw-px-3 tw-py-6">
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
  const isSelf = user?.id && member.memberId && user.id === member.memberId;
  const canMessenger = Boolean(onOpenMessenger && member.memberId && !isSelf);
  const canOpenMemberDetail = canAccessMemberDirectory && Boolean(member.memberId);

  const orgLine =
    member.organizationName || member.jobTitleName
      ? [member.organizationName, member.jobTitleName].filter(Boolean).join(' \u2022 ')
      : null;

  const goMemberDetail = () => {
    if (!member.memberId) return;
    void navigate({ to: '/app/members/$memberId', params: { memberId: member.memberId } });
    onClose?.();
  };

  const showActionRow = canMessenger || canOpenMemberDetail;

  return (
    <div className="tw-flex tw-flex-col tw-gap-0">
      <div className="tw-flex tw-flex-col tw-items-center tw-px-1 tw-pt-2">
        <div className="tw-relative tw-mb-4">
          <Avatar
            shape="square"
            size={88}
            src={member.profileUrl || undefined}
            className={
              member.profileUrl
                ? '[&_img]:tw-object-cover !tw-rounded-3xl tw-shadow-sm'
                : '!tw-rounded-3xl !tw-bg-sky-100 !tw-text-[22px] !tw-font-bold !tw-text-blue-600 tw-shadow-sm'
            }
          >
            {initialsFromName(member.name)}
          </Avatar>
          <span
            className={`tw-pointer-events-none tw-absolute tw-bottom-0.5 tw-right-0.5 tw-size-4 tw-rounded-full tw-border-[3px] tw-border-white tw-shadow-sm ${memberStatusDotClass(employmentStatus)}`}
            aria-hidden
          />
        </div>

        <div className="tw-flex tw-w-full tw-flex-wrap tw-items-center tw-justify-center tw-gap-2">
          <h3 className="tw-m-0 tw-text-center tw-text-xl tw-font-bold tw-leading-tight tw-tracking-tight tw-text-slate-900">
            {member.name}
          </h3>
          {member.jobGradeName ? (
            <span className="tw-rounded-md tw-bg-slate-100 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-text-slate-600">
              {member.jobGradeName}
            </span>
          ) : null}
        </div>

        {orgLine ? (
          <div className="tw-mt-2 tw-flex tw-max-w-full tw-items-start tw-justify-center tw-gap-1.5 tw-text-center tw-text-sm tw-text-slate-500">
            <BankOutlined className="tw-mt-0.5 tw-shrink-0 tw-text-slate-400" />
            <span className="tw-leading-snug">{orgLine}</span>
          </div>
        ) : null}

        {showActionRow ? (
          <div
            className={`tw-mt-5 tw-flex tw-w-full tw-min-w-0 tw-flex-nowrap tw-items-center tw-gap-2 ${
              !canMessenger && canOpenMemberDetail ? 'tw-justify-end' : ''
            }`}
          >
            {canMessenger ? (
              <Button
                type="primary"
                size="large"
                icon={<MessageOutlined />}
                className="tw-h-11 tw-min-h-11 tw-min-w-0 tw-flex-1 !tw-rounded-xl !tw-border-0 !tw-bg-blue-600 !tw-font-semibold tw-shadow-md tw-shadow-blue-600/20 hover:!tw-bg-blue-700"
                onClick={() => onOpenMessenger?.(member.memberId)}
              >
                메신저 보내기
              </Button>
            ) : null}
            {canOpenMemberDetail ? (
              <span className="tw-inline-flex tw-shrink-0 tw-items-center tw-self-center">
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  getPopupContainer={() => document.body}
                  menu={{
                    items: [{ key: 'detail', label: '구성원 상세' }],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      if (key === 'detail') goMemberDetail();
                    },
                  }}
                >
                  <Button
                    size="large"
                    icon={<MoreOutlined className="tw-text-slate-600" />}
                    className="!tw-size-11 !tw-h-11 !tw-min-h-11 !tw-min-w-11 !tw-rounded-xl !tw-border-slate-200 !tw-bg-white hover:!tw-border-slate-300 hover:!tw-bg-slate-50"
                    title="더보기"
                    aria-label="더보기 메뉴"
                    aria-haspopup="menu"
                  />
                </Dropdown>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="tw-my-6 tw-border-0 tw-border-t tw-border-solid tw-border-slate-200" role="separator" />

      <div>
        <div className="tw-mb-1 tw-text-xs tw-font-bold tw-tracking-wide tw-text-slate-500">근무 정보</div>
        <div className="tw-divide-y tw-divide-slate-100">
          <InfoRow icon={<IdcardOutlined />} label="사번" value={member.sabun || '—'} valueTitle={member.sabun || undefined} />
          <InfoRow icon={<CalendarOutlined />} label="입사일" value={member.joinDate} valueTitle={member.joinDate} />
          <InfoRow
            icon={<CarryOutOutlined />}
            label="고용 형태"
            value={EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType}
          />
          <InfoRow
            icon={<span className={`tw-inline-block tw-size-2 tw-rounded-full ${memberStatusDotClass(employmentStatus)}`} />}
            label="재직 상태"
            value={memberStatusDisplay(employmentStatus)}
            valueClassName={memberStatusValueClass(employmentStatus)}
          />
          <InfoRow icon={<BankOutlined />} label="조직" value={member.organizationName ?? '—'} />
          <InfoRow icon={<RiseOutlined />} label="직급" value={member.jobGradeName ?? '—'} />
          <InfoRow icon={<TeamOutlined />} label="직책" value={member.jobTitleName ?? '—'} />
        </div>
      </div>
    </div>
  );
}
