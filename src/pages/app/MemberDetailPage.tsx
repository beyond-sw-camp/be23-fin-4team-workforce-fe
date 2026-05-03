import {
  BankOutlined,
  CalendarOutlined,
  CarryOutOutlined,
  EditOutlined,
  HistoryOutlined,
  IdcardOutlined,
  MailOutlined,
  PauseCircleOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Alert, Avatar, Card, Spin, Table, Tag, Typography } from 'antd';
import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  ACCOUNT_STATUS_KO,
  EMPLOYMENT_TYPE_KO,
  MEMBER_HISTORY_CHANGE_TYPE_KO,
  MEMBER_STATUS_KO,
} from '@/app/locale/app-ko';
import { memberApi, type MemberHistoryItem } from '@/features/member/api/memberApi';
import { DetailPageHeader } from '@/shared/ui/DetailPageHeader';
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { AppButton } from '@/shared/ui/AppButton';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { twMerge } from 'tailwind-merge';

function memberStatusLabel(code: string | undefined): string {
  if (!code?.trim()) return '—';
  const k = code.trim().toUpperCase() as keyof typeof MEMBER_STATUS_KO;
  return MEMBER_STATUS_KO[k] ?? code;
}

function accountStatusLabel(code: string | undefined): string {
  if (!code?.trim()) return '—';
  const k = code.trim().toUpperCase() as keyof typeof ACCOUNT_STATUS_KO;
  return ACCOUNT_STATUS_KO[k] ?? code;
}

function initialsFromName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  if (t.length >= 2) return t.slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

function memberStatusDotClass(code: string | undefined): string {
  const u = code?.trim().toUpperCase();
  if (u === 'ACTIVE') return 'tw-bg-emerald-500';
  if (u === 'DORMANT') return 'tw-bg-amber-400';
  if (u === 'LEAVE') return 'tw-bg-slate-400';
  return 'tw-bg-slate-300';
}

function ProfileInfoRow({
  icon,
  label,
  value,
  valueTitle,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueTitle?: string;
}) {
  return (
    <div className="tw-flex tw-items-start tw-justify-between tw-gap-4 tw-py-2.5 tw-text-sm">
      <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2.5 tw-text-slate-500">
        <span className="tw-flex tw-size-4 tw-shrink-0 tw-items-center tw-justify-center tw-text-[15px] tw-leading-none tw-text-slate-400">
          {icon}
        </span>
        <span className="tw-shrink-0">{label}</span>
      </div>
      <div
        className="tw-min-w-0 tw-max-w-[70%] tw-break-words tw-text-right tw-text-sm tw-font-semibold tw-text-slate-900"
        title={valueTitle}
      >
        {value}
      </div>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="tw-pt-1">
      <div className="tw-mb-2 tw-text-xs tw-font-bold tw-tracking-wide tw-text-slate-500">{title}</div>
      <div className="tw-divide-y tw-divide-slate-100">{children}</div>
    </div>
  );
}

