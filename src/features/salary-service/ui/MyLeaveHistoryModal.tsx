import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, Modal, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { LeaveRequest } from '@/features/salary-service/types';

// 본인 휴가 신청 이력 모달
// 내 근태 [전체 보기] + 대시보드 휴가 위젯 [휴가 이력] 양쪽에서 재사용
export function MyLeaveHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const leaveHistoryQ = useQuery({
    queryKey: ['salary', 'leave-requests', 'my', 'history-modal'],
    queryFn: () => attendanceApi.leaveRequest.listMyHistory({ page: 0, size: 200 }),
    enabled: open,
  });
  const leaveTypesQ = useQuery({
    queryKey: ['attendance', 'company-leave-types'],
    queryFn: () => attendanceApi.companyLeaveType.list(),
    enabled: open,
  });
  const leaveTypeNameById = useMemo(() => {
    const m = new Map<string, string>();
    (leaveTypesQ.data ?? []).forEach((t) => {
      if (t.companyLeaveTypeId) m.set(t.companyLeaveTypeId, t.name ?? '-');
    });
    return m;
  }, [leaveTypesQ.data]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="내 휴가 신청 이력"
      footer={null}
      width={920}
      destroyOnHidden
    >
      <Table<LeaveRequest>
        rowKey={(r) => r.leaveRequestId ?? `${r.startDate}-${r.requestedAt}`}
        loading={leaveHistoryQ.isLoading || leaveTypesQ.isLoading}
        dataSource={leaveHistoryQ.data?.content ?? []}
        pagination={{ pageSize: 15 }}
        size="small"
        locale={{ emptyText: <Empty description="휴가 신청 이력이 없습니다" /> }}
        columns={[
          {
            title: '신청일',
            dataIndex: 'requestedAt',
            key: 'requestedAt',
            width: 130,
            render: (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
          },
          {
            title: '휴가 종류',
            dataIndex: 'companyLeaveTypeId',
            key: 'leaveType',
            width: 120,
            render: (id?: string) => leaveTypeNameById.get(id ?? '') ?? '-',
          },
          {
            title: '기간 / 사용 날짜',
            key: 'range',
            render: (_: unknown, r: LeaveRequest) => {
              const planned = Array.isArray(r.plannedDates) && r.plannedDates.length > 0
                ? [...r.plannedDates].sort()
                : null;
              if (planned) {
                const text = planned
                  .map((d) => {
                    const dj = dayjs(d);
                    return dj.isValid() ? dj.format('M/D') : d;
                  })
                  .join(', ');
                return <Tooltip title={planned.join(', ')}>{text}</Tooltip>;
              }
              if (!r.startDate) return '-';
              if (!r.endDate || r.startDate === r.endDate) return r.startDate;
              return `${r.startDate} ~ ${r.endDate}`;
            },
          },
          {
            title: '일수',
            dataIndex: 'usageDays',
            key: 'usageDays',
            width: 70,
            align: 'right',
            render: (v?: number | null) => (v != null ? `${v}일` : '-'),
          },
          {
            title: '상태',
            dataIndex: 'approvalStatus',
            key: 'status',
            width: 90,
            align: 'center',
            render: (v?: string) => {
              const code = v ?? '';
              const colorMap: Record<string, string> = {
                PENDING: 'gold',
                APPROVED: 'green',
                REJECTED: 'red',
                CANCELLED: 'default',
              };
              const labelMap: Record<string, string> = {
                PENDING: '대기',
                APPROVED: '승인',
                REJECTED: '반려',
                CANCELLED: '취소',
              };
              return <Tag color={colorMap[code] ?? 'default'}>{labelMap[code] ?? code}</Tag>;
            },
          },
          {
            title: '사유',
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
            render: (v?: string | null) => v || '-',
          },
        ]}
      />
    </Modal>
  );
}
