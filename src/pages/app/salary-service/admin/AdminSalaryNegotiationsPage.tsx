/**
 * /app/salary/negotiations 연봉 협상 관리 (시스템 관리자)
 *  자체 워크플로 DRAFT → SUBMITTED → APPROVED/REJECTED → APPLIED
 *  단건 등록 + groupId 묶음 일괄 등록 (정기 시즌)
 *  적용 시 새 Salary 행 자동 생성 + 기존 행 effectiveTo 마감
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { memberApi, type MemberLookupRow } from '@/features/member/api/memberApi';
import type {
  NegotiationStatusCode,
  NegotiationTypeCode,
  SalaryNegotiation,
  SalaryNegotiationBulkCreatePayload,
  SalaryNegotiationCreatePayload,
  SalaryNegotiationUpdatePayload,
} from '@/features/salary-service/types';

const QK = ['salary', 'negotiations'] as const;

const NEG_TYPE_KO: Record<string, string> = {
  REGULAR: '정기',
  PROMOTION: '승진',
  AD_HOC: '수시',
  RETENTION: '유지',
};

const NEG_STATUS_KO: Record<string, string> = {
  DRAFT: '초안',
  SUBMITTED: '제출',
  APPROVED: '승인',
  REJECTED: '반려',
  APPLIED: '적용',
};

const NEG_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  APPLIED: 'gold',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}

function formatPercent(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/* ======================================================================
 * 메인 페이지
 * ====================================================================== */

export function AdminSalaryNegotiationsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<NegotiationStatusCode | 'ALL'>('ALL');
  const [groupFilter, setGroupFilter] = useState<string | 'ALL'>('ALL');

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SalaryNegotiation | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{
    row: SalaryNegotiation;
    action: 'approve' | 'reject';
  } | null>(null);

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => salaryApi.negotiation.listByCompany(),
  });
  const list = listQ.data ?? [];

  // 그룹 옵션 추출 (groupId 있는 행만)
  const groupOptions = useMemo(() => {
    const seen = new Map<string, string>();
    list.forEach((row) => {
      if (row.groupId && row.groupName && !seen.has(row.groupId)) {
        seen.set(row.groupId, row.groupName);
      }
    });
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (groupFilter !== 'ALL' && row.groupId !== groupFilter) return false;
      return true;
    });
  }, [list, statusFilter, groupFilter]);

  const submitM = useMutation({
    mutationFn: (id: string) => salaryApi.negotiation.submit(id),
    onSuccess: () => {
      message.success('직원에게 통보되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '제출 실패'),
  });

  const approveM = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      salaryApi.negotiation.approve(id, note),
    onSuccess: () => {
      message.success('승인 처리되었습니다.');
      setDecisionTarget(null);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '승인 실패'),
  });

  const rejectM = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      salaryApi.negotiation.reject(id, note),
    onSuccess: () => {
      message.success('반려 처리되었습니다.');
      setDecisionTarget(null);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '반려 실패'),
  });

  const applyM = useMutation({
    mutationFn: (id: string) => salaryApi.negotiation.apply(id),
    onSuccess: () => {
      message.success('Salary 새 행이 생성되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '적용 실패'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.negotiation.delete(id),
    onSuccess: () => {
      message.success('협상이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제 실패'),
  });

  const columns: ColumnsType<SalaryNegotiation> = [
    {
      title: '사번',
      dataIndex: 'sabun',
      key: 'sabun',
      width: 90,
      render: (v) => v ?? '—',
    },
    {
      title: '이름',
      dataIndex: 'memberName',
      key: 'memberName',
      width: 110,
      render: (v) => v ?? '—',
    },
    {
      title: '조직',
      dataIndex: 'organizationName',
      key: 'organizationName',
      width: 120,
      render: (v) => v ?? '—',
    },
    {
      title: '종류',
      dataIndex: 'negotiationType',
      key: 'negotiationType',
      width: 80,
      render: (v: NegotiationTypeCode) => <Tag>{NEG_TYPE_KO[v] ?? v}</Tag>,
    },
    {
      title: '시즌',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 140,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '현재 기본급',
      dataIndex: 'currentBaseSalary',
      key: 'currentBaseSalary',
      align: 'right',
      render: formatWon,
    },
    {
      title: '제안 기본급',
      dataIndex: 'proposedBaseSalary',
      key: 'proposedBaseSalary',
      align: 'right',
      render: (v: number | null) => <strong>{formatWon(v)}</strong>,
    },
    {
      title: '인상률',
      dataIndex: 'changeRate',
      key: 'changeRate',
      align: 'right',
      width: 90,
      render: (v: number | null) => {
        if (v == null) return '—';
        const cls = v > 0 ? 'tw-text-emerald-600' : v < 0 ? 'tw-text-red-600' : '';
        return <span className={cls}>{formatPercent(v)}</span>;
      },
    },
    {
      title: '적용일',
      dataIndex: 'proposedEffectiveFrom',
      key: 'proposedEffectiveFrom',
      width: 110,
      render: (v) => v ?? '—',
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: NegotiationStatusCode) => (
        <Tag color={NEG_STATUS_COLOR[v] ?? 'default'}>{NEG_STATUS_KO[v] ?? v}</Tag>
      ),
    },
    {
      title: '액션',
      key: 'actions',
      width: 280,
      render: (_, r) => <RowActions row={r} onEdit={(row) => setEditTarget(row)} onSubmit={(id) => submitM.mutate(id)} onDecide={(row, action) => setDecisionTarget({ row, action })} onApply={(id) => applyM.mutate(id)} onDelete={(id) => deleteM.mutate(id)} />,
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            연봉 협상 관리
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            정기/승진/수시 연봉 협상 등록 → 제출 → 승인 → 적용
          </Typography.Text>
        </div>
        <Space wrap>
          <Select<NegotiationStatusCode | 'ALL'>
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 130 }}
            options={[
              { value: 'ALL', label: '전체 상태' },
              { value: 'DRAFT', label: '초안' },
              { value: 'SUBMITTED', label: '제출' },
              { value: 'APPROVED', label: '승인' },
              { value: 'REJECTED', label: '반려' },
              { value: 'APPLIED', label: '적용' },
            ]}
          />
          <Select<string>
            value={groupFilter}
            onChange={setGroupFilter}
            style={{ minWidth: 180 }}
            options={[{ value: 'ALL', label: '전체 시즌' }, ...groupOptions]}
          />
          <Button onClick={() => setCreateOpen(true)}>단건 등록</Button>
          <Button type="primary" onClick={() => setBulkOpen(true)}>
            일괄 등록 (시즌)
          </Button>
        </Space>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<SalaryNegotiation>
          rowKey={(r) => r.negotiationId ?? `${r.memberId}-${r.proposedEffectiveFrom}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 30 }}
          size="small"
          locale={{ emptyText: '협상 이력이 없습니다.' }}
        />
      </Card>

      <CreateModal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          void qc.invalidateQueries({ queryKey: QK });
        }}
      />

      <BulkCreateModal
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        onSuccess={() => {
          setBulkOpen(false);
          void qc.invalidateQueries({ queryKey: QK });
        }}
      />

      <EditModal
        target={editTarget}
        onCancel={() => setEditTarget(null)}
        onSuccess={() => {
          setEditTarget(null);
          void qc.invalidateQueries({ queryKey: QK });
        }}
      />

      <DecisionModal
        target={decisionTarget}
        onCancel={() => setDecisionTarget(null)}
        onConfirm={(note) => {
          if (!decisionTarget?.row.negotiationId) return;
          if (decisionTarget.action === 'approve') {
            approveM.mutate({ id: decisionTarget.row.negotiationId, note });
          } else {
            rejectM.mutate({ id: decisionTarget.row.negotiationId, note });
          }
        }}
        submitting={approveM.isPending || rejectM.isPending}
      />
    </Space>
  );
}

/* ======================================================================
 * 행 액션 버튼 그룹 (상태별 가용 액션 분기)
 * ====================================================================== */

function RowActions({
  row,
  onEdit,
  onSubmit,
  onDecide,
  onApply,
  onDelete,
}: {
  row: SalaryNegotiation;
  onEdit: (row: SalaryNegotiation) => void;
  onSubmit: (id: string) => void;
  onDecide: (row: SalaryNegotiation, action: 'approve' | 'reject') => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const id = row.negotiationId;
  if (!id) return <span className="tw-text-slate-400">—</span>;

  const status = row.status;

  return (
    <Space size={4} wrap>
      {status === 'DRAFT' && (
        <>
          <Button size="small" onClick={() => onEdit(row)}>
            수정
          </Button>
          <Button size="small" type="primary" onClick={() => onSubmit(id)}>
            제출
          </Button>
        </>
      )}
      {status === 'SUBMITTED' && (
        <>
          <Button size="small" type="primary" onClick={() => onDecide(row, 'approve')}>
            승인
          </Button>
        </>
      )}
      {status === 'APPROVED' && (
        <Tooltip title="새 Salary 행을 생성하고 기존 활성 행을 마감합니다">
          <Popconfirm
            title="협상안을 적용할까요?"
            description="Salary 새 행이 생성되고 기존 활성 행은 자동 마감됩니다."
            okText="적용"
            cancelText="취소"
            onConfirm={() => onApply(id)}
          >
            <Button size="small" type="primary">
              적용
            </Button>
          </Popconfirm>
        </Tooltip>
      )}
      {status === 'APPLIED' && <Tag color="gold">적용 완료</Tag>}
      {status !== 'APPLIED' && (
        <Popconfirm
          title="협상을 삭제할까요?"
          okText="삭제"
          cancelText="취소"
          onConfirm={() => onDelete(id)}
        >
          <Button size="small" danger>
            삭제
          </Button>
        </Popconfirm>
      )}
    </Space>
  );
}

/* ======================================================================
 * 단건 등록 모달
 * ====================================================================== */

type CreateFormValues = {
  memberId: string;
  negotiationType: NegotiationTypeCode;
  proposedBaseSalary: number;
  proposedJobGradeName?: string;
  proposedJobTitleName?: string;
  proposedEffectiveFrom: Dayjs;
  reason?: string;
};

function CreateModal({
  open,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateFormValues>();

  const m = useMutation({
    mutationFn: (payload: SalaryNegotiationCreatePayload) =>
      salaryApi.negotiation.create(payload),
    onSuccess: () => {
      message.success('협상이 등록되었습니다.');
      form.resetFields();
      onSuccess();
    },
    onError: (e: Error) => message.error(e.message || '등록 실패'),
  });

  return (
    <Modal
      open={open}
      title="단건 협상 등록"
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={() => form.submit()}
      confirmLoading={m.isPending}
      okText="등록"
      cancelText="취소"
      destroyOnClose
      width={600}
    >
      <Form<CreateFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          negotiationType: 'AD_HOC',
          proposedEffectiveFrom: dayjs().add(1, 'month').startOf('month'),
        }}
        onFinish={(v) => {
          m.mutate({
            memberId: v.memberId,
            negotiationType: v.negotiationType,
            proposedBaseSalary: v.proposedBaseSalary,
            proposedJobGradeName: v.proposedJobGradeName ?? null,
            proposedJobTitleName: v.proposedJobTitleName ?? null,
            proposedEffectiveFrom: v.proposedEffectiveFrom.format('YYYY-MM-DD'),
            reason: v.reason ?? null,
          });
        }}
      >
        <MemberLookupField name="memberId" />

        <Form.Item
          label="협상 종류"
          name="negotiationType"
          rules={[{ required: true, message: '협상 종류를 선택하세요.' }]}
        >
          <Select
            options={[
              { value: 'REGULAR', label: '정기' },
              { value: 'PROMOTION', label: '승진' },
              { value: 'AD_HOC', label: '수시' },
              { value: 'RETENTION', label: '유지' },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="제안 기본급 (원)"
          name="proposedBaseSalary"
          rules={[{ required: true, message: '제안 기본급을 입력하세요.' }]}
        >
          <InputNumber
            min={0}
            step={100000}
            style={{ width: '100%' }}
            formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
            parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
          />
        </Form.Item>

        <div className="tw-grid tw-grid-cols-2 tw-gap-3">
          <Form.Item label="직급명 (선택)" name="proposedJobGradeName">
            <Input placeholder="예: 책임" />
          </Form.Item>
          <Form.Item label="직책명 (선택)" name="proposedJobTitleName">
            <Input placeholder="예: 팀장" />
          </Form.Item>
        </div>

        <Form.Item
          label="적용 시작일"
          name="proposedEffectiveFrom"
          rules={[{ required: true, message: '적용일을 선택하세요.' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>

        <Form.Item label="사유 (선택)" name="reason">
          <Input.TextArea rows={3} maxLength={500} placeholder="협상 사유" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ======================================================================
 * 일괄 등록 모달 (정기 시즌)
 * ====================================================================== */

type BulkFormValues = {
  groupName: string;
  negotiationType: NegotiationTypeCode;
  proposedEffectiveFrom: Dayjs;
};

type BulkRow = {
  memberId: string;
  memberName: string;
  currentBaseSalary?: number | null;
  proposedBaseSalary: number;
  reason?: string;
};

function BulkCreateModal({
  open,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BulkFormValues>();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [memberKeyword, setMemberKeyword] = useState('');
  const debouncedMemberKeyword = useDebouncedValue(memberKeyword, 320);
  const [memberPage, setMemberPage] = useState(0);
  const [memberPageSize, setMemberPageSize] = useState(20);
  const [memberOrgFilter, setMemberOrgFilter] = useState<string>('ALL');
  const [memberJobFilter, setMemberJobFilter] = useState<string>('ALL');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberCache, setMemberCache] = useState<Record<string, MemberLookupRow>>({});
  const salaryListQ = useQuery({
    queryKey: ['salary', 'salaries', 'company'],
    queryFn: () => salaryApi.salary.listByCompany(),
    enabled: open,
    staleTime: 60_000,
  });
  const activeBaseSalaryByMemberId = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const byMember = new Map<string, number>();
    const rows = [...(salaryListQ.data ?? [])].sort(
      (a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''),
    );
    for (const row of rows) {
      const memberId = row.memberId ?? '';
      const baseSalary = row.baseSalary;
      if (!memberId || baseSalary == null || byMember.has(memberId)) continue;
      const started = !row.effectiveFrom || row.effectiveFrom <= today;
      const notEnded = !row.effectiveTo || row.effectiveTo >= today;
      if (started && notEnded) byMember.set(memberId, baseSalary);
    }
    return byMember;
  }, [salaryListQ.data]);

  const memberLookupQ = useQuery({
    queryKey: [
      'member',
      'search-page',
      'negotiations-bulk',
      debouncedMemberKeyword,
      memberPage,
      memberPageSize,
    ],
    queryFn: () =>
      memberApi.searchMembersLookupPage({
        keyword: debouncedMemberKeyword,
        page: memberPage,
        size: memberPageSize,
      }),
    enabled: open,
    retry: 1,
  });

  useEffect(() => {
    setMemberPage(0);
  }, [debouncedMemberKeyword]);

  useEffect(() => {
    const list = memberLookupQ.data?.content ?? [];
    if (!list.length) return;
    setMemberCache((prev) => {
      const next = { ...prev };
      list.forEach((m) => {
        if (m.memberId) next[m.memberId] = m;
      });
      return next;
    });
  }, [memberLookupQ.data?.content]);

  const memberOrgOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        Object.values(memberCache)
          .map((m) => (m.organizationName ?? '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'ko'));
    return [{ value: 'ALL', label: '전체 부서' }, ...values.map((v) => ({ value: v, label: v }))];
  }, [memberCache]);

  const memberJobOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        Object.values(memberCache)
          .map((m) => (m.jobTitleName ?? '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'ko'));
    return [{ value: 'ALL', label: '전체 직급' }, ...values.map((v) => ({ value: v, label: v }))];
  }, [memberCache]);

  const memberRows = useMemo(() => memberLookupQ.data?.content ?? [], [memberLookupQ.data?.content]);
  const filteredMemberRows = useMemo(
    () =>
      memberRows.filter((m) => {
        if (memberOrgFilter !== 'ALL' && (m.organizationName ?? '').trim() !== memberOrgFilter) return false;
        if (memberJobFilter !== 'ALL' && (m.jobTitleName ?? '').trim() !== memberJobFilter) return false;
        return true;
      }),
    [memberRows, memberOrgFilter, memberJobFilter],
  );

  const m = useMutation({
    mutationFn: (payload: SalaryNegotiationBulkCreatePayload) =>
      salaryApi.negotiation.bulkCreate(payload),
    onSuccess: (res) => {
      message.success(`${res.length}건 일괄 등록되었습니다.`);
      form.resetFields();
      setRows([]);
      setMemberKeyword('');
      setMemberPage(0);
      setMemberPageSize(20);
      setMemberOrgFilter('ALL');
      setMemberJobFilter('ALL');
      setSelectedMemberIds([]);
      setMemberCache({});
      onSuccess();
    },
    onError: (e: Error) => message.error(e.message || '일괄 등록 실패'),
  });

  const addMember = (m: { memberId: string; name?: string }) => {
    setRows((prev) => {
      if (prev.find((r) => r.memberId === m.memberId)) return prev;
      return [
        ...prev,
        {
          memberId: m.memberId,
          memberName: m.name ?? '—',
          currentBaseSalary: activeBaseSalaryByMemberId.get(m.memberId) ?? null,
          proposedBaseSalary: 0,
        },
      ];
    });
  };

  const updateRow = (idx: number, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFinish = (v: BulkFormValues) => {
    if (rows.length === 0) {
      message.error('대상 직원을 한 명 이상 추가하세요.');
      return;
    }
    const invalid = rows.find((r) => !r.proposedBaseSalary || r.proposedBaseSalary <= 0);
    if (invalid) {
      message.error(`${invalid.memberName} 의 제안 기본급을 입력하세요.`);
      return;
    }
    m.mutate({
      groupName: v.groupName,
      negotiationType: v.negotiationType,
      proposedEffectiveFrom: v.proposedEffectiveFrom.format('YYYY-MM-DD'),
      items: rows.map((r) => ({
        memberId: r.memberId,
        proposedBaseSalary: r.proposedBaseSalary,
        proposedJobGradeName: null,
        proposedJobTitleName: null,
        reason: r.reason ?? null,
      })),
    });
  };

  return (
    <Modal
      open={open}
      title="정기 시즌 일괄 등록"
      onCancel={() => {
        form.resetFields();
        setRows([]);
        setMemberKeyword('');
        setMemberPage(0);
        setMemberPageSize(20);
        setMemberOrgFilter('ALL');
        setMemberJobFilter('ALL');
        setSelectedMemberIds([]);
        setMemberCache({});
        onCancel();
      }}
      onOk={() => form.submit()}
      confirmLoading={m.isPending}
      okText="등록"
      cancelText="취소"
      destroyOnClose
      width={900}
    >
      <Form<BulkFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          negotiationType: 'REGULAR',
          groupName: `${dayjs().year() + 1} 연봉 협상`,
          proposedEffectiveFrom: dayjs().add(1, 'year').startOf('year'),
        }}
        onFinish={handleFinish}
      >
        <div className="tw-grid tw-grid-cols-3 tw-gap-3">
          <Form.Item
            label="시즌명"
            name="groupName"
            rules={[{ required: true, message: '시즌명을 입력하세요.' }]}
          >
            <Input placeholder="예: 2026 연봉 협상" />
          </Form.Item>
          <Form.Item
            label="협상 종류"
            name="negotiationType"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'REGULAR', label: '정기' },
                { value: 'PROMOTION', label: '승진' },
                { value: 'AD_HOC', label: '수시' },
                { value: 'RETENTION', label: '유지' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="적용 시작일"
            name="proposedEffectiveFrom"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>

        <div className="tw-mb-3">
          <Typography.Text strong>대상 직원 추가</Typography.Text>
          <div className="tw-mt-2 tw-space-y-2">
            <Space wrap className="tw-w-full">
              <Input
                value={memberKeyword}
                onChange={(e) => setMemberKeyword(e.target.value)}
                placeholder="이름·이메일·사번 검색 (비워두면 전체)"
                style={{ width: 260 }}
                allowClear
              />
              <Select
                value={memberOrgFilter}
                onChange={setMemberOrgFilter}
                options={memberOrgOptions}
                style={{ width: 180 }}
              />
              <Select
                value={memberJobFilter}
                onChange={setMemberJobFilter}
                options={memberJobOptions}
                style={{ width: 160 }}
              />
              <Button
                onClick={() => {
                  selectedMemberIds.forEach((id) => {
                    const target = memberCache[id];
                    if (!target) return;
                    addMember({ memberId: target.memberId, name: target.name });
                  });
                  setSelectedMemberIds([]);
                }}
                disabled={selectedMemberIds.length === 0}
              >
                선택 직원 추가 ({selectedMemberIds.length})
              </Button>
            </Space>

            <Table<MemberLookupRow>
              rowKey={(r) => r.memberId}
              dataSource={filteredMemberRows}
              loading={memberLookupQ.isLoading || memberLookupQ.isFetching}
              size="small"
              pagination={{
                current: (memberLookupQ.data?.page ?? memberPage) + 1,
                pageSize: memberLookupQ.data?.size ?? memberPageSize,
                total: memberLookupQ.data?.totalElements ?? 0,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 30, 50],
                onChange: (page, size) => {
                  setMemberPage(page - 1);
                  setMemberPageSize(size);
                },
              }}
              rowSelection={{
                selectedRowKeys: selectedMemberIds,
                onChange: (keys) => setSelectedMemberIds(keys.map((k) => String(k))),
              }}
              locale={{ emptyText: '조회된 직원이 없습니다.' }}
              columns={[
                {
                  title: '이름',
                  dataIndex: 'name',
                  key: 'name',
                  width: 130,
                  render: (v: string | undefined) => v ?? '—',
                },
                {
                  title: '이메일',
                  dataIndex: 'email',
                  key: 'email',
                  width: 220,
                  render: (v: string | undefined) => v ?? '—',
                },
                {
                  title: '부서',
                  dataIndex: 'organizationName',
                  key: 'organizationName',
                  width: 150,
                  render: (v: string | undefined) => v ?? '—',
                },
                {
                  title: '직급',
                  dataIndex: 'jobTitleName',
                  key: 'jobTitleName',
                  width: 110,
                  render: (v: string | undefined) => v ?? '—',
                },
              ]}
            />
          </div>
        </div>

        <Table<BulkRow>
          rowKey={(r) => r.memberId}
          dataSource={rows}
          pagination={false}
          size="small"
          scroll={{ y: 320 }}
          locale={{ emptyText: '검색해서 직원을 추가하세요.' }}
          columns={[
            { title: '이름', dataIndex: 'memberName', width: 110 },
            {
              title: '현재 기본급 (원)',
              dataIndex: 'currentBaseSalary',
              width: 180,
              align: 'right',
              render: (v: number | null | undefined) =>
                v == null ? '—' : Number(v).toLocaleString('ko-KR'),
            },
            {
              title: '제안 기본급 (원)',
              dataIndex: 'proposedBaseSalary',
              width: 200,
              render: (v: number, r, idx) => (
                <InputNumber
                  min={0}
                  step={100000}
                  value={v}
                  onChange={(val) => updateRow(idx, { proposedBaseSalary: Number(val ?? 0) })}
                  style={{ width: '100%' }}
                  formatter={(x) => (x ? `${Number(x).toLocaleString('ko-KR')}` : '')}
                  parser={(x) => Number((x ?? '').replace(/[^0-9]/g, '')) as 0}
                />
              ),
            },
            {
              title: '사유',
              dataIndex: 'reason',
              render: (v: string, _r, idx) => (
                <Input
                  value={v}
                  onChange={(e) => updateRow(idx, { reason: e.target.value })}
                  placeholder="선택"
                />
              ),
            },
            {
              title: '',
              key: 'remove',
              width: 60,
              render: (_, _r, idx) => (
                <Button size="small" danger onClick={() => removeRow(idx)}>
                  제거
                </Button>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}

/* ======================================================================
 * 수정 모달 (DRAFT 만)
 * ====================================================================== */

function EditModal({
  target,
  onCancel,
  onSuccess,
}: {
  target: SalaryNegotiation | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    proposedBaseSalary: number;
    proposedJobGradeName?: string;
    proposedJobTitleName?: string;
    proposedEffectiveFrom: Dayjs;
    reason?: string;
  }>();

  useEffect(() => {
    if (target) {
      form.setFieldsValue({
        proposedBaseSalary: target.proposedBaseSalary ?? 0,
        proposedJobGradeName: target.proposedJobGradeName ?? '',
        proposedJobTitleName: target.proposedJobTitleName ?? '',
        proposedEffectiveFrom: target.proposedEffectiveFrom
          ? dayjs(target.proposedEffectiveFrom)
          : dayjs(),
        reason: target.reason ?? '',
      });
    }
  }, [target, form]);

  const m = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SalaryNegotiationUpdatePayload }) =>
      salaryApi.negotiation.update(id, payload),
    onSuccess: () => {
      message.success('협상안이 수정되었습니다.');
      form.resetFields();
      onSuccess();
    },
    onError: (e: Error) => message.error(e.message || '수정 실패'),
  });

  return (
    <Modal
      open={Boolean(target)}
      title={target ? `${target.memberName ?? ''} 협상 수정` : '수정'}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={() => form.submit()}
      confirmLoading={m.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={520}
    >
      {target && (
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => {
            if (!target.negotiationId) return;
            m.mutate({
              id: target.negotiationId,
              payload: {
                proposedBaseSalary: v.proposedBaseSalary,
                proposedJobGradeName: v.proposedJobGradeName ?? null,
                proposedJobTitleName: v.proposedJobTitleName ?? null,
                proposedEffectiveFrom: v.proposedEffectiveFrom.format('YYYY-MM-DD'),
                reason: v.reason ?? null,
              },
            });
          }}
        >
          <Form.Item
            label="제안 기본급 (원)"
            name="proposedBaseSalary"
            rules={[{ required: true, message: '제안 기본급을 입력하세요.' }]}
          >
            <InputNumber
              min={0}
              step={100000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
              parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
            />
          </Form.Item>
          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item label="직급명" name="proposedJobGradeName">
              <Input />
            </Form.Item>
            <Form.Item label="직책명" name="proposedJobTitleName">
              <Input />
            </Form.Item>
          </div>
          <Form.Item
            label="적용 시작일"
            name="proposedEffectiveFrom"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="사유" name="reason">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

/* ======================================================================
 * 승인/반려 모달 (메모 입력)
 * ====================================================================== */

function DecisionModal({
  target,
  onCancel,
  onConfirm,
  submitting,
}: {
  target: { row: SalaryNegotiation; action: 'approve' | 'reject' } | null;
  onCancel: () => void;
  onConfirm: (note: string | null) => void;
  submitting: boolean;
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (target) setNote('');
  }, [target]);

  if (!target) return null;
  const isApprove = target.action === 'approve';

  return (
    <Modal
      open={Boolean(target)}
      title={isApprove ? '협상 승인' : '협상 반려'}
      onCancel={onCancel}
      onOk={() => onConfirm(note.trim() || null)}
      confirmLoading={submitting}
      okText={isApprove ? '승인' : '반려'}
      okButtonProps={{ danger: !isApprove }}
      cancelText="취소"
      destroyOnClose
    >
      <div className="tw-mb-3">
        <Typography.Text type="secondary" className="tw-text-xs">
          {target.row.memberName} · 제안 {formatWon(target.row.proposedBaseSalary)} ·{' '}
          {target.row.proposedEffectiveFrom} 적용
        </Typography.Text>
      </div>
      <Input.TextArea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder={isApprove ? '승인 메모 (선택)' : '반려 사유 (권장)'}
      />
    </Modal>
  );
}

/* ======================================================================
 * 보조 컴포넌트
 * ====================================================================== */

function MemberLookupField({ name = 'memberId' }: { name?: string }) {
  const [searchText, setSearchText] = useState('');
  const debounced = useDebouncedValue(searchText, 320);
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['member', 'search', 'negotiations', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
    retry: 1,
  });
  const options = useMemo(
    () =>
      rows.map((m) => ({
        value: m.memberId,
        label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
      })),
    [rows],
  );
  return (
    <Form.Item
      name={name}
      label="구성원"
      rules={[{ required: true, message: '검색 후 구성원을 선택하세요' }]}
    >
      <Select
        showSearch
        allowClear
        placeholder="이름·이메일·사번으로 검색"
        filterOption={false}
        searchValue={searchText}
        onSearch={setSearchText}
        onClear={() => setSearchText('')}
        notFoundContent={
          debounced.trim().length < 1
            ? '한 글자 이상 입력하세요'
            : isFetching
              ? '검색 중…'
              : '검색 결과 없음'
        }
        options={options}
        loading={isFetching}
      />
    </Form.Item>
  );
}

