/** /app/attendance/corrections — 관리자 정정 검토 큐
 *
 *  closureStatus = UNDER_REVIEW 인 DA + 정정 사유를 한 표에 보여주고
 *  승인/반려 액션을 제공한다.
 *  - 승인: 재계산 + FINALIZED 직행
 *  - 반려: 정정 로그 삭제 + firstClockIn/lastClockOut 원본 복구 + OPEN 복귀
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { useMemo, useState } from 'react';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { AttendanceCorrectionPending } from '@/features/salary-service/types';

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('MM-DD HH:mm') : String(iso);
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('HH:mm') : String(iso);
}

export function AdminAttendanceCorrectionPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const pendingQ = useQuery({
    queryKey: ['salary', 'attendance', 'correction', 'pending'],
    queryFn: () => attendanceApi.attendance.correction.listPending(),
  });

  // 직원 이름 매핑 — 회사 전체 직원 1회 로드 후 memberId → name
  const membersQ = useQuery({
    queryKey: ['members', 'all', 'for-correction'],
    queryFn: () => membersApi.list({ page: 1, pageSize: 500 }),
    staleTime: 60_000,
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    const list = membersQ.data?.items ?? [];
    list.forEach((m) => {
      if (m.id) map.set(m.id, m);
    });
    return map;
  }, [membersQ.data]);

  const approveMut = useMutation({
    mutationFn: (daId: string) => attendanceApi.attendance.correction.approve(daId),
    onSuccess: () => {
      void message.success('정정 신청을 승인했습니다.');
      void queryClient.invalidateQueries({
        queryKey: ['salary', 'attendance', 'correction', 'pending'],
      });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '승인에 실패했습니다.');
    },
  });

  const rejectMut = useMutation({
    mutationFn: (params: { daId: string; reason: string }) =>
      attendanceApi.attendance.correction.reject(params.daId, params.reason),
    onSuccess: () => {
      void message.success('정정 신청을 반려했습니다.');
      void queryClient.invalidateQueries({
        queryKey: ['salary', 'attendance', 'correction', 'pending'],
      });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '반려에 실패했습니다.');
    },
  });

  // 반려 사유 입력용 모달 상태
  const [rejectTarget, setRejectTarget] = useState<AttendanceCorrectionPending | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const columns: ColumnsType<AttendanceCorrectionPending> = useMemo(
    () => [
      {
        title: '직원',
        dataIndex: 'memberId',
        key: 'memberId',
        render: (memberId: string) => {
          const m = memberMap.get(memberId);
          if (!m) return <Typography.Text type="secondary">{memberId.slice(0, 8)}…</Typography.Text>;
          return (
            <Space size={4}>
              <Typography.Text strong>{m.name}</Typography.Text>
              {m.employeeNumber && (
                <Typography.Text type="secondary" className="!tw-text-xs">
                  ({m.employeeNumber})
                </Typography.Text>
              )}
            </Space>
          );
        },
      },
      {
        title: '근태 일자',
        dataIndex: 'attendanceDate',
        key: 'attendanceDate',
      },
      {
        title: '신청 출근',
        dataIndex: 'requestedClockIn',
        key: 'requestedClockIn',
        render: (v?: string | null) => formatTime(v),
      },
      {
        title: '신청 퇴근',
        dataIndex: 'requestedClockOut',
        key: 'requestedClockOut',
        render: (v?: string | null) => formatTime(v),
      },
      {
        title: '사유',
        dataIndex: 'reason',
        key: 'reason',
        ellipsis: true,
        render: (r?: string | null) =>
          r ? (
            <Tooltip title={r}>
              <span>{r}</span>
            </Tooltip>
          ) : (
            '—'
          ),
      },
      {
        title: '신청 시점',
        dataIndex: 'requestedAt',
        key: 'requestedAt',
        render: (v?: string | null) => formatDt(v),
      },
      {
        title: <Tag color="gold">검토중</Tag>,
        key: 'status',
        width: 90,
        render: () => <Tag color="gold">검토중</Tag>,
      },
      {
        title: '액션',
        key: 'action',
        width: 180,
        render: (_, row) => (
          <Space size={4}>
            <Popconfirm
              title="정정 신청 승인"
              description="해당 일자 근태가 즉시 확정 처리됩니다."
              okText="승인"
              cancelText="취소"
              onConfirm={() => approveMut.mutate(row.dailyAttendanceId)}
            >
              <Button size="small" type="primary">
                승인
              </Button>
            </Popconfirm>
            <Button
              size="small"
              danger
              onClick={() => {
                setRejectTarget(row);
                setRejectReason('');
              }}
            >
              반려
            </Button>
          </Space>
        ),
      },
    ],
    [memberMap, approveMut],
  );

  return (
    <div className="tw-space-y-4">
      <AppWorkspacePageTitle
        eyebrow="Attendance"
        title="출퇴근 정정 검토"
        subtitle={(
          <>
            직원이 신청한 출퇴근 정정을 검토합니다. <b>승인</b> 시 해당 일자 근태가 즉시 확정 처리되고, <b>반려</b> 시 신청 전 상태로 복구됩니다.
            <br />
            ※ 정정 검토 중인 근태 데이터는 자동 처리(익일 2시와 14시)대상이 아니므로 주의해서 처리하세요.
          </>
        )}
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="검토 대기 목록">
        {pendingQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="정정 검토 큐 조회에 실패했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        )}
        <Table<AttendanceCorrectionPending>
          rowKey={(r) => r.dailyAttendanceId}
          loading={pendingQ.isLoading}
          columns={columns}
          dataSource={pendingQ.data ?? []}
          size="small"
          pagination={{ pageSize: 20 }}
          locale={{
            emptyText: <Empty description="검토 대기 중인 정정 신청이 없습니다." />,
          }}
        />
      </Card>

      {/* 반려 사유 입력 모달 */}
      <AppDoubleActionModal
        open={Boolean(rejectTarget)}
        title="정정 신청 반려"
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (!rejectTarget) return;
          if (!rejectReason.trim()) {
            void message.error('반려 사유를 입력해 주세요.');
            return;
          }
          rejectMut.mutate(
            { daId: rejectTarget.dailyAttendanceId, reason: rejectReason },
            {
              onSuccess: () => {
                setRejectTarget(null);
                setRejectReason('');
              },
            },
          );
        }}
        confirmText="반려"
        confirmDanger
        cancelText="취소"
        confirmLoading={rejectMut.isPending}
      >
        <div className="tw-px-5 tw-py-4">
        <Alert
          type="warning"
          showIcon
          className="tw-mb-3"
          message="반려 시 정정 신청 내용이 삭제되고 신청 전 상태로 복구됩니다."
        />
        <Typography.Paragraph className="!tw-mb-2 !tw-text-sm">
          <b>{rejectTarget?.attendanceDate}</b> · 사유: {rejectTarget?.reason ?? '—'}
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          placeholder="반려 사유를 입력하세요. (예: 외근 결재가 누락됨)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={200}
          showCount
        />
        </div>
      </AppDoubleActionModal>
    </div>
  );
}
