/**
 * /app/payroll/admin/allowances
 * 관리자 수당 관리
 *
 * - 신규 부여: 신규 입사자에게 자격수당/직책수당 등 개인 차등 수당을 즉시 적용 (autoGrant — AUTO 상태)
 * - 부여 현황: 회사 전체의 수당 부여 상태(승인/대기/반려/자동) 모니터링
 * - 직원별 활성 수당 조회: 특정 직원의 현재 적용 중인 수당 목록
 *
 * 백엔드 API (gateway predicate `/salary/**`):
 *  POST /salary/admin/allowances/auto-grant
 *  GET  /salary/admin/allowances?status=...
 *  GET  /salary/admin/allowances/members/{memberId}/active?date=YYYY-MM-DD
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  AllowanceApprovalStatusCode,
  MemberAllowance,
  SalaryItemTemplate,
} from '@/features/salary-service/types';

/** 디바운스 훅 — 직원 검색 keyword 디바운싱 */
function useDebounced<T>(value: T, delay = 320): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AUTO: { label: '관리자 자동부여', color: 'blue' },
  APPROVED: { label: '승인', color: 'green' },
  PENDING: { label: '대기', color: 'orange' },
  REJECTED: { label: '반려', color: 'red' },
  CANCELLED: { label: '취소', color: 'default' },
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 직원 검색 기반 select — value 는 memberId */
function MemberSearchSelect({
  value,
  onChange,
  placeholder = '이름·사번·이메일로 검색',
  width = 260,
  setMemberMeta,
}: {
  value?: string;
  onChange?: (memberId: string | undefined) => void;
  placeholder?: string;
  width?: number | string;
  setMemberMeta?: (meta: { name?: string; email?: string } | null) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounced(keyword, 320);
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['member', 'search', 'allowance-admin', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
  });
  return (
    <Select
      showSearch
      allowClear
      style={{ width }}
      value={value}
      placeholder={placeholder}
      filterOption={false}
      onSearch={setKeyword}
      onChange={(v) => {
        const picked = rows.find((r) => r.memberId === v);
        setMemberMeta?.(picked ? { name: picked.name, email: picked.email } : null);
        onChange?.(v as string | undefined);
      }}
      loading={isFetching}
      options={rows.map((m) => ({
        value: m.memberId,
        label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
      }))}
      notFoundContent={debounced ? '결과 없음' : '키워드 입력'}
    />
  );
}

