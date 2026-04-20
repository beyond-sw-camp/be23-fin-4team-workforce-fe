import { Alert, Card, Descriptions, Modal, Space, Spin, Table, Tag, Typography } from 'antd';
import { useParams, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  ACCOUNT_STATUS_KO,
  EMPLOYMENT_TYPE_KO,
  MEMBER_HISTORY_CHANGE_TYPE_KO,
  MEMBER_STATUS_KO,
} from '@/app/locale/app-ko';
import { memberApi, type MemberHistoryItem } from '@/features/member/api/memberApi';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { AppButton } from '@/shared/ui/AppButton';

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

export function MemberDetailPage() {
  const { memberId } = useParams({ strict: false }) as { memberId: string };
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { hasPermission } = usePermissions();

  /** 직원 이력: MEMBER:READ 없이 생성·수정만 있어도 버튼 표시(인사팀) */
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
    return <Typography.Text type="secondary">불러오는 중…</Typography.Text>;
  }

  if (!member) {
    return <Alert type="warning" showIcon message="구성원 정보를 찾을 수 없습니다." />;
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Link
            to="/app/members"
            className="tw-mb-2 tw-inline-block tw-text-sm tw-text-slate-400 tw-no-underline hover:tw-text-slate-500 hover:tw-underline"
          >
            ← 뒤로가기
          </Link>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            구성원 상세
          </Typography.Title>
        </div>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
          {canOpenMemberHistory ? (
            <AppButton variant="secondary" onClick={() => setHistoryOpen(true)}>
              직원 이력
            </AppButton>
          ) : null}
          <PermissionGuard required={PERM.MEMBER_UPDATE}>
            <Link to="/app/members/$memberId/edit" params={{ memberId }} className="tw-inline-block">
              <AppButton variant="secondary">인사 정보 수정</AppButton>
            </Link>
          </PermissionGuard>
        </div>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="이름">{member.name}</Descriptions.Item>
          <Descriptions.Item label="이메일">{member.email}</Descriptions.Item>
          <Descriptions.Item label="사번">{member.sabun}</Descriptions.Item>
          <Descriptions.Item label="입사일">{member.joinDate}</Descriptions.Item>
          <Descriptions.Item label="고용 형태">
            {EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType}
          </Descriptions.Item>
          <Descriptions.Item label="재직 상태">
            <Tag
              color={
                member.memberStatus?.toUpperCase() === 'ACTIVE'
                  ? 'green'
                  : member.memberStatus?.toUpperCase() === 'DORMANT'
                    ? 'gold'
                    : 'volcano'
              }
            >
              {memberStatusLabel(member.memberStatus)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="계정 상태">
            <Tag
              color={
                member.accountStatus?.toUpperCase() === 'ACTIVE'
                  ? 'green'
                  : member.accountStatus?.toUpperCase() === 'BLOCKED'
                    ? 'red'
                    : 'default'
              }
            >
              {accountStatusLabel(member.accountStatus)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="조직">{member.organizationName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="직급">{member.jobGradeName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="직책">{member.jobTitleName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="역할">{member.roleName ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="계정·인사 조치">
        <Space wrap>
          <AppButton
            variant="secondary"
            loading={unlockMutation.isPending}
            disabled={member.accountStatus?.toUpperCase() !== 'BLOCKED'}
            onClick={() => void unlockMutation.mutateAsync()}
          >
            잠금 해제
          </AppButton>
          <AppButton
            variant="secondary"
            loading={dormantMutation.isPending}
            disabled={member.memberStatus?.toUpperCase() !== 'ACTIVE'}
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
        </Space>
      </Card>

      <Modal
        title={
          <span>
            직원 인사 이력
            <Typography.Text type="secondary" className="tw-ml-2 tw-text-sm tw-font-normal">
              {member.name}
            </Typography.Text>
          </span>
        }
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        width={960}
        destroyOnHidden
        centered
        className="[&_.ant-modal-body]:tw-max-h-[min(85vh,800px)] [&_.ant-modal-body]:tw-overflow-y-auto"
      >
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
                render: (v: string | null) =>
                  v == null || v === '' ? <Tag color="processing">현재</Tag> : v,
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
      </Modal>
    </Space>
  );
}
