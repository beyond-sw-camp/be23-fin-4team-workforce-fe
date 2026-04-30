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
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
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
  AUTO: { label: '관리자 즉시 부여', color: 'blue' },
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
  const { message, modal } = App.useApp();
  const qc = useQueryClient();

  /* ── 1) 모든 수당 항목 템플릿 — 개인 차등 수당으로 부여 가능한 EARNING 항목.
   *    템플릿은 자주 안 바뀌므로 staleTime 5분. */
  const tplQ = useQuery({
    queryKey: ['salary', 'salary-item-templates', 'allowance'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
    staleTime: 5 * 60_000,
  });
  const allowanceTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    // 개인 차등 (applyToAllYn != 'Y') EARNING 항목만 - [수당 부여] 모달에서 부여 가능한 항목.
    // 회사 공통 (Y) 은 PayrollService 가 전 직원 자동 적용하므로 부여 메뉴에서 제외.
    // 기본급도 제외 (메인 급여로 처리).
    return list.filter(
      (t) =>
        t.itemType === 'EARNING'
        && t.itemName !== '기본급'
        && t.applyToAllYn !== 'Y',
    );
  }, [tplQ.data]);

  /** 필터 dropdown 용 - 회사 공통/개인 차등 모두 포함 (기본급만 제외).
   *  회사 공통도 직원별로 override 부여된 케이스가 있을 수 있으므로 필터 후보로 노출. */
  const allFilterableTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    return list.filter((t) => t.itemType === 'EARNING' && t.itemName !== '기본급');
  }, [tplQ.data]);

  /* ── 2) 부여 현황 — 연월 + 상태 + 직원 + 항목 필터 ──
   *    백엔드는 [yearMonth] 의 어느 시점이라도 active 였던 행을 반환 (overlap 체크).
   *    상태는 백엔드 파라미터, 직원/항목은 프론트에서 필터링 (전체 받아온 후 추려서 표시). */
  const [statusFilter, setStatusFilter] = useState<AllowanceApprovalStatusCode | 'ALL'>('ALL');
  const [listMonth, setListMonth] = useState<dayjs.Dayjs>(() => dayjs());
  const [memberKeyword, setMemberKeyword] = useState(''); // 직원 이름 검색 (한 글자 이상이면 필터 동작)
  const [templateFilter, setTemplateFilter] = useState<string | 'ALL'>('ALL');
  const listMonthYm = listMonth.format('YYYY-MM');
  const listQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'list', listMonthYm, statusFilter],
    queryFn: () => salaryApi.memberAllowanceAdmin.listByCompany({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      yearMonth: listMonthYm,
    }),
  });

  /* ── 3) 직원 이름 매핑 — 회사 직원 list 1회 조회로 N+1 회피 ──
   *    useMemberDisplayNames 가 내부적으로 membersApi.list({pageSize:500}) 한 번 호출 + 5분 캐시. */
  const memberIdList = useMemo(
    () => (listQ.data ?? []).map((a) => a.memberId).filter((id): id is string => Boolean(id)),
    [listQ.data],
  );
  const { labelFor } = useMemberDisplayNames(memberIdList);

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

  /* ── 6) 직원/항목 클라이언트 필터링 + 디바운스 ──
   *    직원 검색은 labelFor("이름 · 부서") 텍스트 매칭. labelFor 는 query.data 가 로드되면 stable. */
  const debouncedMemberKeyword = useDebounced(memberKeyword, 250);
  const filteredAllowances = useMemo(() => {
    const rows = listQ.data ?? [];
    const k = debouncedMemberKeyword.trim().toLowerCase();
    return rows.filter((a) => {
      if (templateFilter !== 'ALL' && a.salaryItemTemplateId !== templateFilter) return false;
      if (k) {
        if (!a.memberId) return false;
        const label = labelFor(a.memberId).toLowerCase();
        if (!label.includes(k)) return false;
      }
      return true;
    });
  }, [listQ.data, templateFilter, debouncedMemberKeyword, labelFor]);

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
          // labelFor 는 "이름 · 부서" 형태 또는 폴백 "이름 미확인" / "…" 반환
          return <Typography.Text strong>{labelFor(r.memberId)}</Typography.Text>;
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
      {
        title: '관리',
        key: 'action',
        width: 90,
        render: (_, r) => {
          // 과거 종료된 행은 history 보존을 위해 삭제 불가 (effectiveTo 가 오늘 이전)
          const isPast = !!r.effectiveTo
            && dayjs(r.effectiveTo).startOf('day').isBefore(dayjs().startOf('day'));
          if (isPast) {
            return <Typography.Text type="secondary" className="!tw-text-xs">이력</Typography.Text>;
          }
          return (
            <Button
              size="small"
              danger
              disabled={!r.memberAllowanceId}
              onClick={() =>
                modal.confirm({
                  title: '수당 삭제',
                  content: '현재 또는 미래에 적용될 수당 행을 삭제합니다. 이미 정산된 급여대장은 영향받지 않습니다.',
                  okText: '삭제',
                  okButtonProps: { danger: true },
                  cancelText: '취소',
                  onOk: () => deleteOneMut.mutateAsync(r.memberAllowanceId!),
                })
              }
            >
              삭제
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tplMap, labelFor, modal],
  );

  /* 단건 삭제 mutation */
  const deleteOneMut = useMutation({
    mutationFn: (id: string) => salaryApi.memberAllowanceAdmin.deleteOne(id),
    onSuccess: () => {
      void message.success('수당이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '삭제에 실패했습니다.');
    },
  });

  /* orphan 수당 정리 - Salary 가 없는 직원의 잔여 수당을 일괄 소프트 삭제 */
  const cleanupOrphansMut = useMutation({
    mutationFn: () => salaryApi.memberAllowanceAdmin.cleanupOrphans(),
    onSuccess: (closed) => {
      if (closed === 0) {
        void message.success('정리 대상 없음 - 모든 수당이 활성 직원에 연결되어 있습니다.');
      } else {
        void message.success(`orphan 수당 ${closed}건 정리 완료`);
        void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
      }
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '정리에 실패했습니다.');
    },
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 상단 액션 — 헤더 Title 은 외부 탭 라벨 [수당 관리] 와 중복이라 제거 */}
      <div className="tw-flex tw-justify-between tw-items-center">
        <Typography.Text type="secondary" className="!tw-text-sm">
          자격수당·직책수당 등 개인 차등 수당을 즉시 부여하고 직원별 적용 현황을 조회합니다.
        </Typography.Text>
        <Space>
          <Button
            onClick={() =>
              modal.confirm({
                title: 'orphan 수당 정리',
                content:
                  'Salary(급여) 가 한 건도 없는 직원의 잔여 수당을 일괄 소프트 삭제합니다. 이 작업은 되돌릴 수 없습니다.',
                okText: '정리',
                okButtonProps: { danger: true },
                cancelText: '취소',
                onOk: () => cleanupOrphansMut.mutateAsync(),
              })
            }
            loading={cleanupOrphansMut.isPending}
          >
            orphan 수당 정리
          </Button>
          <Button type="primary" onClick={() => setGrantOpen(true)}>
            + 수당 부여
          </Button>
        </Space>
      </div>

      <Card>
        {/*  */}
        {(() => {
          const commonItems = (tplQ.data ?? []).filter(
            (t) => t.itemType === 'EARNING' && t.applyToAllYn === 'Y',
          );
        })()}
        <Space wrap className="tw-mb-3">
          <Typography.Text type="secondary">조회 월:</Typography.Text>
          <DatePicker.MonthPicker
            value={listMonth}
            onChange={(d) => d && setListMonth(d)}
            format="YYYY-MM"
            allowClear={false}
          />
          <Typography.Text type="secondary">상태:</Typography.Text>
          <Select
            style={{ width: 150 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: 'ALL', label: '전체' },
              { value: 'AUTO', label: '관리자 즉시' },
              { value: 'APPROVED', label: '승인' },
              { value: 'PENDING', label: '대기' },
              { value: 'REJECTED', label: '반려' },
              { value: 'CANCELLED', label: '취소' },
            ]}
          />
          <Typography.Text type="secondary">항목:</Typography.Text>
          <Select
            style={{ width: 220 }}
            value={templateFilter}
            onChange={(v) => setTemplateFilter(v)}
            showSearch
            optionFilterProp="label"
            placeholder="항목 검색"
            options={[
              { value: 'ALL', label: '전체' },
              ...allFilterableTemplates.map((t) => ({
                value: t.salaryItemTemplateId!,
                label: t.applyToAllYn === 'Y'
                  ? `${t.itemName ?? '-'} (회사 공통)`
                  : (t.itemName ?? '-'),
              })),
            ]}
          />
          <Typography.Text type="secondary">직원:</Typography.Text>
          <Input
            placeholder="이름·부서 검색"
            value={memberKeyword}
            onChange={(e) => setMemberKeyword(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          <Typography.Text type="secondary">
            {filteredAllowances.length}건 / 전체 {(listQ.data ?? []).length}건
          </Typography.Text>
        </Space>
        <Typography.Paragraph type="secondary" className="!tw-text-xs !tw-mb-2">
          선택한 월의 어느 시점이라도 활성이었던 직원별 수당 부여 행을 표시합니다.
        </Typography.Paragraph>
        <Table<MemberAllowance>
          rowKey={(r) => r.memberAllowanceId ?? `${r.memberId}-${r.salaryItemTemplateId}-${r.effectiveFrom}`}
          loading={listQ.isLoading}
          dataSource={filteredAllowances}
          columns={listColumns}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="조건에 맞는 수당이 없습니다." /> }}
          size="middle"
        />
      </Card>

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
            extra="항목 선택 시 회사 기본 금액이 자동 채워집니다 - 필요하면 직원별 금액으로 수정하세요."
          >
            <Select
              loading={tplQ.isLoading}
              placeholder="자격수당, 직책수당, 자녀수당 등"
              options={allowanceTemplates.map((t) => ({
                value: t.salaryItemTemplateId!,
                label: t.defaultAmount != null
                  ? `${t.itemName ?? ''} - 기본 ${t.defaultAmount.toLocaleString('ko-KR')}원`
                  : `${t.itemName ?? ''} - 기본 미지정`,
              }))}
              onChange={(val: string) => {
                // 템플릿 선택 시 회사 기본 금액 자동 채움
                const tpl = allowanceTemplates.find((t) => t.salaryItemTemplateId === val);
                if (tpl?.defaultAmount != null) {
                  grantForm.setFieldValue('amount', tpl.defaultAmount);
                }
              }}
            />
          </Form.Item>

          {/* 선택된 템플릿의 비과세 한도 안내 */}
          <Form.Item
            shouldUpdate={(p, c) => p.salaryItemTemplateId !== c.salaryItemTemplateId}
            noStyle
          >
            {({ getFieldValue }) => {
              const tplId = getFieldValue('salaryItemTemplateId') as string | undefined;
              const tpl = allowanceTemplates.find((t) => t.salaryItemTemplateId === tplId);
              if (!tpl || tpl.monthlyNonTaxableLimit == null) return null;
              return (
                <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-xs">
                  월 비과세 한도: <b>{tpl.monthlyNonTaxableLimit.toLocaleString('ko-KR')}원</b>
                  {' '}(초과분은 과세)
                </Typography.Paragraph>
              );
            }}
          </Form.Item>

          <Form.Item
            label="금액 (원)"
            name="amount"
            rules={[
              { required: true, message: '금액을 입력해주세요.' },
              { type: 'number', min: 0, message: '0원 이상이어야 합니다.' },
            ]}
            extra="항목 선택 시 회사 기본값이 자동 채워집니다. 그대로 두거나 직원별로 조정 가능."
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