export function AdminMemberAllowancePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  /* ── 1) 모든 수당 항목 템플릿 — 개인 차등 수당으로 부여 가능한 EARNING 항목 ── */
  const tplQ = useQuery({
    queryKey: ['salary', 'salary-item-templates', 'allowance'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
  });
  const allowanceTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    // EARNING + 통상임금(고정성) 항목만 — 자격수당/직책수당/자녀수당 등
    return list.filter(
      (t) => t.itemType === 'EARNING' && (t.isOrdinaryWageYn === 'Y' || t.isOrdinaryWageYn == null),
    );
  }, [tplQ.data]);

  /* ── 2) 부여 현황 — 상태별 전체 목록 ── */
  const [statusFilter, setStatusFilter] = useState<AllowanceApprovalStatusCode | 'ALL'>('ALL');
  const listQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'list', statusFilter],
    queryFn: () => salaryApi.memberAllowanceAdmin.listByStatus(statusFilter === 'ALL' ? undefined : statusFilter),
  });

  /* ── 3) KPI 카드 ── */
  const kpi = useMemo(() => {
    const all = listQ.data ?? [];
    return {
      total: all.length,
      auto: all.filter((a) => a.approvalStatus === 'AUTO').length,
      approved: all.filter((a) => a.approvalStatus === 'APPROVED').length,
      pending: all.filter((a) => a.approvalStatus === 'PENDING').length,
    };
  }, [listQ.data]);

  /* ── 4) 직원 이름 매핑 — listQ 내 memberId 일괄 조회 ── */
  const memberIdSet = useMemo(() => {
    const s = new Set<string>();
    (listQ.data ?? []).forEach((a) => {
      if (a.memberId) s.add(a.memberId);
    });
    return Array.from(s);
  }, [listQ.data]);
  const namesQ = useQuery({
    queryKey: ['member', 'lookup', 'allowance-admin', memberIdSet.sort().join(',')],
    queryFn: async () => {
      // 가장 가벼운 방식 — 각 ID 를 바로 조회 (캐시 의존)
      const map = new Map<string, { name?: string; email?: string }>();
      await Promise.all(
        memberIdSet.map(async (id) => {
          const m = await memberApi.detailOrNull(id);
          if (m) map.set(id, { name: m.name, email: m.email });
        }),
      );
      return map;
    },
    enabled: memberIdSet.length > 0,
    staleTime: 60_000,
  });
  const memberNameMap = namesQ.data ?? new Map<string, { name?: string; email?: string }>();

  /* ── 5) 신규 부여 모달 ── */
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm] = Form.useForm<{
    memberId: string;
    salaryItemTemplateId: string;
    amount: number;
    effectiveFrom: dayjs.Dayjs;
  }>();

  const autoGrantMut = useMutation({
    mutationFn: (payload: {
      memberId: string;
      salaryItemTemplateId: string;
      amount: number;
      effectiveFrom: string;
    }) => salaryApi.memberAllowanceAdmin.autoGrant(payload),
    onSuccess: () => {
      void message.success('수당이 즉시 적용되었습니다.');
      setGrantOpen(false);
      grantForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'list'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'active-by-member'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '부여에 실패했습니다.');
    },
  });

  const onSubmitGrant = async () => {
    try {
      const v = await grantForm.validateFields();
      autoGrantMut.mutate({
        memberId: v.memberId,
        salaryItemTemplateId: v.salaryItemTemplateId,
        amount: v.amount,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
      });
    } catch {
      // form invalid — antd 가 표시
    }
  };

  /* ── 6) 직원별 활성 수당 조회 ── */
  const [lookupMemberId, setLookupMemberId] = useState<string | undefined>();
  const [lookupDate, setLookupDate] = useState<dayjs.Dayjs>(() => dayjs());
  const activeByMemberQ = useQuery({
    queryKey: [
      'salary',
      'allowance',
      'admin',
      'active-by-member',
      lookupMemberId,
      lookupDate.format('YYYY-MM-DD'),
    ],
    queryFn: () =>
      salaryApi.memberAllowanceAdmin.listActiveByMember(
        lookupMemberId!,
        lookupDate.format('YYYY-MM-DD'),
      ),
    enabled: !!lookupMemberId,
  });

  /* ── 7) 컬럼 ── */
  const tplMap = useMemo(() => {
    const map = new Map<string, SalaryItemTemplate>();
    (tplQ.data ?? []).forEach((t) => {
      if (t.salaryItemTemplateId) map.set(t.salaryItemTemplateId, t);
    });
    return map;
  }, [tplQ.data]);

  const listColumns: ColumnsType<MemberAllowance> = useMemo(
    () => [
      {
        title: '직원',
        key: 'member',
        render: (_, r) => {
          if (!r.memberId) return <Typography.Text type="secondary">—</Typography.Text>;
          const meta = memberNameMap.get(r.memberId);
          return (
            <Space size={4} direction="vertical">
              <Typography.Text strong>{meta?.name ?? `${r.memberId.slice(0, 8)}…`}</Typography.Text>
              <Typography.Text type="secondary" className="!tw-text-xs">
                {meta?.email ?? ''}
              </Typography.Text>
            </Space>
          );
        },
      },
      {
        title: '수당 항목',
        dataIndex: 'salaryItemTemplateId',
        key: 'tpl',
        render: (id: string) => tplMap.get(id)?.itemName ?? <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: '금액',
        dataIndex: 'amount',
        key: 'amount',
        align: 'right' as const,
        render: (v: number) => formatWon(v),
        sorter: (a, b) => (a.amount ?? 0) - (b.amount ?? 0),
      },
      {
        title: '적용 기간',
        key: 'eff',
        render: (_, r) => (
          <span>
            {r.effectiveFrom ?? '—'} ~ {r.effectiveTo ?? '진행중'}
          </span>
        ),
      },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'status',
        render: (s: string) => {
          const m = STATUS_LABEL[s] ?? { label: s, color: 'default' };
          return <Tag color={m.color}>{m.label}</Tag>;
        },
      },
      {
        title: '사유 / 메모',
        dataIndex: 'reason',
        key: 'reason',
        ellipsis: true,
      },
    ],
    [tplMap, memberNameMap],
  );

  const activeColumns: ColumnsType<MemberAllowance> = useMemo(
    () => [
      {
        title: '수당 항목',
        dataIndex: 'salaryItemTemplateId',
        key: 'tpl',
        render: (id: string) => tplMap.get(id)?.itemName ?? '—',
      },
      {
        title: '금액',
        dataIndex: 'amount',
        key: 'amount',
        align: 'right' as const,
        render: (v: number) => formatWon(v),
      },
      {
        title: '적용 시작',
        dataIndex: 'effectiveFrom',
        key: 'effectiveFrom',
      },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'status',
        render: (s: string) => {
          const m = STATUS_LABEL[s] ?? { label: s, color: 'default' };
          return <Tag color={m.color}>{m.label}</Tag>;
        },
      },
    ],
    [tplMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 헤더 */}
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-mb-1">수당 관리</Typography.Title>
          <Typography.Text type="secondary">
            신규 입사자에게 자격수당·직책수당 등 개인 차등 수당을 즉시 부여하고 회사 전체 부여 현황을 관리합니다.
          </Typography.Text>
        </div>
        <Space>
          <Button type="primary" onClick={() => setGrantOpen(true)}>
            + 수당 부여
          </Button>
        </Space>
      </div>

      {/* KPI */}
      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        <Card size="small"><Statistic title="전체 수당 건수" value={kpi.total} suffix="건" /></Card>
        <Card size="small"><Statistic title="자동 부여(AUTO)" value={kpi.auto} suffix="건" valueStyle={{ color: '#2563eb' }} /></Card>
        <Card size="small"><Statistic title="승인" value={kpi.approved} suffix="건" valueStyle={{ color: '#16a34a' }} /></Card>
        <Card size="small"><Statistic title="대기" value={kpi.pending} suffix="건" valueStyle={{ color: '#f59e0b' }} /></Card>
      </div>

      <Tabs
        defaultActiveKey="status"
        items={[
          {
            key: 'status',
            label: '부여 현황',
            children: (
              <Card>
                <Space wrap className="tw-mb-3">
                  <Typography.Text type="secondary">상태 필터:</Typography.Text>
                  <Select
                    style={{ width: 180 }}
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v)}
                    options={[
                      { value: 'ALL', label: '전체' },
                      { value: 'AUTO', label: '자동 부여(AUTO)' },
                      { value: 'APPROVED', label: '승인' },
                      { value: 'PENDING', label: '대기' },
                      { value: 'REJECTED', label: '반려' },
                      { value: 'CANCELLED', label: '취소' },
                    ]}
                  />
                  <Typography.Text type="secondary">총 {(listQ.data ?? []).length}건</Typography.Text>
                </Space>
                <Table<MemberAllowance>
                  rowKey={(r) => r.memberAllowanceId ?? `${r.memberId}-${r.salaryItemTemplateId}-${r.effectiveFrom}`}
                  loading={listQ.isLoading}
                  dataSource={listQ.data ?? []}
                  columns={listColumns}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                  locale={{ emptyText: <Empty description="해당 상태의 수당이 없습니다." /> }}
                  size="middle"
                />
              </Card>
            ),
          },
          {
            key: 'lookup',
            label: '직원별 활성 수당',
            children: (
              <Card>
                <Space wrap className="tw-mb-3">
                  <Typography.Text type="secondary">직원:</Typography.Text>
                  <MemberSearchSelect value={lookupMemberId} onChange={setLookupMemberId} width={300} />
                  <Typography.Text type="secondary">기준일:</Typography.Text>
                  <DatePicker
                    value={lookupDate}
                    onChange={(d) => d && setLookupDate(d)}
                    allowClear={false}
                  />
                </Space>
                {!lookupMemberId ? (
                  <Empty description="직원을 선택하면 해당 시점에 적용 중인 수당을 보여줍니다." />
                ) : (
                  <Table<MemberAllowance>
                    rowKey={(r) => r.memberAllowanceId ?? `${r.salaryItemTemplateId}-${r.effectiveFrom}`}
                    loading={activeByMemberQ.isLoading}
                    dataSource={activeByMemberQ.data ?? []}
                    columns={activeColumns}
                    pagination={false}
                    locale={{ emptyText: '해당 시점에 활성인 수당이 없습니다.' }}
                    size="middle"
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* 신규 부여 모달 */}
      <Modal
        title="수당 부여"
        open={grantOpen}
        onCancel={() => setGrantOpen(false)}
        onOk={onSubmitGrant}
        confirmLoading={autoGrantMut.isPending}
        okText="부여"
        cancelText="취소"
        destroyOnClose
        width={560}
      >
        <Form
          form={grantForm}
          layout="vertical"
          initialValues={{ effectiveFrom: dayjs() }}
        >
          <Form.Item
            label="대상 직원"
            name="memberId"
            rules={[{ required: true, message: '직원을 선택해주세요.' }]}
          >
            {/* Form.Item 이 value/onChange 를 child 에 자동 주입 */}
            <MemberSearchSelect width="100%" placeholder="이름·이메일로 검색" />
          </Form.Item>

          <Form.Item
            label="수당 항목"
            name="salaryItemTemplateId"
            rules={[{ required: true, message: '수당 항목을 선택해주세요.' }]}
            extra="회사 공통 수당 템플릿(EARNING) 중 직원별 차등 적용이 가능한 항목입니다."
          >
            <Select
              loading={tplQ.isLoading}
              placeholder="자격수당, 직책수당, 자녀수당 등"
              options={allowanceTemplates.map((t) => ({
                value: t.salaryItemTemplateId!,
                label: t.itemName,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="금액 (원)"
            name="amount"
            rules={[
              { required: true, message: '금액을 입력해주세요.' },
              { type: 'number', min: 0, message: '0원 이상이어야 합니다.' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={10000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number((v ?? '').replace(/,/g, '')) as 0}
              placeholder="예: 100000"
            />
          </Form.Item>

          <Form.Item
            label="적용 시작일"
            name="effectiveFrom"
            rules={[{ required: true, message: '적용 시작일을 선택해주세요.' }]}
            extra="선택일부터 정산 시 본 수당이 자동 합산됩니다."
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
            * 관리자 부여(AUTO)는 별도 결재 없이 즉시 활성화됩니다. 직원 본인 신청(PENDING)은 결재
            승인 후 적용됩니다.
          </Typography.Paragraph>
        </Form>
      </Modal>
    </Space>
  );
}

export default AdminMemberAllowancePage;