export function MemberDetailPage() {
  const { memberId } = useParams({ strict: false }) as { memberId: string };
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { hasPermission } = usePermissions();

  const canOpenMemberHistory =
    hasPermission(PERM.MEMBER_READ) ||
    hasPermission(PERM.MEMBER_CREATE) ||
    hasPermission(PERM.MEMBER_UPDATE);

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId),
  });

  const historyQuery = useQuery({
    queryKey: ['member', 'history', memberId],
    queryFn: () => memberApi.getMemberHistory(memberId),
    enabled: historyOpen && Boolean(memberId?.trim()),
  });

  const refreshDetail = () => queryClient.invalidateQueries({ queryKey: ['member', 'detail', memberId] });

  const unlockMutation = useMutation({
    mutationFn: () => memberApi.unlock(memberId),
    onSuccess: () => void refreshDetail(),
  });
  const dormantMutation = useMutation({
    mutationFn: () => memberApi.leave(memberId),
    onSuccess: () => void refreshDetail(),
  });
  const returnMutation = useMutation({
    mutationFn: () => memberApi.returnFromLeave(memberId),
    onSuccess: () => void refreshDetail(),
  });

  if (isLoading) {
    return (
      <div className="tw-flex tw-w-full tw-min-h-[40vh] tw-items-center tw-justify-center tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-sm">
        <Spin size="large" />
      </div>
    );
  }

  if (!member) {
    return (
      <Alert type="warning" showIcon message="구성원 정보를 찾을 수 없습니다." className="tw-w-full tw-rounded-2xl" />
    );
  }

  const orgTitleLine =
    member.organizationName || member.jobTitleName
      ? [member.organizationName, member.jobTitleName].filter(Boolean).join(' \u2022 ')
      : null;
  const profileSrc = member.profileUrl?.trim() || undefined;

  return (
    <div className="tw-w-full">
      <DetailPageHeader shareTitle={`${member.name} — 구성원 상세`} shareText={member.email} />

      <div className="tw-flex tw-w-full tw-flex-col tw-gap-6 lg:tw-flex-row lg:tw-items-start lg:tw-gap-8">
        <aside className="tw-w-full tw-shrink-0 lg:tw-sticky lg:tw-top-4 lg:tw-w-[min(100%,560px)]">
          <div className="tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-sm">
            <div className="tw-border-b tw-border-slate-100 tw-bg-slate-50/40 tw-px-5 tw-pb-5 tw-pt-4">
              <div className="tw-flex tw-flex-col tw-items-center tw-px-1 tw-pt-2">
                <div className="tw-relative tw-mb-4">
                  <Avatar
                    shape="square"
                    size={88}
                    src={profileSrc}
                    className={
                      profileSrc
                        ? '[&_img]:tw-object-cover !tw-rounded-3xl tw-shadow-sm'
                        : '!tw-rounded-3xl !tw-bg-sky-100 !tw-text-[22px] !tw-font-bold !tw-text-blue-600 tw-shadow-sm'
                    }
                  >
                    {initialsFromName(member.name)}
                  </Avatar>
                  <span
                    className={`tw-pointer-events-none tw-absolute tw-bottom-0.5 tw-right-0.5 tw-size-4 tw-rounded-full tw-border-[3px] tw-border-white tw-shadow-sm ${memberStatusDotClass(member.memberStatus)}`}
                    aria-hidden
                  />
                </div>
                <div className="tw-flex tw-w-full tw-flex-wrap tw-items-center tw-justify-center tw-gap-2">
                  <h2 className="tw-m-0 tw-text-center tw-text-xl tw-font-bold tw-leading-tight tw-tracking-tight tw-text-slate-900">
                    {member.name}
                  </h2>
                  {member.jobGradeName ? (
                    <span className="tw-rounded-md tw-bg-slate-100 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-text-slate-600">
                      {member.jobGradeName}
                    </span>
                  ) : null}
                </div>
                {orgTitleLine ? (
                  <div className="tw-mt-2 tw-flex tw-max-w-full tw-items-start tw-justify-center tw-gap-1.5 tw-text-center tw-text-sm tw-text-slate-500">
                    <BankOutlined className="tw-mt-0.5 tw-shrink-0 tw-text-slate-400" />
                    <span className="tw-leading-snug">{orgTitleLine}</span>
                  </div>
                ) : null}
                <p className="tw-mb-0 tw-mt-2 tw-text-center tw-text-xs tw-text-slate-500">
                  {memberStatusLabel(member.memberStatus)} · 계정 {accountStatusLabel(member.accountStatus)}
                </p>
              </div>
            </div>

            <div className="tw-space-y-6 tw-px-6 tw-py-5">
              <SectionBlock title="기본 정보">
                <ProfileInfoRow icon={<IdcardOutlined />} label="사번" value={member.sabun || '—'} />
                <ProfileInfoRow icon={<CalendarOutlined />} label="입사일" value={member.joinDate} />
                <ProfileInfoRow
                  icon={<CarryOutOutlined />}
                  label="고용 형태"
                  value={EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType}
                />
                <ProfileInfoRow icon={<BankOutlined />} label="조직" value={member.organizationName ?? '—'} />
                <ProfileInfoRow icon={<RiseOutlined />} label="직급" value={member.jobGradeName ?? '—'} />
                <ProfileInfoRow icon={<TeamOutlined />} label="직책" value={member.jobTitleName ?? '—'} />
                <ProfileInfoRow icon={<SafetyCertificateOutlined />} label="역할" value={member.roleName ?? '—'} />
              </SectionBlock>

              <SectionBlock title="연락·식별">
                <ProfileInfoRow icon={<MailOutlined />} label="이메일" value={member.email} valueTitle={member.email} />
              </SectionBlock>
            </div>

            {(canOpenMemberHistory || hasPermission(PERM.MEMBER_UPDATE)) ? (
              <div className="tw-space-y-2 tw-border-t tw-border-slate-100 tw-bg-slate-50/30 tw-px-6 tw-py-5">
                <PermissionGuard required={PERM.MEMBER_UPDATE}>
                  <Link
                    to="/app/members/$memberId/edit"
                    params={{ memberId }}
                    className={twMerge(
                      membersCtaButtonClass,
                      'tw-box-border tw-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-text-[15px] tw-font-semibold tw-text-white tw-no-underline hover:tw-text-white',
                    )}
                  >
                    <EditOutlined />
                    인사 정보 수정
                  </Link>
                </PermissionGuard>
                {canOpenMemberHistory ? (
                  <AppButton
                    variant="secondary"
                    className="tw-w-full !tw-font-bold"
                    icon={<HistoryOutlined />}
                    onClick={() => setHistoryOpen(true)}
                  >
                    직원 이력 보기
                  </AppButton>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="tw-min-w-0 tw-flex-1">
          <Card
            className="tw-overflow-hidden tw-rounded-2xl tw-border-slate-200 tw-shadow-sm"
            title={<span className="tw-text-base tw-font-bold tw-text-slate-900">계정·인사 조치</span>}
            styles={{ body: { paddingTop: 16 } }}
          >
            <div className="tw-flex tw-flex-wrap tw-gap-2">
              <AppButton
                variant="secondary"
                loading={unlockMutation.isPending}
                disabled={member.accountStatus?.toUpperCase() !== 'BLOCKED'}
                icon={<UnlockOutlined />}
                onClick={() => void unlockMutation.mutateAsync()}
              >
                잠금 해제
              </AppButton>
              <AppButton
                variant="secondary"
                loading={dormantMutation.isPending}
                disabled={member.memberStatus?.toUpperCase() !== 'ACTIVE'}
                icon={<PauseCircleOutlined className="tw-text-amber-600" />}
                onClick={() => void dormantMutation.mutateAsync()}
              >
                휴직 처리
              </AppButton>
              <AppButton
                variant="secondary"
                loading={returnMutation.isPending}
                disabled={member.memberStatus?.toUpperCase() !== 'DORMANT'}
                onClick={() => void returnMutation.mutateAsync()}
              >
                복직 처리
              </AppButton>
            </div>
            <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-4 !tw-text-xs tw-leading-relaxed">
              휴직 또는 복직 처리 시 해당 구성원의 서비스 접속 권한이 즉시 변경됩니다.
            </Typography.Paragraph>
          </Card>
        </main>
      </div>

      <AppSingleActionModal
        title={
          <span>
            직원 인사 이력
            <Typography.Text type="secondary" className="tw-ml-2 tw-text-sm tw-font-normal">
              {member.name}
            </Typography.Text>
          </span>
        }
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSubmit={() => setHistoryOpen(false)}
        submitText="닫기"
        width={960}
        destroyOnHidden
      >
        <div className="tw-max-h-[min(85vh,800px)] tw-overflow-y-auto tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
          승진·부서 이동 등 인사 변경 이력입니다. 적용 종료일이 없으면 현재 적용 중인 이력입니다.
        </Typography.Paragraph>
        {historyQuery.isLoading ? (
          <div className="tw-flex tw-justify-center tw-py-12">
            <Spin />
          </div>
        ) : historyQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="이력을 불러오지 못했습니다."
            description={historyQuery.error instanceof Error ? historyQuery.error.message : String(historyQuery.error)}
          />
        ) : (
          <Table<MemberHistoryItem>
            rowKey={(r) => r.historyId || `${r.effectiveFrom}-${r.changeType}`}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1280 }}
            dataSource={historyQuery.data ?? []}
            columns={[
              {
                title: '변경 유형',
                dataIndex: 'changeType',
                width: 112,
                ellipsis: true,
                render: (t: string) => MEMBER_HISTORY_CHANGE_TYPE_KO[t] ?? t,
              },
              { title: '직원', dataIndex: 'memberName', width: 88, ellipsis: true },
              { title: '조직', dataIndex: 'organizationName', width: 120, ellipsis: true },
              { title: '직급', dataIndex: 'jobGradeName', width: 80, ellipsis: true },
              {
                title: '고용',
                dataIndex: 'employmentType',
                width: 88,
                render: (t: string) => EMPLOYMENT_TYPE_KO[t] ?? t,
              },
              { title: '사유', dataIndex: 'changeReason', ellipsis: true },
              { title: '변경 담당', dataIndex: 'changerName', width: 96, ellipsis: true },
              { title: '적용 시작', dataIndex: 'effectiveFrom', width: 108 },
              {
                title: '적용 종료',
                dataIndex: 'effectiveTo',
                width: 108,
                render: (v: string | null) => (v == null || v === '' ? <Tag color="processing">현재</Tag> : v),
              },
              {
                title: '승진일',
                dataIndex: 'promotionDate',
                width: 108,
                render: (v: string | null) => (v == null || v === '' ? '—' : v),
              },
              {
                title: '변경 일시',
                dataIndex: 'changedAt',
                width: 148,
                render: (v: string) => {
                  const d = dayjs(v);
                  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v || '—';
                },
              },
            ]}
          />
        )}
        </div>
      </AppSingleActionModal>
    </div>
  );
}
