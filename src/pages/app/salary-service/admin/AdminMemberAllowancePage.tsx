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
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { AppSearchBar } from '@/shared/ui';
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

/** 적용 기간 + 만료/임박 상태 판정 */
type AllowanceLifecycle = 'active' | 'soon' | 'expired';
function evalLifecycle(effectiveTo?: string | null): AllowanceLifecycle {
  if (!effectiveTo) return 'active';
  const end = dayjs(effectiveTo).startOf('day');
  const today = dayjs().startOf('day');
  if (end.isBefore(today)) return 'expired';
  if (end.diff(today, 'day') <= 30) return 'soon';
  return 'active';
}

function renderEffectivePeriod(from?: string | null, to?: string | null) {
  const lc = evalLifecycle(to);
  const text = (
    <span className={lc === 'expired' ? 'tw-text-slate-400' : ''}>
      {from ?? '—'} ~ {to ?? '진행중'}
    </span>
  );
  if (lc === 'expired') {
    return (
      <Space size={6}>
        {text}
        <Tag color="default">만료</Tag>
      </Space>
    );
  }
  if (lc === 'soon') {
    const days = dayjs(to!).startOf('day').diff(dayjs().startOf('day'), 'day');
    return (
      <Space size={6}>
        {text}
        <Tag color="orange">{days}일 후 종료</Tag>
      </Space>
    );
  }
  return text;
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
  // 퇴직 정산 cascade 가 자동 생성하는 항목들 - 사직서 승인된 직원에게만 수동 부여 허용
  const RETIREMENT_AUTO_ITEMS = useMemo(
    () => new Set(['퇴직금', '퇴직월 일할 급여', '미사용 연차 수당']),
    [],
  );
  const allowanceTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    // 부여 모달에 노출할 항목: 모든 EARNING (개인 차등 + 회사 공통). 기본급만 제외.
    // 퇴직 자동 생성 항목은 옵션에 보이되 라벨에 안내 추가, 부여 시 BE 가 사직서 승인 여부 검증.
    return list.filter((t) => t.itemType === 'EARNING' && t.itemName !== '기본급');
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

  /* ── 5) 신규 부여 모달 - 다중 행 (직원 × 수당 항목 자유 조합) ── */
  type GrantRow = {
    memberId?: string;
    salaryItemTemplateId?: string;
    amount?: number;
  };
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm] = Form.useForm<{
    rows: GrantRow[];
    effectiveFrom: dayjs.Dayjs;
  }>();

  // 단건 mutation - 다중 행 부여 시 Promise.all 로 N번 호출
  const autoGrantMut = useMutation({
    mutationFn: (payload: {
      memberId: string;
      salaryItemTemplateId: string;
      amount: number;
      effectiveFrom: string;
    }) => salaryApi.memberAllowanceAdmin.autoGrant(payload),
  });

  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const onSubmitGrant = async () => {
    try {
      const v = await grantForm.validateFields();
      const effectiveFromStr = v.effectiveFrom.format('YYYY-MM-DD');
      const rows = (v.rows ?? []).filter(
        (r) => r.memberId && r.salaryItemTemplateId && r.amount != null,
      );
      if (rows.length === 0) {
        void message.warning('최소 1행 이상 입력해주세요.');
        return;
      }
      setBulkSubmitting(true);
      const results = await Promise.allSettled(
        rows.map((r) =>
          autoGrantMut.mutateAsync({
            memberId: r.memberId!,
            salaryItemTemplateId: r.salaryItemTemplateId!,
            amount: r.amount!,
            effectiveFrom: effectiveFromStr,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      setBulkSubmitting(false);
      if (fail === 0) {
        void message.success(`${ok}건 즉시 적용 완료`);
        setGrantOpen(false);
        grantForm.resetFields();
      } else if (ok === 0) {
        void message.error(`${fail}건 모두 실패했습니다. 입력을 확인해주세요.`);
      } else {
        void message.warning(`${ok}건 성공 / ${fail}건 실패. 실패한 행은 다시 부여해주세요.`);
      }
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'list'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'active-by-member'] });
    } catch {
      // form invalid - antd 가 표시
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

  /* ── 6.5) 보기 모드 ── */
  const [viewMode, setViewMode] = useState<'flat' | 'byMember'>('flat');

  /* 전체 이력 query - 상세 모드 진입 시에만 fetch */
  const historyQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'history'],
    queryFn: () => salaryApi.memberAllowanceAdmin.listAllHistory(),
    enabled: viewMode === 'byMember',
    staleTime: 30_000,
  });

  /** 상세 모드용 - 활성 + 종료 모두 직원별 그룹 (효력일 역순) */
  const groupedHistoryByMember = useMemo(() => {
    const rows = historyQ.data ?? [];
    const map = new Map<string, MemberAllowance[]>();
    for (const a of rows) {
      const key = a.memberId ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .map(([memberId, items]) => {
        const sorted = items.sort((a, b) =>
          (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''),
        );
        const activeSum = sorted
          .filter((i) => evalLifecycle(i.effectiveTo) !== 'expired')
          .reduce((s, i) => s + (i.amount ?? 0), 0);
        return {
          memberId,
          label: memberId === '__none__' ? '직원 미상' : labelFor(memberId),
          items: sorted,
          activeCount: sorted.filter((i) => evalLifecycle(i.effectiveTo) !== 'expired').length,
          historyCount: sorted.filter((i) => evalLifecycle(i.effectiveTo) === 'expired').length,
          activeSum,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [historyQ.data, labelFor]);

  const kpis = useMemo(() => {
    let activeCount = 0;
    let monthlySum = 0;
    const memberSet = new Set<string>();
    for (const a of filteredAllowances) {
      const lc = evalLifecycle(a.effectiveTo);
      if (lc === 'expired') continue;
      activeCount++;
      monthlySum += a.amount ?? 0;
      if (a.memberId) memberSet.add(a.memberId);
    }
    return { activeCount, memberSum: memberSet.size, monthlySum };
  }, [filteredAllowances]);

  /** 직원별 그룹화 - byMember 뷰용 */
  const groupedByMember = useMemo(() => {
    const map = new Map<string, MemberAllowance[]>();
    for (const a of filteredAllowances) {
      const key = a.memberId ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    // 직원 라벨 기준 정렬
    return [...map.entries()]
      .map(([memberId, items]) => ({
        memberId,
        label: memberId === '__none__' ? '직원 미상' : labelFor(memberId),
        items,
        activeSum: items
          .filter((i) => evalLifecycle(i.effectiveTo) !== 'expired')
          .reduce((s, i) => s + (i.amount ?? 0), 0),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredAllowances, labelFor]);

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
        render: (_, r) => renderEffectivePeriod(r.effectiveFrom, r.effectiveTo),
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
              disabled={!r.memberAllowanceId}
              onClick={() =>
                modal.confirm({
                  title: '수당 종료',
                  content: '오늘 자로 종료 처리합니다 (이전 정산 이력 보존). 다음 달부터 합산 안 됨.',
                  okText: '종료',
                  cancelText: '취소',
                  onOk: () => closeOneMut.mutateAsync(r.memberAllowanceId!),
                })
              }
            >
              종료
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tplMap, labelFor, modal],
  );

  /* 단건 종료 mutation - effectiveTo set, 이력 보존 */
  const closeOneMut = useMutation({
    mutationFn: (id: string) => salaryApi.memberAllowanceAdmin.closeOne(id),
    onSuccess: () => {
      void message.success('수당이 종료되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '종료에 실패했습니다.');
    },
  });

  /* 단건 완전 삭제 mutation - 이력 X (실수 정정용) */
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
          <Button type="primary" onClick={() => setGrantOpen(true)}>
            + 수당 부여
          </Button>
        </Space>
      </div>

      <Card>
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
          <AppSearchBar
            placeholder="이름·부서 검색"
            value={memberKeyword}
            onValueChange={setMemberKeyword}
            onSearch={setMemberKeyword}
            ariaLabel="수당 직원 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[280px]"
          />
          <Typography.Text type="secondary">
            {filteredAllowances.length}건 / 전체 {(listQ.data ?? []).length}건
          </Typography.Text>
        </Space>
        <div className="tw-flex tw-justify-between tw-items-center tw-mb-2 tw-flex-wrap tw-gap-2">
          <Space size={12} wrap>
            <Typography.Text type="secondary" className="!tw-text-xs">
              선택한 월의 어느 시점이라도 활성이었던 직원별 수당 부여 행을 표시합니다.
            </Typography.Text>
            <Space size={6}>
              <Tag color="blue" className="!tw-mr-0">파랑</Tag>
              <Typography.Text type="secondary" className="!tw-text-xs">지급 중</Typography.Text>
              <Tag color="orange" className="!tw-mr-0">주황</Tag>
              <Typography.Text type="secondary" className="!tw-text-xs">종료 임박 (30일 내)</Typography.Text>
            </Space>
          </Space>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(v) => setViewMode(v as 'flat' | 'byMember')}
            options={[
              { label: '지급 중', value: 'flat' },
              { label: '전체 이력', value: 'byMember' },
            ]}
          />
        </div>

        {viewMode === 'flat' ? (
          groupedByMember.length === 0 ? (
            <Empty description="조건에 맞는 수당이 없습니다." />
          ) : (
            <Table
              rowKey={(g) => g.memberId}
              dataSource={groupedByMember}
              pagination={false}
              size="middle"
              columns={[
                {
                  title: '직원',
                  key: 'member',
                  width: 200,
                  render: (_, g) => <Typography.Text strong>{g.label}</Typography.Text>,
                },
                {
                  title: '수당 항목',
                  key: 'items',
                  render: (_, g) => (
                    <Space size={[6, 6]} wrap>
                      {g.items.map((it) => {
                        const lc = evalLifecycle(it.effectiveTo);
                        const itemName = tplMap.get(it.salaryItemTemplateId ?? '')?.itemName ?? '—';
                        // 조회 월에 어느 시점이라도 활성이었던 행은 BE 가 이미 걸러서 내려줌
                        // -> 이 화면에 보이는 모든 행은 "그 달에 지급되었거나 지급 중"
                        // 종료 임박만 주황, 종료된 것 포함 그 외는 모두 파랑 (회색 안 씀)
                        const tagColor = lc === 'soon' ? 'orange' : 'blue';
                        const endedLabel = lc === 'expired' && it.effectiveTo
                          ? ` · ${dayjs(it.effectiveTo).format('M/D')} 종료`
                          : '';
                        const tooltipContent = (
                          <div className="tw-text-xs">
                            <div>{it.effectiveFrom ?? '—'} ~ {it.effectiveTo ?? '진행중'}</div>
                            {it.reason && <div className="tw-mt-1">{it.reason}</div>}
                          </div>
                        );
                        return (
                          <Tooltip key={it.memberAllowanceId ?? `${itemName}-${it.effectiveFrom}`} title={tooltipContent}>
                            <Tag
                              color={tagColor}
                              className="!tw-px-2 !tw-py-0.5 !tw-text-sm"
                              closable={!!it.memberAllowanceId && lc !== 'expired'}
                              onClose={(e) => {
                                e.preventDefault();
                                modal.confirm({
                                  title: `${g.label} - ${itemName} (${formatWon(it.amount ?? 0)})`,
                                  width: 480,
                                  content: '오늘 자로 종료 처리합니다. 이전 정산 이력은 그대로 보존됩니다.',
                                  okText: '종료',
                                  cancelText: '취소',
                                  onOk: () => closeOneMut.mutateAsync(it.memberAllowanceId!),
                                });
                              }}
                            >
                              {itemName} {formatWon(it.amount ?? 0)}{endedLabel}
                            </Tag>
                          </Tooltip>
                        );
                      })}
                    </Space>
                  ),
                },
                {
                  title: '월 합계',
                  key: 'sum',
                  width: 140,
                  align: 'right' as const,
                  render: (_, g) => (
                    <Typography.Text strong className="!tw-text-blue-600">
                      {formatWon(g.activeSum)}
                    </Typography.Text>
                  ),
                  sorter: (a, b) => a.activeSum - b.activeSum,
                },
              ]}
            />
          )
        ) : historyQ.isLoading ? (
          <Empty description="이력 불러오는 중..." />
        ) : groupedHistoryByMember.length === 0 ? (
          <Empty description="이력이 없습니다." />
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Typography.Text type="secondary" className="!tw-text-xs">
              직원별 수당 이력 (활성 + 종료 모두, 효력일 역순). 종료된 수당은 회색으로 표시됩니다.
            </Typography.Text>
            {groupedHistoryByMember.map((g) => (
              <Card
                key={g.memberId}
                size="small"
                title={
                  <Space>
                    <Typography.Text strong>{g.label}</Typography.Text>
                    <Tag color="blue">활성 {g.activeCount}건</Tag>
                    {g.historyCount > 0 && <Tag>이력 {g.historyCount}건</Tag>}
                  </Space>
                }
                extra={
                  <Typography.Text strong className="!tw-text-blue-600">
                    현재 월 합계 {formatWon(g.activeSum)}
                  </Typography.Text>
                }
              >
                <Table<MemberAllowance>
                  rowKey={(r) => r.memberAllowanceId ?? `${r.memberId}-${r.salaryItemTemplateId}-${r.effectiveFrom}`}
                  dataSource={g.items}
                  columns={listColumns.slice(1)}
                  pagination={false}
                  size="small"
                  rowClassName={(r) =>
                    evalLifecycle(r.effectiveTo) === 'expired' ? '!tw-bg-slate-50/60 tw-text-slate-400' : ''
                  }
                />
              </Card>
            ))}
          </Space>
        )}
      </Card>

      {/* 신규 부여 모달 - 다중 행 일괄 부여 */}
      <Modal
        title="수당 부여 (여러 직원 / 여러 항목 한꺼번에)"
        open={grantOpen}
        onCancel={() => setGrantOpen(false)}
        onOk={onSubmitGrant}
        confirmLoading={bulkSubmitting}
        okText="일괄 부여"
        cancelText="취소"
        destroyOnHidden
        width={1100}
      >
        <Form
          form={grantForm}
          layout="vertical"
          initialValues={{
            // 실무 관행: 수당은 월 1일 기준으로 적용. 26일 같이 늦게 입력하면 다음 달 1일로 조정 권장.
            effectiveFrom: dayjs().startOf('month'),
            rows: [{ memberId: undefined, salaryItemTemplateId: undefined, amount: undefined }],
          }}
        >
          <Form.Item
            label="공통 적용 시작일"
            name="effectiveFrom"
            rules={[{ required: true, message: '적용 시작일을 선택해주세요.' }]}
            extra="모든 행에 동일하게 적용됩니다. 선택일부터 정산 시 자동 합산."
          >
            <DatePicker style={{ width: 240 }} />
          </Form.Item>

          <Form.List name="rows">
            {(fields, { add, remove }) => (
              <div>
                <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
                  <Typography.Text strong>부여 행 ({fields.length}건)</Typography.Text>
                  <Space>
                    <Button
                      size="small"
                      onClick={() =>
                        add({ memberId: undefined, salaryItemTemplateId: undefined, amount: undefined })
                      }
                    >
                      + 직원 추가
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        const rows = (grantForm.getFieldValue('rows') ?? []) as GrantRow[];
                        const last = rows[rows.length - 1];
                        if (!last) {
                          add({ memberId: undefined, salaryItemTemplateId: undefined, amount: undefined });
                        } else {
                          add({
                            memberId: undefined,
                            salaryItemTemplateId: last.salaryItemTemplateId,
                            amount: last.amount,
                          });
                        }
                      }}
                    >
                      + 같은 항목·금액 복사
                    </Button>
                  </Space>
                </div>

                {/* 헤더 */}
                <div className="tw-grid tw-grid-cols-[1fr_1fr_180px_180px_40px] tw-gap-2 tw-px-2 tw-py-1 tw-text-xs tw-text-slate-500 tw-bg-slate-50 tw-rounded">
                  <div>대상 직원 *</div>
                  <div>수당 항목 *</div>
                  <div>금액 (원) *</div>
                  <div>비과세 한도</div>
                  <div></div>
                </div>

                {/* 행들 */}
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="tw-grid tw-grid-cols-[1fr_1fr_180px_180px_40px] tw-gap-2 tw-items-start tw-px-2 tw-py-2 tw-border-b tw-border-slate-100"
                  >
                    <Form.Item
                      name={[field.name, 'memberId']}
                      rules={[{ required: true, message: '직원 선택' }]}
                      className="!tw-mb-0"
                    >
                      <MemberSearchSelect width="100%" placeholder="이름·이메일" />
                    </Form.Item>

                    <Form.Item
                      name={[field.name, 'salaryItemTemplateId']}
                      rules={[{ required: true, message: '항목 선택' }]}
                      className="!tw-mb-0"
                    >
                      <Select
                        loading={tplQ.isLoading}
                        placeholder="항목 선택"
                        options={allowanceTemplates.map((t) => {
                          const isCommon = t.applyToAllYn === 'Y';
                          const isRetirement = RETIREMENT_AUTO_ITEMS.has(t.itemName ?? '');
                          const tags: string[] = [];
                          if (isCommon) tags.push('회사공통');
                          if (isRetirement) tags.push('사직서 승인 후');
                          const suffix = tags.length ? ` (${tags.join(' / ')})` : '';
                          return {
                            value: t.salaryItemTemplateId!,
                            label: `${t.itemName ?? ''}${suffix}`,
                          };
                        })}
                        onChange={(val: string) => {
                          // 템플릿 선택 시 default 금액 자동 채움
                          const tpl = allowanceTemplates.find((t) => t.salaryItemTemplateId === val);
                          if (tpl?.defaultAmount != null) {
                            const rows = (grantForm.getFieldValue('rows') ?? []) as GrantRow[];
                            rows[field.name] = { ...rows[field.name], amount: tpl.defaultAmount };
                            grantForm.setFieldValue('rows', [...rows]);
                          }
                        }}
                      />
                    </Form.Item>

                    <Form.Item
                      name={[field.name, 'amount']}
                      rules={[
                        { required: true, message: '금액 입력' },
                        { type: 'number', min: 0, message: '0원 이상' },
                      ]}
                      className="!tw-mb-0"
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        step={10000}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(v) => Number((v ?? '').replace(/,/g, '')) as 0}
                      />
                    </Form.Item>

                    {/* 비과세 한도 표시 */}
                    <Form.Item
                      shouldUpdate
                      noStyle
                    >
                      {({ getFieldValue }) => {
                        const tplId = getFieldValue(['rows', field.name, 'salaryItemTemplateId']) as string | undefined;
                        const tpl = allowanceTemplates.find((t) => t.salaryItemTemplateId === tplId);
                        if (!tpl || tpl.monthlyNonTaxableLimit == null) {
                          return <Typography.Text type="secondary" className="!tw-text-xs">—</Typography.Text>;
                        }
                        return (
                          <Typography.Text type="secondary" className="!tw-text-xs">
                            월 {tpl.monthlyNonTaxableLimit.toLocaleString('ko-KR')}원
                          </Typography.Text>
                        );
                      }}
                    </Form.Item>

                    <Button
                      size="small"
                      danger
                      type="text"
                      disabled={fields.length === 1}
                      onClick={() => remove(field.name)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Form.List>

          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-3 !tw-text-xs">
            * 관리자가 부여할시에 별도 결재 없이 즉시 활성화됩니다.
            <br />
            * 같은 직원에게 여러 항목 부여하려면 [+ 직원 추가], 같은 항목을 여러 직원에게 차등 금액으로 부여하려면 [+ 같은 항목·금액 복사] 후 직원만 변경하세요.
          </Typography.Paragraph>
        </Form>
      </Modal>
    </Space>
  );
}

export default AdminMemberAllowancePage;
