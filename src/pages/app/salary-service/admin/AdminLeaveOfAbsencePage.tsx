/**
 * /app/leave/absence — 휴직 관리자 (시스템 관리자)
 * 상태별 목록 + 조기 복직 처리.
 * 신청/결재 흐름은 전자결재 모듈에서 처리되므로 여기서는 조회와 조기 종료만.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  LeaveOfAbsence,
  LeaveOfAbsenceApprovalStatusCode,
  LeaveOfAbsenceTypeCode,
} from '@/features/salary-service/types';

const ACTIVE_STATUS: LeaveOfAbsenceApprovalStatusCode = 'ACTIVE';

const TYPE_KO: Record<LeaveOfAbsenceTypeCode, string> = {
  MATERNITY: '출산휴가',
  PATERNAL: '육아휴직',
  SICK: '장기병가',
  UNPAID: '무급휴직',
  STUDY: '학업휴직',
  MILITARY: '군복무',
};

const STATUS_COLOR: Record<LeaveOfAbsenceApprovalStatusCode, string> = {
  REQUESTED: 'gold',
  ACTIVE: 'blue',
  ENDED: 'default',
  REJECTED: 'red',
  CANCELLED: 'default',
};
const STATUS_LABEL: Record<LeaveOfAbsenceApprovalStatusCode, string> = {
  REQUESTED: '결재 대기',
  ACTIVE: '휴직 중',
  ENDED: '복직 완료',
  REJECTED: '반려',
  CANCELLED: '철회',
};

type EndFormValues = {
  actualEndDate: dayjs.Dayjs;
};

export function AdminLeaveOfAbsencePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [memberSearch, setMemberSearch] = useState('');
  const [target, setTarget] = useState<LeaveOfAbsence | null>(null);
  const [endForm] = Form.useForm<EndFormValues>();

  const QK = useMemo(() => ['salary', 'leave-of-absence', ACTIVE_STATUS] as const, []);

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.leaveOfAbsence.listByStatus(ACTIVE_STATUS),
  });

  // 직원 이름/부서/직책/직급 매핑용 회사 멤버 목록 5분 캐시
  const membersQ = useQuery({
    queryKey: ['members', 'list', 'leave-of-absence-name-map'],
    queryFn: () => membersApi.list({ page: 1, pageSize: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    membersQ.data?.items.forEach((m) => map.set(m.id, m));
    return map;
  }, [membersQ.data]);

  // 직원명·사유 부분문자열 필터 (검색어가 UUID 일 수도 있어 폴백 포함)
  const filteredList = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const rows = listQ.data ?? [];
    if (!q) return rows;
    return rows.filter((r) => {
      const m = r.memberId ? memberMap.get(r.memberId) : undefined;
      return (
        (r.memberId ?? '').toLowerCase().includes(q) ||
        (r.reason ?? '').toLowerCase().includes(q) ||
        (m?.name ?? '').toLowerCase().includes(q) ||
        (m?.department ?? '').toLowerCase().includes(q) ||
        (m?.jobTitleName ?? '').toLowerCase().includes(q) ||
        (m?.jobGradeName ?? '').toLowerCase().includes(q)
      );
    });
  }, [listQ.data, memberSearch, memberMap]);

  const endM = useMutation({
    mutationFn: (input: { id: string; actualEndDate: string }) =>
      attendanceApi.leaveOfAbsence.endEarly(input.id, input.actualEndDate),
    onSuccess: () => {
      message.success('휴직이 조기 종료 처리되었습니다.');
      setTarget(null);
      endForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'leave-of-absence'] });
    },
    onError: (e: Error) => message.error(e.message || '조기 복직 처리에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<LeaveOfAbsence>>(
    () => [
      {
        title: '직원',
        dataIndex: 'memberId',
        key: 'memberId',
        width: 280,
        render: (v: string) => {
          const m = v ? memberMap.get(v) : undefined;
          if (!m) {
            // 멤버 매핑이 아직 안 된 경우 UUID 의 일부만 노출
            return (
              <Tooltip title={v ?? '—'}>
                <Typography.Text type="secondary" className="tw-text-xs">
                  {v ? `${v.slice(0, 8)}…` : '—'}
                </Typography.Text>
              </Tooltip>
            );
          }
          return (
            <div className="tw-flex tw-flex-col">
              <span className="tw-text-sm tw-font-medium tw-text-slate-800">{m.name}</span>
              <span className="tw-text-xs tw-text-slate-500">
                {[m.department, m.jobTitleName, m.jobGradeName].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          );
        },
      },
      {
        title: '종류',
        dataIndex: 'type',
        key: 'type',
        width: 110,
        filters: [
          { text: TYPE_KO.MATERNITY, value: 'MATERNITY' },
          { text: TYPE_KO.PATERNAL, value: 'PATERNAL' },
          { text: TYPE_KO.SICK, value: 'SICK' },
          { text: TYPE_KO.UNPAID, value: 'UNPAID' },
          { text: TYPE_KO.STUDY, value: 'STUDY' },
          { text: TYPE_KO.MILITARY, value: 'MILITARY' },
        ],
        onFilter: (value, record) => record.type === value,
        render: (v: LeaveOfAbsenceTypeCode) => TYPE_KO[v] ?? v ?? '—',
      },
      {
        title: '기간',
        key: 'period',
        sorter: (a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''),
        defaultSortOrder: 'descend',
        render: (_, r) => `${r.startDate ?? '—'} ~ ${r.endDate ?? '—'}`,
      },
      {
        title: '실제 종료',
        dataIndex: 'actualEndDate',
        key: 'actualEndDate',
        width: 120,
        render: (v: string | null) => v ?? '—',
      },
      {
        title: '유급',
        dataIndex: 'isPaidYn',
        key: 'isPaidYn',
        width: 80,
        render: (v: string | null) => (v === 'Y' ? <Tag color="green">유급</Tag> : <Tag>무급</Tag>),
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (v: LeaveOfAbsenceApprovalStatusCode) => (
          <Tag color={STATUS_COLOR[v] ?? 'default'}>
            {STATUS_LABEL[v] ?? v}
          </Tag>
        ),
      },
      {
        title: '작업',
        key: 'actions',
        width: 140,
        render: (_, record) => {
          if (record.status !== 'ACTIVE') return null;
          return (
            <Button
              size="small"
              onClick={() => {
                setTarget(record);
                endForm.setFieldsValue({ actualEndDate: dayjs() });
              }}
            >
              조기 복직
            </Button>
          );
        },
      },
    ],
    [endForm, memberMap],
  );

  const onEndSubmit = (v: EndFormValues) => {
    if (!target?.leaveOfAbsenceId) return;
    endM.mutate({
      id: target.leaveOfAbsenceId,
      actualEndDate: v.actualEndDate.format('YYYY-MM-DD'),
    });
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          휴직 관리
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          휴직 상태 조회와 조기 복직 처리만 수행 가능합니다.
        </Typography.Paragraph>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Space size={8} className="tw-flex-1">
            <Tag color="blue">휴직 중</Tag>
            <Typography.Text type="secondary" className="tw-text-sm">
              현재 휴직 중인 직원만 표시됩니다.
            </Typography.Text>
          </Space>
          <Input.Search
            placeholder="이름·부서·직책·직급·사유로 필터"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
        </div>

        <Table<LeaveOfAbsence>
          rowKey={(r) => r.leaveOfAbsenceId ?? `${r.memberId}-${r.startDate}`}
          loading={listQ.isLoading || membersQ.isLoading}
          dataSource={filteredList}
          columns={columns}
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{
            emptyText: memberSearch.trim()
              ? `'${memberSearch}' 로 검색된 휴직이 없습니다.`
              : '조회된 휴직 내역이 없습니다.',
          }}
        />
      </Card>

      <Modal
        open={Boolean(target)}
        onCancel={() => {
          setTarget(null);
          endForm.resetFields();
        }}
        onOk={() => endForm.submit()}
        confirmLoading={endM.isPending}
        okText="조기 복직 처리"
        cancelText="취소"
        title="조기 복직 처리"
        destroyOnHidden
      >
        {target && (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Typography.Text>
              <Typography.Text type="secondary">직원</Typography.Text>{' '}
              {(() => {
                const m = target.memberId ? memberMap.get(target.memberId) : undefined;
                if (!m) {
                  return (
                    <Typography.Text className="tw-font-mono tw-text-xs">
                      {target.memberId ?? '—'}
                    </Typography.Text>
                  );
                }
                const meta = [m.department, m.jobTitleName, m.jobGradeName]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Typography.Text>
                    {m.name}
                    {meta ? (
                      <Typography.Text type="secondary" className="tw-ml-1 tw-text-xs">
                        ({meta})
                      </Typography.Text>
                    ) : null}
                  </Typography.Text>
                );
              })()}
            </Typography.Text>
            <Typography.Text>
              <Typography.Text type="secondary">원 기간</Typography.Text>{' '}
              {target.startDate} ~ {target.endDate}
            </Typography.Text>
            <Form<EndFormValues>
              form={endForm}
              layout="vertical"
              onFinish={onEndSubmit}
              initialValues={{ actualEndDate: dayjs() }}
            >
              <Form.Item
                label="실제 종료일"
                name="actualEndDate"
                rules={[{ required: true, message: '실제 종료일을 선택하세요.' }]}
                extra="선택한 날짜 다음날부터 정상 근무로 처리됩니다."
              >
                <DatePicker
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD"
                  disabledDate={(d) => {
                    if (!d) return false;
                    if (target.startDate && d.isBefore(dayjs(target.startDate), 'day')) return true;
                    if (target.endDate && d.isAfter(dayjs(target.endDate), 'day')) return true;
                    return false;
                  }}
                />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>
    </Space>
  );
}
