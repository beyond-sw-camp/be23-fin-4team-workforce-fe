/** /app/salary/settings — 급여 정책·템플릿·직원 급여·세율 등 (시스템 관리자) */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { hasActivePayGradeSalaryPolicy } from '@/features/salary-service/lib/salaryPolicyAccess';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { memberApi } from '@/features/member/api/memberApi';
import { AdminPayGradeTablePage } from '@/pages/app/salary-service/admin/AdminPayGradeTablePage';
import type {
  ComprehensiveOvertimeStatus,
  Salary,
  SalaryPolicy,
  SalaryItemTemplate,
  TaxRate,
  WageSystemTypeCode,
  PeriodStartTypeCode,
  PeriodEndTypeCode,
  PayDayShiftRuleCode,
  ProrationMethodCode,
  TaxTypeCode,
  ItemTypeCode,
} from '@/features/salary-service/types';
import { TAX_CAP_SUPPORTED_TYPES } from '@/features/salary-service/types';

/* ─── 공통 한글 맵 ─── */

const WAGE_SYS_KO: Record<string, string> = { COMPREHENSIVE: '포괄', NON_COMPREHENSIVE: '비포괄' };
const TAX_TYPE_KO: Record<string, string> = {
  NATIONAL_PENSION: '국민연금',
  HEALTH_INSURANCE: '건강보험',
  LONG_TERM_CARE: '장기요양',
  EMPLOYMENT_INSURANCE: '고용보험',
  ACCIDENT_INSURANCE: '산재보험',
  INCOME_TAX: '소득세',
  LOCAL_INCOME_TAX: '지방소득세',
};
const ITEM_TYPE_KO: Record<string, string> = { EARNING: '지급', DEDUCTION: '공제' };
const PAY_DAY_SHIFT_KO: Record<string, string> = {
  BEFORE: '직전 영업일',
  AFTER: '직후 영업일',
  NONE: '해당일 그대로',
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * `GET /member/search`(member-service, QueryDSL) — **호출자와 동일 회사** 사원만.
 * ES 인덱스(`/search/employees`) 없어도 동작한다.
 */
function MemberIdSearchField({
  name = 'memberId',
  initialMemberId,
}: {
  name?: string;
  /** deep-link 등으로 폼에 미리 박혀 들어온 memberId — 검색하지 않아도 이름이 보이도록
   *  옵션에 미리 끼워준다. */
  initialMemberId?: string;
}) {
  const [searchText, setSearchText] = useState('');
  const debounced = useDebouncedValue(searchText, 320);
  const { data: rows = [], isFetching, isError, error } = useQuery({
    queryKey: ['member', 'search', 'salary-settings', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
    retry: 1,
  });

  // deep-link 진입 시: 검색 결과가 비었어도 이름이 보이도록 사전 조회.
  const prefillQ = useQuery({
    queryKey: ['member', 'detail-or-null', 'salary-prefill', initialMemberId],
    queryFn: () => memberApi.detailOrNull(initialMemberId!),
    enabled: Boolean(initialMemberId?.trim()),
    staleTime: 60_000,
  });

  const options = useMemo(() => {
    const baseOptions = rows.map((m) => ({
      value: m.memberId,
      label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
    }));
    if (initialMemberId && !baseOptions.some((o) => o.value === initialMemberId)) {
      const prefill = prefillQ.data;
      const label = prefill
        ? `${prefill.name ?? '이름 없음'} · ${prefill.email ?? '—'}`
        : prefillQ.isLoading
          ? '직원 정보 불러오는 중…'
          : '직원 정보를 찾을 수 없습니다';
      baseOptions.unshift({ value: initialMemberId, label });
    }
    return baseOptions;
  }, [rows, initialMemberId, prefillQ.data, prefillQ.isLoading]);
  const errMsg = isError
    ? (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '검색에 실패했습니다.')
    : null;
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
          debounced.trim().length < 1 ? (
            <span className="tw-text-slate-500">한 글자 이상 입력하세요</span>
          ) : isFetching ? (
            '검색 중…'
          ) : errMsg ? (
            <span className="tw-text-red-600">{errMsg}</span>
          ) : (
            '검색 결과 없음'
          )
        }
        options={options}
        loading={isFetching}
      />
    </Form.Item>
  );
}

/* ======================================================================
 * 1. 급여 이력 (Salary) — 연봉 인상 / 직급 변경 이력
 *    신규 입사 시 기본급은 Kafka 이벤트로 자동 생성되므로,
 *    이 탭은 "급여 변경 이력"을 쌓는 용도. 실수로 입사 당일과 같은
 *    effectiveFrom으로 등록하면 auto-create된 Salary가 마감되고
 *    중복 이력이 쌓이니 주의.
 * ====================================================================== */

type SalaryFormValues = {
  memberId: string;
  salaryPolicyId: string;
  baseSalary?: number;
  /** 호봉제 정책일 때만 */
  step?: number | null;
  /** 직급명·직책명은 신규 입사 시 인사정보로 입력되므로 모달에서는 표시·입력하지 않음.
   *  기존 행 수정 시 값 보존을 위해 form 상태로만 유지 */
  jobGradeName?: string;
  jobTitleName?: string;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
  /** 부양가족수 0~11, 기본 1=본인만, 소득세 간이세액표 룩업용 */
  dependentCount?: number;
  /** 8세 이상 20세 이하 자녀 수 — 자녀세액공제 차원 */
  childUnder20Count?: number;
  /** 소득세 감면 유형. NONE = 감면 없음 (기본) */
  taxReductionType?: 'NONE' | 'YOUTH_SME' | 'DISABLED' | 'FOREIGNER' | 'ETC';
  /** 감면율 0~100 (UI 표시용 %). 제출 시 1/100 으로 변환해 0.00~1.00 으로 전송 */
  taxReductionRatePct?: number;
  /** 감면 종료일 */
  taxReductionEffectiveToDate?: dayjs.Dayjs | null;
  /** 등록 시 함께 부여할 부가 수당 — 항목 select 만 받고 금액은 template.defaultAmount 자동 사용.
   *  amount 필드는 제출 시 자동 lookup 되므로 form 에는 없음. */
  allowances?: { salaryItemTemplateId?: string }[];
};

type SalaryTabProps = {
  /** deep-link 로 진입했을 때, 이 직원으로 prefill 된 [급여 등록] 모달을 자동으로 1회 오픈.
   *  - 직원 생성 직후 흐름: MemberCreateModal 이 멤버 생성 후 이 파라미터로 이동
   *  - 직원 상세 [급여 등록] 빠른 액션: MemberDetailPage 가 이 파라미터로 이동
   *  - [급여 등록] 탭 안에서 인라인으로 모달만 띄울 때 (tableHidden=true 와 함께 사용) */
  createForMemberId?: string;
  /** 테이블·필터·안내 Alert·상단 [+ 새 변동 추가] 버튼을 모두 숨기고 모달만 렌더한다.
   *  [급여 등록] 탭이 자기 테이블을 갖고 있어, 모달 진입 통로로만 SalaryTab 을 재활용할 때 사용. */
  tableHidden?: boolean;
  /** 모달이 (취소·저장 어느 쪽으로든) 닫혔을 때 부모에게 통지. tableHidden 모드에서 부모가
   *  [급여 등록] 버튼 상태(prefill memberId) 를 reset 하기 위해 사용. */
  onModalClose?: () => void;
};

export function SalaryTab({ createForMemberId, tableHidden = false, onModalClose }: SalaryTabProps = {}) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Salary | null>(null);
  const [form] = Form.useForm<SalaryFormValues>();

  const listQ = useQuery({ queryKey: ['salary', 'salaries'], queryFn: () => salaryApi.salary.listByCompany() });
  const policiesQ = useQuery({ queryKey: ['salary', 'salary-policies'], queryFn: () => salaryApi.salaryPolicy.list() });
  const payGradesQ = useQuery({
    queryKey: ['salary', 'pay-grade-table'],
    queryFn: () => salaryApi.payGradeTable.list(),
  });
  /** 회사 공통 수당 항목 — 급여 등록 시 함께 부여 가능한 EARNING 항목 (자격수당·직책수당 등) */
  const tplQ = useQuery({
    queryKey: ['salary', 'salary-item-templates', 'allowance-options'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
  });
  /** 부가 수당 부여 가능 템플릿 — 기본급만 제외한 모든 EARNING 항목.
   *  회사 공통(Y) 도 노출 — 직원별 다른 금액이 필요할 때 override 용으로 부여 가능.
   *  defaultAmount 가 미지정인 항목은 dropdown 에서 disabled (먼저 지급 항목(수당) 에서 금액 셋업 필요). */
  const allowanceTemplates = useMemo(
    () =>
      (tplQ.data ?? [])
        .filter((t) => t.itemType === 'EARNING' && t.itemName !== '기본급'),
    [tplQ.data],
  );
  const allowanceTemplateOptions = useMemo(
    () =>
      allowanceTemplates.map((t) => {
        const hasAmount = t.defaultAmount != null;
        const scope = t.applyToAllYn === 'Y' ? '회사 공통' : '개인 차등';
        return {
          value: t.salaryItemTemplateId!,
          label: hasAmount
            ? `${t.itemName ?? ''} · ${t.defaultAmount!.toLocaleString('ko-KR')}원 (${scope})`
            : `${t.itemName ?? ''} · 금액 미지정 (지급 항목 메뉴에서 먼저 셋업)`,
          disabled: !hasAmount,
        };
      }),
    [allowanceTemplates],
  );
  /** mutation 실행 시 stale closure 회피용 - 항상 최신 tplQ.data 참조하기 위한 ref */
  const tplDataRef = useRef(tplQ.data);
  useEffect(() => {
    tplDataRef.current = tplQ.data;
  }, [tplQ.data]);

  /** 템플릿 ID -> defaultAmount 빠른 조회용 (제출 시 amount 자동 채움) */
  const tplDefaultAmountMap = useMemo(() => {
    const m = new Map<string, number | null>();
    allowanceTemplates.forEach((t) => {
      if (t.salaryItemTemplateId) m.set(t.salaryItemTemplateId, t.defaultAmount ?? null);
    });
    return m;
  }, [allowanceTemplates]);

  /** 회사에 활성 급여 정책이 1개만 있으면 자동 선택 (사용자가 매번 고를 필요 없음).
   *  활성 = effectiveFrom <= 오늘 && (effectiveTo == null || effectiveTo >= 오늘) */
  const activePolicies = useMemo(() => {
    const today = dayjs().startOf('day');
    return (policiesQ.data ?? []).filter((p) => {
      const fromOk = !p.effectiveFrom || !dayjs(p.effectiveFrom).startOf('day').isAfter(today);
      const toOk = !p.effectiveTo || !dayjs(p.effectiveTo).startOf('day').isBefore(today);
      return fromOk && toOk;
    });
  }, [policiesQ.data]);
  const defaultPolicyId = activePolicies[0]?.salaryPolicyId ?? '';

  /** 현재 활성 호봉 (effectiveTo 없음) 만 추출, step 오름차순 */
  const activePayGrades = useMemo(
    () =>
      (payGradesQ.data ?? [])
        .filter((p) => p.effectiveTo == null && p.step != null)
        .sort((a, b) => (a.step ?? 0) - (b.step ?? 0)),
    [payGradesQ.data],
  );

  const payGradeStepMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of activePayGrades) {
      if (p.step != null && p.baseSalary != null) m.set(p.step, p.baseSalary);
    }
    return m;
  }, [activePayGrades]);

  const createM = useMutation({
    mutationFn: async (v: SalaryFormValues) => {
      console.log('[SALARY-CREATE] submit values', {
        memberId: v.memberId,
        allowancesRaw: v.allowances,
        allowancesLength: (v.allowances ?? []).length,
      });
      // 1) 급여 이력 등록
      // 호봉제일 때도 baseSalary 는 함께 전송 — onValuesChange 에서 호봉표 lookup 값이
      // form 에 자동 채워져 있으므로 그대로 보내면 된다 (백엔드는 baseSalary 필수).
      const saved = await salaryApi.salary.create({
        memberId: v.memberId.trim(),
        salaryPolicyId: v.salaryPolicyId,
        baseSalary: v.baseSalary ?? null,
        step: v.step ?? null,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        dependentCount: v.dependentCount ?? 1,
        childUnder20Count: v.childUnder20Count ?? 0,
        taxReductionType: v.taxReductionType ?? 'NONE',
        taxReductionRate:
          v.taxReductionRatePct != null && v.taxReductionRatePct > 0
            ? Number((v.taxReductionRatePct / 100).toFixed(2))
            : null,
        taxReductionEffectiveTo:
          v.taxReductionEffectiveToDate?.format('YYYY-MM-DD') ?? null,
      });
      // 2) 부가 수당 함께 등록 - ref 로 최신 tplData 참조 (closure stale 회피)
      const tplDataNow = tplDataRef.current ?? [];
      console.log('[SALARY-CREATE] tplDataNow snapshot', {
        count: tplDataNow.length,
        ids: tplDataNow.map((t) => t.salaryItemTemplateId).slice(0, 10),
      });
      const lookupAmount = (templateId: string): number | null => {
        const tpl = tplDataNow.find((t) => t.salaryItemTemplateId === templateId);
        return tpl?.defaultAmount ?? null;
      };
      const validAllowances = (v.allowances ?? [])
        .map((a) => ({
          salaryItemTemplateId: a.salaryItemTemplateId,
          amount: a.salaryItemTemplateId ? lookupAmount(a.salaryItemTemplateId) : null,
        }))
        .filter((a) => a.salaryItemTemplateId && a.amount != null && a.amount > 0);
      if ((v.allowances ?? []).length > 0 && validAllowances.length === 0) {
        console.warn('[SALARY-CREATE] allowances were selected but none have amount lookup',
          { selected: v.allowances, tplCount: tplDataNow.length });
      }
      console.log('[SALARY-CREATE] validAllowances after filter', validAllowances);
      const grantResults = await Promise.allSettled(
        validAllowances.map((a) =>
          salaryApi.memberAllowanceAdmin.autoGrant({
            memberId: v.memberId.trim(),
            salaryItemTemplateId: a.salaryItemTemplateId!,
            amount: a.amount!,
            effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
          }),
        ),
      );
      grantResults.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error('[SALARY-CREATE] autoGrant 실패', validAllowances[i], r.reason);
        }
      });
      const grantFailed = grantResults.filter((r) => r.status === 'rejected').length;
      return { saved, grantTotal: validAllowances.length, grantFailed };
    },
    onSuccess: ({ grantTotal, grantFailed }) => {
      if (grantTotal === 0) {
        message.success('급여 등록 완료');
      } else if (grantFailed === 0) {
        message.success(`급여 등록 완료 - 수당 ${grantTotal}건 함께 부여됨`);
      } else {
        message.warning(`급여는 등록됐지만 수당 ${grantFailed}/${grantTotal}건 부여 실패. [수당 관리] 에서 확인해주세요.`);
      }
      setOpen(false);
      form.resetFields();
      onModalClose?.();
      void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'salaries', 'precheck'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'list'] });
    },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const updateM = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: SalaryFormValues }) => {
      // 1) 급여 본체 수정
      const updated = await salaryApi.salary.update(id, {
        salaryPolicyId: v.salaryPolicyId,
        // 호봉제: form.baseSalary 에 호봉표 lookup 값이 자동 채워져 있어 그대로 전송
        // 연봉제: 사용자 입력값
        baseSalary: v.baseSalary ?? null,
        step: v.step ?? null,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        dependentCount: v.dependentCount ?? 1,
        childUnder20Count: v.childUnder20Count ?? 0,
        taxReductionType: v.taxReductionType ?? 'NONE',
        taxReductionRate:
          v.taxReductionRatePct != null && v.taxReductionRatePct > 0
            ? Number((v.taxReductionRatePct / 100).toFixed(2))
            : null,
        taxReductionEffectiveTo:
          v.taxReductionEffectiveToDate?.format('YYYY-MM-DD') ?? null,
      });

      // 2) 부가 수당 diff 처리 - 추가/제거된 templateId 만 API 호출
      const memberId = editing?.memberId ?? '';
      const effectiveFrom = v.effectiveRange[0].format('YYYY-MM-DD');
      const submittedIds = new Set(
        (v.allowances ?? [])
          .map((a) => a.salaryItemTemplateId)
          .filter((x): x is string => Boolean(x)),
      );
      const originalIds = editingOriginalAllowanceIdsRef.current;
      const toAdd = [...submittedIds].filter((tid) => !originalIds.has(tid));
      const toRemove = [...originalIds].filter((tid) => !submittedIds.has(tid));
      console.log('[SALARY-UPDATE] allowance diff', {
        memberId,
        submitted: [...submittedIds],
        original: [...originalIds],
        toAdd,
        toRemove,
        effectiveFrom,
      });

      const tplDataNow = tplDataRef.current ?? [];
      let allowanceFailed = 0;
      if (memberId && (toAdd.length > 0 || toRemove.length > 0)) {
        const ops: Promise<unknown>[] = [];
        for (const tid of toAdd) {
          const tpl = tplDataNow.find((t) => t.salaryItemTemplateId === tid);
          const amount = tpl?.defaultAmount ?? null;
          if (amount == null || amount <= 0) {
            console.warn('[SALARY-UPDATE] add 스킵 - 금액 없음', tid, tpl);
            allowanceFailed++;
            continue;
          }
          ops.push(
            salaryApi.memberAllowanceAdmin.autoGrant({
              memberId,
              salaryItemTemplateId: tid,
              amount,
              effectiveFrom,
            }),
          );
        }
        // 종료일은 새 salary effectiveFrom 의 전날로 설정 (그 다음날부터 빠지도록)
        const closeAtForRemove = dayjs(effectiveFrom).subtract(1, 'day').format('YYYY-MM-DD');
        // 편집 대상 salary 의 effectiveFrom 이 미래(아직 적용 안 됨)면 - 해제된 수당도 아직 적용 안 된
        // 미래 row 일 가능성이 높으므로 close 대신 hard-delete (소프트 삭제). 과거/오늘이면 close 로 history 보존.
        const isFutureSalary = dayjs(effectiveFrom).startOf('day').isAfter(dayjs().startOf('day'));
        for (const tid of toRemove) {
          if (isFutureSalary) {
            ops.push(
              salaryApi.memberAllowanceAdmin.deleteByTemplate({
                memberId,
                templateId: tid,
              }),
            );
          } else {
            ops.push(
              salaryApi.memberAllowanceAdmin.closeByTemplate({
                memberId,
                templateId: tid,
                closeAt: closeAtForRemove,
              }),
            );
          }
        }
        const results = await Promise.allSettled(ops);
        results.forEach((res, i) => {
          if (res.status === 'rejected') {
            console.error('[SALARY-UPDATE] op 실패', i, res.reason);
          }
        });
        allowanceFailed += results.filter((r) => r.status === 'rejected').length;
      }
      return { updated, addCount: toAdd.length, removeCount: toRemove.length, allowanceFailed };
    },
    onSuccess: ({ addCount, removeCount, allowanceFailed }) => {
      const changedSummary = (addCount > 0 || removeCount > 0)
        ? ` - 수당 추가 ${addCount}, 종료 ${removeCount}건`
        : '';
      if (allowanceFailed > 0) {
        message.warning(`수정 완료 (수당 변경 일부 실패 ${allowanceFailed}건). [수당 관리] 에서 확인.`);
      } else {
        message.success(`수정 완료${changedSummary}`);
      }
      setOpen(false);
      setEditing(null);
      form.resetFields();
      onModalClose?.();
      void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'salaries', 'precheck'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'list'] });
    },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const deleteM = useMutation({
    mutationFn: (params: { id: string; force?: boolean }) =>
      salaryApi.salary.delete(params.id, params.force ? { force: true } : undefined),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  /** 활성/비활성 판정 — 백엔드 Salary.isActive() 와 동일 룰 */
  const isSalaryRowActive = (s: Salary): boolean => {
    if (!s.effectiveFrom) return false;
    const today = dayjs().startOf('day');
    const startedOk = !dayjs(s.effectiveFrom).startOf('day').isAfter(today);
    const notEnded = !s.effectiveTo || !dayjs(s.effectiveTo).startOf('day').isBefore(today);
    return startedOk && notEnded;
  };

  /** 삭제 클릭 핸들러 — 활성 행이면 강제 삭제 confirm, 아니면 일반 삭제 confirm */
  const handleDelete = (r: Salary) => {
    if (!r.salaryId) return;
    const active = isSalaryRowActive(r);
    modal.confirm({
      title: active ? '현재 적용 중인 급여 삭제' : '급여 이력 삭제',
      content: active
        ? '이 급여는 현재 적용 중입니다. 잘못 등록된 경우 [강제 삭제] 로 즉시 제거합니다. (이미 생성된 월 급여대장은 영향받지 않습니다.)'
        : '이 급여 이력을 삭제합니다.',
      okText: active ? '강제 삭제' : '삭제',
      okButtonProps: { danger: true },
      cancelText: '취소',
      onOk: () => deleteM.mutateAsync({ id: r.salaryId!, force: active }),
    });
  };

  const policyOptions = useMemo(
    () =>
      (policiesQ.data ?? [])
        .map((p) => ({ value: p.salaryPolicyId!, label: p.policyName ?? '' })),
    [policiesQ.data],
  );

  const salaries = listQ.data ?? [];

  const deriveStatus = (row: Salary): 'ACTIVE' | 'ENDED' => {
    if (!row.effectiveTo) return 'ACTIVE';
    const end = dayjs(row.effectiveTo);
    if (!end.isValid()) return 'ACTIVE';
    return end.isBefore(dayjs().startOf('day')) ? 'ENDED' : 'ACTIVE';
  };

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ENDED'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL');

  /** 수정 모드 진입 시 그 시점의 active 수당 templateId 스냅샷.
   *  submit 시 폼의 selected vs 스냅샷 diff 로 add(autoGrant) / remove(closeByTemplate) 처리. */
  const editingOriginalAllowanceIdsRef = useRef<Set<string>>(new Set());

  /** createForMemberId 는 1회성 트리거. 같은 값으로 재렌더돼도 한 번만 모달을 열도록 ref 로 추적.
   *  값이 비어졌다 다시 같은 memberId 가 들어오는 경우(등록 탭에서 같은 직원 재클릭)에도 다시 열려야 하므로
   *  비워질 때 ref 도 함께 리셋한다. */
  const handledCreateMemberIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!createForMemberId) {
      handledCreateMemberIdRef.current = null;
      return;
    }
    if (handledCreateMemberIdRef.current === createForMemberId) return;
    // 활성 급여정책이 로드되어야 prefill 의미가 있다. 로드 전이면 아직 처리하지 않고 다음 effect 호출에서 다시 시도.
    if (!defaultPolicyId) return;
    handledCreateMemberIdRef.current = createForMemberId;
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      memberId: createForMemberId,
      salaryPolicyId: defaultPolicyId,
      baseSalary: 0,
      step: null,
      effectiveRange: [dayjs(), null],
      // dependentCount 는 default 두지 않고 사용자가 명시적으로 입력하도록 비워둔다.
      allowances: [],
    });
    setOpen(true);
  }, [createForMemberId, defaultPolicyId, form]);

  /** [+ 새 변동 추가] 흐름 - memberId 가 폼에 들어오면 그 직원의 최신 활성 Salary 와
   *  활성 수당을 자동으로 prefill 한다. 호봉 승급·연봉 인상 시 일일이 다시 입력하지 않게 함.
   *  - editing != null (수정 모드) 면 무시 (수정은 그 행 데이터로 이미 채워짐)
   *  - 모달이 열려있을 때만 동작
   *  - 해당 직원의 기존 Salary 가 0건이면 prefill 안 함 (신규 입사자 흐름 유지) */
  const watchedMemberId = Form.useWatch('memberId', form);
  const lastPrefilledMemberIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (editing) return;
    if (!open) return;
    if (!watchedMemberId) {
      lastPrefilledMemberIdRef.current = null;
      return;
    }
    if (lastPrefilledMemberIdRef.current === watchedMemberId) return;

    const memberSalaries = (listQ.data ?? [])
      .filter((s) => s.memberId === watchedMemberId)
      .sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''));
    // 시간상 가장 최근 행 (effectiveFrom 최대) - active/ended/future 무관.
    // 호봉 승급·연봉 인상 등 새 변동은 가장 최근 행을 기준으로 한 단계 더 추가하는 흐름이므로,
    // 진행중이든 미래 행이든 상관없이 timeline 상 마지막을 base 로 가져간다.
    const latest = memberSalaries[0];
    if (!latest) return; // 신규 입사자 - default 유지

    lastPrefilledMemberIdRef.current = watchedMemberId;

    // 새 변동 시작일 후보:
    //  1) 최신 행이 effectiveTo 가 있으면 -> effectiveTo + 1
    //  2) 최신 행이 effectiveTo 없음 (진행중) 이면:
    //     - effectiveFrom 이 미래 -> effectiveFrom + 1 (그 행 다음에 새 변동)
    //     - effectiveFrom 이 오늘/과거 -> today (backend 가 이전 활성 행을 자동으로 close)
    const today = dayjs().startOf('day');
    const latestFrom = latest.effectiveFrom ? dayjs(latest.effectiveFrom).startOf('day') : today;
    let newStart: dayjs.Dayjs;
    if (latest.effectiveTo) {
      newStart = dayjs(latest.effectiveTo).startOf('day').add(1, 'day');
    } else if (latestFrom.isAfter(today)) {
      newStart = latestFrom.add(1, 'day');
    } else {
      newStart = today;
    }

    form.setFieldsValue({
      salaryPolicyId: latest.salaryPolicyId ?? defaultPolicyId,
      baseSalary: Number(latest.baseSalary ?? 0),
      step: latest.step ?? null,
      jobGradeName: latest.jobGradeName ?? '',
      jobTitleName: latest.jobTitleName ?? '',
      effectiveRange: [newStart, null],
      dependentCount: latest.dependentCount ?? 1,
      childUnder20Count: latest.childUnder20Count ?? 0,
      taxReductionType: (latest.taxReductionType as SalaryFormValues['taxReductionType']) ?? 'NONE',
      taxReductionRatePct:
        latest.taxReductionRate != null
          ? Math.round(Number(latest.taxReductionRate) * 100)
          : undefined,
      taxReductionEffectiveToDate: latest.taxReductionEffectiveTo
        ? dayjs(latest.taxReductionEffectiveTo)
        : null,
    });

    // 활성 수당 fetch -> 체크박스 prefill
    // race condition: 비동기 응답이 늦게 도착하면 사용자가 그 사이에 토글한 값을 덮어쓸 수 있음 ->
    // resolve 시 form 의 현재 allowances 가 비어있을 때만 set (사용자가 손대지 않은 경우만 prefill)
    // 조회 월은 latest salary 의 effectiveFrom 월로 - 미래 effectiveFrom 의 수당까지 잡히도록.
    const ym = latest.effectiveFrom
      ? dayjs(latest.effectiveFrom).format('YYYY-MM')
      : dayjs().format('YYYY-MM');
    void salaryApi.memberAllowanceAdmin
      .listActiveByMember(watchedMemberId, ym)
      .then((allowanceRows) => {
        const current = form.getFieldValue('allowances') as
          | { salaryItemTemplateId?: string }[]
          | undefined;
        const userTouched = current && current.some((a) => a.salaryItemTemplateId);
        if (userTouched) return; // 사용자 이미 토글함 -> prefill 스킵 (덮어쓰기 방지)
        form.setFieldsValue({
          allowances: allowanceRows
            .filter((r) => r.salaryItemTemplateId)
            .map((r) => ({ salaryItemTemplateId: r.salaryItemTemplateId! })),
        });
      })
      .catch(() => {
        // 수당 prefill 실패해도 주 흐름 영향 없음
      });
  }, [watchedMemberId, editing, open, listQ.data, defaultPolicyId, form]);

  /** 직원별 시간상 가장 최근 (effectiveFrom 최대) salaryId 집합.
   *  과거 이력 행은 [수정] 버튼을 숨기고, 최신 행만 [수정] 노출. */
  const latestSalaryIdByMember = useMemo(() => {
    const grouped = new Map<string, Salary[]>();
    for (const s of salaries) {
      if (!s.memberId) continue;
      const arr = grouped.get(s.memberId) ?? [];
      arr.push(s);
      grouped.set(s.memberId, arr);
    }
    const ids = new Set<string>();
    grouped.forEach((arr) => {
      const sorted = [...arr].sort((a, b) =>
        (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''),
      );
      if (sorted[0]?.salaryId) ids.add(sorted[0].salaryId);
    });
    return ids;
  }, [salaries]);

  // 백엔드 응답에 이미 sabun/name/organizationName 결합되어 옴 N+1 호출 제거
  const enrichedRows = useMemo(
    () =>
      salaries.map((row) => ({
        ...row,
        sabun: row.sabun ?? null,
        memberName: row.name ?? null,
        organizationName: row.organizationName ?? null,
        salaryStatus: deriveStatus(row),
      })),
    [salaries],
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of enrichedRows) {
      if (row.organizationName) set.add(row.organizationName);
    }
    return Array.from(set).sort().map((d) => ({ value: d, label: d }));
  }, [enrichedRows]);

  const filteredRows = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return enrichedRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.salaryStatus !== statusFilter) return false;
      if (departmentFilter !== 'ALL' && row.organizationName !== departmentFilter) return false;
      if (!k) return true;
      return (
        (row.sabun?.toLowerCase().includes(k) ?? false) ||
        (row.memberName?.toLowerCase().includes(k) ?? false) ||
        (row.organizationName?.toLowerCase().includes(k) ?? false)
      );
    });
  }, [departmentFilter, enrichedRows, keyword, statusFilter]);

  const cols = useMemo<ColumnsType<Salary>>(() => [
    { title: '사번', dataIndex: 'sabun', key: 'sabun', width: 120, render: (v) => v ?? '-' },
    { title: '이름', dataIndex: 'memberName', key: 'memberName', width: 120, render: (v) => v ?? '-' },
    { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 150, render: (v) => v ?? '-' },
    {
      title: '호봉',
      dataIndex: 'step',
      key: 'step',
      width: 80,
      render: (v) => (v != null ? <Tag color="geekblue">{v}호봉</Tag> : '-'),
    },
    { title: '기본급', dataIndex: 'baseSalary', key: 'baseSalary', width: 140, render: (v) => v != null ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '직급', dataIndex: 'jobGradeName', key: 'jobGradeName', width: 100 },
    { title: '직책', dataIndex: 'jobTitleName', key: 'jobTitleName', width: 100 },
    {
      title: '부양가족',
      dataIndex: 'dependentCount',
      key: 'dependentCount',
      width: 100,
      align: 'center',
      render: (v) => (v != null ? `${v}명` : <Typography.Text type="secondary">-</Typography.Text>),
    },
    { title: '적용 기간', key: 'eff', width: 220, render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}` },
    {
      title: '액션', key: 'actions', width: 140,
      render: (_, r) => {
        const isLatest = r.salaryId ? latestSalaryIdByMember.has(r.salaryId) : false;
        return (
        <Space>
          {isLatest && (
          <Button size="small" onClick={() => {
            // 직원의 시간상 가장 최근 행만 수정 가능. 과거 행은 [삭제] 만.
            const memberRows = (listQ.data ?? [])
              .filter((s) => s.memberId === r.memberId)
              .sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''));
            const target = memberRows[0] ?? r;
            console.log('[SALARY-EDIT] open', { clicked: r.salaryId, target: target.salaryId, totalRows: memberRows.length });
            setEditing(target); setOpen(true);
            // active 수당 prefill - 비동기 fetch 시작 (resolve 후 form.allowances 채움)
            // 조회 월은 편집 대상 salary 의 effectiveFrom 월로 (그 시점에 active 인 수당이 의미 있음).
            // 현재 월로 잡으면 미래 effectiveFrom 의 수당이 누락됨.
            editingOriginalAllowanceIdsRef.current = new Set();
            const ym = target.effectiveFrom
              ? dayjs(target.effectiveFrom).format('YYYY-MM')
              : dayjs().format('YYYY-MM');
            console.log('[SALARY-EDIT] query month', ym);
            if (target.memberId) {
              void salaryApi.memberAllowanceAdmin
                .listActiveByMember(target.memberId, ym)
                .then((rows) => {
                  const ids = rows
                    .map((a) => a.salaryItemTemplateId)
                    .filter((x): x is string => Boolean(x));
                  editingOriginalAllowanceIdsRef.current = new Set(ids);
                  console.log('[SALARY-EDIT] active allowances loaded', ids);
                  form.setFieldsValue({
                    allowances: ids.map((salaryItemTemplateId) => ({ salaryItemTemplateId })),
                  });
                })
                .catch((err) => {
                  console.error('[SALARY-EDIT] active allowances fetch failed', err);
                });
            }
            form.setFieldsValue({
              memberId: target.memberId ?? '',
              salaryPolicyId: target.salaryPolicyId ?? '',
              baseSalary: Number(target.baseSalary ?? 0),
              step: target.step ?? null,
              jobGradeName: target.jobGradeName ?? '',
              jobTitleName: target.jobTitleName ?? '',
              effectiveRange: [target.effectiveFrom ? dayjs(target.effectiveFrom) : dayjs(), target.effectiveTo ? dayjs(target.effectiveTo) : null],
              dependentCount: target.dependentCount ?? 1,
              childUnder20Count: target.childUnder20Count ?? 0,
              taxReductionType: (target.taxReductionType as SalaryFormValues['taxReductionType']) ?? 'NONE',
              taxReductionRatePct:
                target.taxReductionRate != null
                  ? Math.round(Number(target.taxReductionRate) * 100)
                  : undefined,
              taxReductionEffectiveToDate: target.taxReductionEffectiveTo
                ? dayjs(target.taxReductionEffectiveTo)
                : null,
              allowances: [], // 비동기 응답 도착 전 임시값
            });
          }}>수정</Button>
          )}
          <Button size="small" danger onClick={() => handleDelete(r)}>
            삭제
          </Button>
        </Space>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [form, latestSalaryIdByMember]);

  return (
    <>
      {!tableHidden && (
        <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-2 tw-mb-3">
          <Typography.Text type="secondary" className="!tw-text-sm">
            연봉 인상·호봉 승급·직급 변경 시 새 변동 이력을 추가합니다. 신규 입사자 첫 등록은 [급여 등록] 탭에서 처리하세요.
          </Typography.Text>
          <Space>
            <Button type="primary" onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({
                salaryPolicyId: defaultPolicyId,  // 활성 정책 자동 선택
                baseSalary: 0,
                step: null,
                effectiveRange: [dayjs(), null],
                // dependentCount 는 default 두지 않고 사용자가 명시적으로 입력하도록 비워둔다.
                allowances: [],
              });
              setOpen(true);
            }}>
              + 새 변동 추가
            </Button>
          </Space>
        </div>
      )}
      {!tableHidden && (
      <Space wrap className="tw-mb-3">
        <Input.Search
          placeholder="이름·사번·부서 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 130 }}
          options={[
            { value: 'ALL', label: '상태 전체' },
            { value: 'ACTIVE', label: '진행중' },
            { value: 'ENDED', label: '종료' },
          ]}
        />
        <Select
          value={departmentFilter}
          onChange={setDepartmentFilter}
          style={{ width: 150 }}
          options={[{ value: 'ALL', label: '부서 전체' }, ...departmentOptions]}
        />
      </Space>
      )}
      {!tableHidden && (
      <Table<Salary>
        rowKey={(r) => r.salaryId ?? Math.random().toString()}
        loading={listQ.isLoading}
        dataSource={filteredRows}
        columns={cols}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '등록된 급여 이력이 없습니다.' }}
      />
      )}
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); onModalClose?.(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 수정' : '급여 등록'} destroyOnClose width={760}>
        <Form<SalaryFormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => editing?.salaryId ? updateM.mutate({ id: editing.salaryId, v }) : createM.mutate(v)}
          onValuesChange={(changed, all) => {
            // 정책 변경 시 호봉제/연봉제 전환에 따라 step/baseSalary 초기화
            if ('salaryPolicyId' in changed) {
              const next = (policiesQ.data ?? []).find((p) => p.salaryPolicyId === changed.salaryPolicyId);
              if (next?.usePayGradeYn === 'Y') {
                form.setFieldsValue({ baseSalary: 0 });
              } else {
                form.setFieldsValue({ step: null });
              }
            }
            // 호봉 변경 시 해당 호봉의 기본급 자동 계산 (표시용)
            if ('step' in changed && all.step != null) {
              const base = payGradeStepMap.get(all.step);
              if (base != null) form.setFieldsValue({ baseSalary: base });
            }
            // 부가 수당 — 금액은 제출 시 template.defaultAmount 가 자동 사용되므로
            // 별도 onValuesChange 처리 불필요.
          }}
        >
          {/* 1행: 대상 직원 + (활성 정책 1개면 정책 표시 / 여러 개면 정책 select) */}
          {!editing && (
            <div className="tw-grid tw-grid-cols-2 tw-gap-3">
              {/* MemberIdSearchField 내부가 이미 Form.Item(name="memberId") */}
              <MemberIdSearchField initialMemberId={createForMemberId} />
              {activePolicies.length === 1 ? (
                <>
                  <Form.Item name="salaryPolicyId" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item label="급여 정책">
                    <div className="tw-flex tw-h-[32px] tw-items-center tw-gap-2 tw-rounded-md tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-3 tw-text-sm">
                      <span className="tw-truncate">{activePolicies[0].policyName}</span>
                      {activePolicies[0].usePayGradeYn === 'Y' ? (
                        <Tag color="blue" className="!tw-m-0">호봉제</Tag>
                      ) : (
                        <Tag color="purple" className="!tw-m-0">연봉제</Tag>
                      )}
                    </div>
                  </Form.Item>
                </>
              ) : (
                <Form.Item
                  label="급여 정책"
                  name="salaryPolicyId"
                  rules={[{ required: true, message: '급여 정책을 선택하세요.' }]}
                >
                  <Select options={policyOptions} placeholder="정책 선택" loading={policiesQ.isLoading} />
                </Form.Item>
              )}
            </div>
          )}
          {editing && activePolicies.length > 1 && (
            <Form.Item
              label="급여 정책"
              name="salaryPolicyId"
              rules={[{ required: true, message: '급여 정책을 선택하세요.' }]}
            >
              <Select options={policyOptions} placeholder="정책 선택" loading={policiesQ.isLoading} />
            </Form.Item>
          )}
          {/* 수정 모드 + 활성 정책 1개 — UI 노출 없이 폼에만 등록해두지 않으면 onFinish 시 salaryPolicyId 가
              빠져서 백엔드가 "급여 정책 ID는 필수" 검증 실패한다. */}
          {editing && activePolicies.length <= 1 && (
            <Form.Item name="salaryPolicyId" hidden>
              <Input />
            </Form.Item>
          )}

          {/* 2행: 호봉(호봉제) 또는 기본급(연봉제) + 기본급 자동 계산 표시 */}
          <Form.Item noStyle shouldUpdate={(p, c) => p.salaryPolicyId !== c.salaryPolicyId || p.step !== c.step}>
            {({ getFieldValue }) => {
              const policyId = getFieldValue('salaryPolicyId') as string | undefined;
              const policy = (policiesQ.data ?? []).find((p) => p.salaryPolicyId === policyId);
              if (!policy) {
                return (
                  <Typography.Text type="secondary" className="!tw-text-xs tw-block tw-mb-3">
                    급여 정책을 선택해 주세요.
                  </Typography.Text>
                );
              }
              const isPayGrade = policy.usePayGradeYn === 'Y';
              const currentStep = getFieldValue('step') as number | null | undefined;
              const autoBase = currentStep != null ? payGradeStepMap.get(currentStep) : null;

              if (isPayGrade) {
                return (
                  <div className="tw-grid tw-grid-cols-2 tw-gap-3">
                    <Form.Item
                      label={<Space size={6}>호봉<Tag color="blue" className="!tw-m-0">호봉제</Tag></Space>}
                      name="step"
                      rules={[{ required: true, message: '호봉을 선택하세요.' }]}
                      extra={activePayGrades.length === 0 ? '⚠️ 호봉표 미등록 — 호봉표 관리에서 먼저 등록' : undefined}
                    >
                      <Select
                        placeholder="호봉 선택"
                        loading={payGradesQ.isLoading}
                        options={activePayGrades.map((p) => ({
                          value: p.step!,
                          label: `${p.step}호봉 · ${Number(p.baseSalary ?? 0).toLocaleString('ko-KR')}원`,
                        }))}
                        showSearch
                        optionFilterProp="label"
                      />
                    </Form.Item>
                    {/* form.baseSalary 가 onValuesChange 에서 호봉표 lookup 값으로 자동 채워짐.
                        name 을 부여해야 form 에 등록되어 onFinish/payload 에 포함된다. */}
                    <Form.Item label="기본급 (자동)" name="baseSalary">
                      <InputNumber
                        disabled
                        style={{ width: '100%' }}
                        formatter={(v) => (v != null && v !== '' ? `${Number(v).toLocaleString('ko-KR')}원` : '0원')}
                      />
                    </Form.Item>
                  </div>
                );
              }
              return (
                <Form.Item
                  label={<Space size={6}>월 기본급<Tag color="purple" className="!tw-m-0">연봉제</Tag></Space>}
                  name="baseSalary"
                  rules={[{ required: true, message: '기본급을 입력하세요.' }, { type: 'number', min: 0 }]}
                >
                  <InputNumber
                    min={0}
                    step={100000}
                    style={{ width: '100%' }}
                    placeholder="예: 3,500,000"
                    formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}` : '')}
                    parser={(v) => Number(String(v ?? '').replace(/[^\d]/g, '')) as 0 | number}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          {/* 3행: 부양가족수 + 적용 기간 — 같은 줄 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item
              label="부양가족수 (본인 포함, 1~11)"
              name="dependentCount"
              rules={[{ required: true, message: '부양가족수를 입력하세요.' }]}
            >
              <InputNumber
                min={1}
                max={11}
                style={{ width: '100%' }}
                placeholder="예: 본인만 1, 본인+배우자 2"
              />
            </Form.Item>
            <Form.Item
              label="적용 기간"
              name="effectiveRange"
              rules={[{ required: true, message: '적용 시작일을 선택하세요.' }]}
              extra="종료일 미입력 시 계속 적용"
            >
              <DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* 4행: 8~20세 자녀수 + 소득세 감면 유형 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item
              label="8~20세 자녀 수"
              name="childUnder20Count"
              extra="자녀세액공제 차원 (간이세액표). 미입력 시 0."
            >
              <InputNumber min={0} max={11} style={{ width: '100%' }} placeholder="예: 1" />
            </Form.Item>
            <Form.Item
              label="소득세 감면 유형"
              name="taxReductionType"
              extra="청년 SME 등 조세특례제한법상 감면. 없으면 NONE."
            >
              <Select
                options={[
                  { value: 'NONE', label: '없음 (NONE)' },
                  { value: 'YOUTH_SME', label: '청년 중소기업 (YOUTH_SME)' },
                  { value: 'DISABLED', label: '장애인 감면 (DISABLED)' },
                  { value: 'FOREIGNER', label: '외국인 단일세율 (FOREIGNER)' },
                  { value: 'ETC', label: '기타 (ETC)' },
                ]}
              />
            </Form.Item>
          </div>

          {/* 감면율·종료일 — type이 NONE 이 아닐 때만 노출 */}
          <Form.Item noStyle shouldUpdate={(p, c) => p.taxReductionType !== c.taxReductionType}>
            {({ getFieldValue }) => {
              const t = getFieldValue('taxReductionType');
              if (!t || t === 'NONE') return null;
              return (
                <div className="tw-grid tw-grid-cols-2 tw-gap-3">
                  <Form.Item
                    label="감면율 (%)"
                    name="taxReductionRatePct"
                    extra="청년 SME 1~3년차 90%, 4~5년차 70% 등"
                    rules={[{ required: true, type: 'number', min: 1, max: 100, message: '1~100 사이로 입력' }]}
                  >
                    <InputNumber min={0} max={100} step={10} style={{ width: '100%' }} placeholder="예: 90" />
                  </Form.Item>
                  <Form.Item
                    label="감면 종료일"
                    name="taxReductionEffectiveToDate"
                    extra="청년 SME 5년 한정 등. 종료일 이후엔 자동으로 풀세금."
                    rules={[{ required: true, message: '감면 종료일을 입력하세요.' }]}
                  >
                    <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              );
            }}
          </Form.Item>

          {/* allowances 는 토글 UI 에서 setFieldValue 로 다루지만, name 등록된 Form.Item 이 없으면
              onFinish values 에 포함되지 않아 submit 시 undefined 가 됨. 빈 hidden Form.Item 으로 등록만 해둔다. */}
          <Form.Item name="allowances" hidden>
            <Input />
          </Form.Item>

          {/* ─── 부가 수당 (선택) - 등록/수정 모두 노출. 수정 시 active 수당이 자동 prefill 되어 체크돼있고
                토글 해제 시 종료(closeByTemplate), 새로 체크 시 추가(autoGrant) 된다. */}
          <>
              <div className="tw-flex tw-items-baseline tw-justify-between tw-mb-1">
                <Typography.Text strong className="!tw-text-xs !tw-text-slate-500">
                  부가 수당 <Typography.Text type="secondary" className="!tw-text-xs">
                    {editing ? '(수정 시 적용일부터 추가/종료 처리)' : '(선택, 클릭하여 토글)'}
                  </Typography.Text>
                </Typography.Text>
                <Typography.Text type="secondary" className="!tw-text-xs">
                  금액은 [지급 항목(수당)] 의 회사 기본값 자동 적용
                </Typography.Text>
              </div>
              <Form.Item
                shouldUpdate={(prev, next) => prev.allowances !== next.allowances}
                noStyle
              >
                {() => {
                  if (allowanceTemplates.length === 0) {
                    return (
                      <div className="tw-rounded-lg tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50/40 tw-px-4 tw-py-6 tw-text-center">
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          등록 가능한 수당 항목이 없습니다. [지급 항목(수당)] 탭에서 항목을 먼저 만들어 주세요.
                        </Typography.Text>
                      </div>
                    );
                  }
                  // 외부 form instance 직접 사용 (render-prop destructure 가 어떤 환경에서 unbound 가 되는 케이스 회피)
                  const current = (form.getFieldValue('allowances') as { salaryItemTemplateId?: string }[] | undefined) ?? [];
                  const selectedIds = new Set(
                    current.map((a) => a.salaryItemTemplateId).filter((v): v is string => Boolean(v)),
                  );
                  const toggle = (id: string) => {
                    const next = new Set(selectedIds);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    const newValue = Array.from(next).map((salaryItemTemplateId) => ({ salaryItemTemplateId }));
                    form.setFieldsValue({ allowances: newValue });
                    console.log('[ALLOWANCE-TOGGLE]', { id, newValue });
                  };
                  return (
                    <div className="tw-grid tw-grid-cols-2 sm:tw-grid-cols-3 tw-gap-2">
                      {allowanceTemplates.map((t) => {
                        const id = t.salaryItemTemplateId!;
                        const checked = selectedIds.has(id);
                        const hasAmount = t.defaultAmount != null;
                        const isCompanyWide = t.applyToAllYn === 'Y';
                        const disabled = !hasAmount;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => !disabled && toggle(id)}
                            disabled={disabled}
                            className={[
                              'tw-flex tw-w-full tw-items-start tw-gap-3 tw-rounded-lg tw-border tw-px-3 tw-py-2.5 tw-text-left tw-transition-colors',
                              disabled
                                ? 'tw-cursor-not-allowed tw-border-slate-200 tw-bg-slate-50/60 tw-opacity-60'
                                : checked
                                  ? 'tw-border-blue-400 tw-bg-blue-50/50 tw-shadow-sm'
                                  : 'tw-border-slate-200 tw-bg-white hover:tw-border-blue-300 hover:tw-bg-blue-50/30',
                            ].join(' ')}
                          >
                            <Checkbox checked={checked} disabled={disabled} className="tw-mt-0.5" />
                            <div className="tw-min-w-0 tw-flex-1">
                              <div className="tw-flex tw-items-center tw-gap-1.5">
                                <span className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">
                                  {t.itemName ?? '—'}
                                </span>
                                <Tag color={isCompanyWide ? 'blue' : 'purple'} className="!tw-m-0">
                                  {isCompanyWide ? '회사 공통' : '개인 차등'}
                                </Tag>
                              </div>
                              <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                                {hasAmount
                                  ? `${t.defaultAmount!.toLocaleString('ko-KR')}원`
                                  : '금액 미지정 — [지급 항목(수당)] 에서 먼저 셋업'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                }}
              </Form.Item>
            </>
        </Form>
      </Modal>
    </>
  );
}

/* ======================================================================
 * 2. 급여 정책 (SalaryPolicy)
 * ====================================================================== */

type PolicyFormValues = {
  policyName: string;
  payDay: number;
  usePayGradeYn: 'Y' | 'N';
  wageSystemType: WageSystemTypeCode;
  fixedOvertimeMinutes?: number;
  payDayShiftRule: PayDayShiftRuleCode;
  // 월 소정근로시간 시급 환산 기준 한국 표준 209
  monthlyOrdinaryHours: number;
  // 일할계산 방식 입사 / 퇴사 / 기간변경 월 적용
  prorationMethod: ProrationMethodCode;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
};

const PRORATION_METHOD_KO: Record<string, string> = {
  DAYS_IN_MONTH: '해당월 일수 (28~31일)',
  FIXED_30: '30일 고정 (통상임금 표준)',
  WORKING_DAYS: '월 소정근로일 (간이 22일)',
};

function SalaryPolicyTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryPolicy | null>(null);
  const [form] = Form.useForm<PolicyFormValues>();

  const listQ = useQuery({ queryKey: ['salary', 'salary-policies'], queryFn: () => salaryApi.salaryPolicy.list() });

  const buildPayload = (v: PolicyFormValues) => ({
    policyName: v.policyName.trim(),
    payDay: v.payDay,
    usePayGradeYn: v.usePayGradeYn,
    wageSystemType: v.wageSystemType,
    fixedOvertimeMinutes: v.wageSystemType === 'NON_COMPREHENSIVE' ? 0 : (v.fixedOvertimeMinutes ?? 0),
    // 급여 정산 기간은 1일~말일 고정
    periodStartType: 'FIRST' as PeriodStartTypeCode,
    periodEndType: 'LAST' as PeriodEndTypeCode,
    payDayShiftRule: v.payDayShiftRule,
    monthlyOrdinaryHours: v.monthlyOrdinaryHours,
    prorationMethod: v.prorationMethod,
    effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
    effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
  });

  const createM = useMutation({
    mutationFn: (v: PolicyFormValues) => salaryApi.salaryPolicy.create(buildPayload(v)),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: PolicyFormValues }) => salaryApi.salaryPolicy.update(id, buildPayload(v)),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const deleteM = useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => salaryApi.salaryPolicy.delete(id, { force }),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const endM = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof buildPayload> }) =>
      salaryApi.salaryPolicy.update(id, payload),
    onSuccess: () => {
      message.success('정책 종료 처리 완료');
      void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] });
    },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const isPolicyActive = (p: SalaryPolicy) => {
    if (!p.effectiveFrom) return false;
    const today = dayjs().startOf('day');
    const started = !dayjs(p.effectiveFrom).startOf('day').isAfter(today);
    const notEnded = !p.effectiveTo || !dayjs(p.effectiveTo).startOf('day').isBefore(today);
    return started && notEnded;
  };

  const cols = useMemo<ColumnsType<SalaryPolicy>>(() => [
    { title: '정책명', dataIndex: 'policyName', key: 'policyName' },
    { title: '지급일', dataIndex: 'payDay', key: 'payDay', width: 80, render: (v) => `${v}일` },
    {
      title: '지급일 조정',
      dataIndex: 'payDayShiftRule',
      key: 'payDayShiftRule',
      width: 120,
      render: (v) => <Tag color={v === 'BEFORE' ? 'geekblue' : v === 'AFTER' ? 'purple' : 'default'}>{PAY_DAY_SHIFT_KO[v ?? 'BEFORE'] ?? v ?? '—'}</Tag>,
    },
    {
      title: '임금체계',
      dataIndex: 'usePayGradeYn',
      key: 'usePayGradeYn',
      width: 110,
      render: (v) => v === 'Y'
        ? <Tag color="geekblue">호봉제</Tag>
        : <Tag color="default">연봉협상제</Tag>,
    },
    { title: '임금제', dataIndex: 'wageSystemType', key: 'wageSystemType', width: 100, render: (v) => <Tag color={v === 'COMPREHENSIVE' ? 'orange' : 'blue'}>{WAGE_SYS_KO[v] ?? v}</Tag> },
    {
      title: '월 소정근로시간',
      dataIndex: 'monthlyOrdinaryHours',
      key: 'monthlyOrdinaryHours',
      width: 130,
      render: (v: number | null) => v != null ? <Tag color="cyan">{v}h</Tag> : <Tag>209h</Tag>,
    },
    {
      title: '일할계산',
      dataIndex: 'prorationMethod',
      key: 'prorationMethod',
      width: 200,
      render: (v: string | null) => (
        <Tag>{PRORATION_METHOD_KO[v ?? 'DAYS_IN_MONTH'] ?? v ?? '—'}</Tag>
      ),
    },
    { title: '적용 기간', key: 'eff', width: 220, render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}` },
    {
      title: '액션', key: 'a', width: 220,
      render: (_, r) => (
        <Space>
          {isPolicyActive(r) && r.salaryPolicyId && (
            <Popconfirm
              title="이 정책을 오늘 날짜로 종료할까요?"
              okText="종료"
              cancelText="취소"
              onConfirm={() => {
                const today = dayjs().format('YYYY-MM-DD');
                endM.mutate({
                  id: r.salaryPolicyId!,
                  payload: {
                    policyName: (r.policyName ?? '').trim(),
                    payDay: r.payDay ?? 25,
                    usePayGradeYn: r.usePayGradeYn === 'Y' ? 'Y' : 'N',
                    wageSystemType: (r.wageSystemType as WageSystemTypeCode) ?? 'NON_COMPREHENSIVE',
                    fixedOvertimeMinutes:
                      (r.wageSystemType as WageSystemTypeCode) === 'NON_COMPREHENSIVE'
                        ? 0
                        : (r.fixedOvertimeMinutes ?? 0),
                    periodStartType: 'FIRST' as PeriodStartTypeCode,
                    periodEndType: 'LAST' as PeriodEndTypeCode,
                    payDayShiftRule: (r.payDayShiftRule as PayDayShiftRuleCode) ?? 'BEFORE',
                    monthlyOrdinaryHours: r.monthlyOrdinaryHours ?? 209,
                    prorationMethod: (r.prorationMethod as ProrationMethodCode) ?? 'DAYS_IN_MONTH',
                    effectiveFrom: r.effectiveFrom ?? today,
                    effectiveTo: today,
                  },
                });
              }}
            >
              <Button size="small">종료</Button>
            </Popconfirm>
          )}
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              policyName: r.policyName ?? '', payDay: r.payDay ?? 25,
              usePayGradeYn: r.usePayGradeYn === 'Y' ? 'Y' : 'N',
              wageSystemType: (r.wageSystemType as WageSystemTypeCode) ?? 'NON_COMPREHENSIVE',
              fixedOvertimeMinutes: r.fixedOvertimeMinutes ?? undefined,
              payDayShiftRule: (r.payDayShiftRule as PayDayShiftRuleCode) ?? 'BEFORE',
              monthlyOrdinaryHours: r.monthlyOrdinaryHours ?? 209,
              prorationMethod: (r.prorationMethod as ProrationMethodCode) ?? 'DAYS_IN_MONTH',
              effectiveRange: [r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(), r.effectiveTo ? dayjs(r.effectiveTo) : null],
            });
          }}>수정</Button>
          <Popconfirm
            title={isPolicyActive(r) ? '진행중 정책입니다. 강제 삭제할까요?' : '삭제?'}
            okText="삭제"
            cancelText="취소"
            onConfirm={() => r.salaryPolicyId && deleteM.mutate({ id: r.salaryPolicyId, force: isPolicyActive(r) })}
          >
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [deleteM, endM, form]);

  return (
    <>
      <div className="tw-flex tw-justify-end tw-mb-3"><Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ payDay: 25, usePayGradeYn: 'N', wageSystemType: 'NON_COMPREHENSIVE', payDayShiftRule: 'BEFORE', monthlyOrdinaryHours: 209, prorationMethod: 'DAYS_IN_MONTH', effectiveRange: [dayjs(), null] }); setOpen(true); }}>정책 등록</Button></div>
      <Table<SalaryPolicy> rowKey={(r) => r.salaryPolicyId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 10 }} locale={{ emptyText: '등록된 정책이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 정책 수정' : '급여 정책 등록'} destroyOnClose width={600}>
        <Form<PolicyFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryPolicyId ? updateM.mutate({ id: editing.salaryPolicyId, v }) : createM.mutate(v)}>
          <Form.Item label="정책명" name="policyName" rules={[{ required: true }]}><Input maxLength={60} placeholder="예: ㅇㅇ컴퍼니 급여정책" /></Form.Item>
          <Form.Item label="지급일 (1~31)" name="payDay" rules={[{ required: true }]}><InputNumber min={1} max={31} style={{ width: 120 }} /></Form.Item>
          <Form.Item
            label="지급일 주말/공휴일 조정"
            name="payDayShiftRule"
            rules={[{ required: true }]}
            extra="지급일이 주말 또는 회사 휴일과 겹칠 때 처리 방식. 실무 표준은 '직전 영업일'."
          >
            <Select
              style={{ width: '100%' }}
              options={[
                { value: 'BEFORE', label: '직전 영업일 (실무 표준)' },
                { value: 'AFTER', label: '직후 영업일' },
                { value: 'NONE', label: '해당일 그대로' },
              ]}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            className="!tw-mb-3"
            message="급여 정산 기간은 매월 1일부터 말일까지 고정입니다."
          />
          <Form.Item
            label="임금 체계"
            name="usePayGradeYn"
            rules={[{ required: true }]}
            extra="정책 한 건당 호봉제·연봉협상제 중 하나입니다. 호봉제면 호봉표 탭이 열리고, 연봉협상제면 급여 정산 메뉴에 연봉 협상이 표시됩니다."
          >
            <Select
              style={{ width: '100%' }}
              options={[
                { value: 'N', label: '연봉협상제 (기본급 직접 입력)' },
                { value: 'Y', label: '호봉제 (호봉표 기반 자동 계산)' },
              ]}
            />
          </Form.Item>
          <Space className="tw-w-full" size={16}>
            <Form.Item label="임금제 유형" name="wageSystemType" rules={[{ required: true }]}><Select style={{ width: 180 }} options={[{ value: 'COMPREHENSIVE', label: '포괄임금제' }, { value: 'NON_COMPREHENSIVE', label: '비포괄임금제' }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate={(p, c) => p.wageSystemType !== c.wageSystemType}>
              {({ getFieldValue }) => getFieldValue('wageSystemType') === 'COMPREHENSIVE' ? (
                <Form.Item label="기본 초과근무시간(분), ex) 20시간(1200분)" name="fixedOvertimeMinutes"><InputNumber min={0} style={{ width: 140 }} /></Form.Item>
              ) : null}
            </Form.Item>
          </Space>
          <Alert
            type="info"
            showIcon
            className="!tw-mb-3"
            message="연장근무시간 인정 단위(15분/30분 절사)는 「연장근로 정책」에서 관리합니다."
          />
          <Space className="tw-w-full" size={16} align="start">
            <Form.Item
              label="월 소정근로시간"
              name="monthlyOrdinaryHours"
              rules={[
                { required: true, message: '월 소정근로시간을 입력하세요.' },
                { type: 'number', min: 1, max: 300, message: '1 ~ 300 사이' },
              ]}
              extra="시급 환산 기준. 한국 표준 209h (주 40h × 4.345 + 주휴 8h × 4.345). 주 35h 회사는 183h."
            >
              <InputNumber min={1} max={300} style={{ width: 160 }} addonAfter="시간" />
            </Form.Item>
            <Form.Item
              label="일할계산 방식"
              name="prorationMethod"
              rules={[{ required: true, message: '일할계산 방식을 선택하세요.' }]}
              extra="입사 / 퇴사 / 기간변경 월에 적용. 통상임금 표준은 30일 고정."
            >
              <Select
                style={{ width: 240 }}
                options={[
                  { value: 'DAYS_IN_MONTH', label: PRORATION_METHOD_KO.DAYS_IN_MONTH },
                  { value: 'FIXED_30', label: PRORATION_METHOD_KO.FIXED_30 },
                  { value: 'WORKING_DAYS', label: PRORATION_METHOD_KO.WORKING_DAYS },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item label="적용 기간" name="effectiveRange" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ======================================================================
 * 3. 세율 (TaxRate)
 * ====================================================================== */

type TaxFormValues = {
  taxType: TaxTypeCode;
  rate: number;
  applyYear: number;
  employerRate?: number;
  incomeCeiling?: number | null;
  incomeFloor?: number | null;
};

function TaxRateTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form] = Form.useForm<TaxFormValues>();
  const [listYear, setListYear] = useState(() => dayjs().year());

  const listQ = useQuery({
    queryKey: ['salary', 'tax-rates', listYear],
    queryFn: () => salaryApi.taxRate.list(listYear),
  });

  const createM = useMutation({
    mutationFn: (v: TaxFormValues) => salaryApi.taxRate.create(v),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: TaxFormValues }) => salaryApi.taxRate.update(id, v),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.taxRate.delete(id),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const initDefaultsM = useMutation({
    mutationFn: (year: number) => salaryApi.taxRate.initDefaults(year),
    onSuccess: (res) => {
      message.success(`${res.applyYear}년 표준 세율 ${res.inserted}건 반영, ${res.skipped}건 스킵`);
      void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] });
    },
    onError: (e: Error) => message.error(e.message || '표준 세율 시드 실패'),
  });

  const taxTypeOpts = Object.entries(TAX_TYPE_KO).map(([value, label]) => ({ value, label: `${label} (${value})` }));

  const cols = useMemo<ColumnsType<TaxRate>>(() => [
    { title: '세금 유형', dataIndex: 'taxType', key: 'taxType', render: (v) => <Tag>{TAX_TYPE_KO[v] ?? v}</Tag> },
    { title: '적용 연도', dataIndex: 'applyYear', key: 'applyYear', width: 100 },
    { title: '근로자 부담률', dataIndex: 'rate', key: 'rate', width: 120, render: (v) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : '-' },
    { title: '회사 부담률', dataIndex: 'employerRate', key: 'employerRate', width: 120, render: (v) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : '-' },
    {
      title: '기준소득 상한',
      dataIndex: 'incomeCeiling',
      key: 'incomeCeiling',
      width: 150,
      render: (v) => v != null ? `${Number(v).toLocaleString('ko-KR')}원` : '-',
    },
    {
      title: '기준소득 하한',
      dataIndex: 'incomeFloor',
      key: 'incomeFloor',
      width: 150,
      render: (v) => v != null ? `${Number(v).toLocaleString('ko-KR')}원` : '-',
    },
    {
      title: '액션', key: 'a', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              taxType: r.taxType as TaxTypeCode,
              rate: Number(r.rate ?? 0),
              applyYear: r.applyYear ?? dayjs().year(),
              employerRate: r.employerRate != null ? Number(r.employerRate) : undefined,
              incomeCeiling: r.incomeCeiling != null ? Number(r.incomeCeiling) : undefined,
              incomeFloor: r.incomeFloor != null ? Number(r.incomeFloor) : undefined,
            });
          }}>수정</Button>
          <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.taxRateId && deleteM.mutate(r.taxRateId)}><Button size="small" danger>삭제</Button></Popconfirm>
        </Space>
      ),
    },
  ], [deleteM, form]);

  const yearSelectOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const y = dayjs().year() - 5 + i;
        return { value: y, label: `${y}년` };
      }),
    [],
  );

  return (
    <>
      <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-2 tw-mb-3">
        <Space align="center">
          <Typography.Text type="secondary" className="!tw-text-sm">
            조회 연도
          </Typography.Text>
          <Select
            className="tw-min-w-[120px]"
            value={listYear}
            onChange={(y) => setListYear(y)}
            options={yearSelectOptions}
          />
        </Space>
        <Space>
          <Popconfirm
            title={`${listYear}년 표준 세율을 불러올까요?`}
            description="이미 등록된 세율은 유지되고, 없는 유형만 추가됩니다."
            okText="불러오기"
            cancelText="취소"
            onConfirm={() => initDefaultsM.mutate(listYear)}
          >
            <Button loading={initDefaultsM.isPending}>표준 세율 불러오기</Button>
          </Popconfirm>
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({ applyYear: listYear, rate: 0 });
              setOpen(true);
            }}
          >
            세율 등록
          </Button>
        </Space>
      </div>
      <Table<TaxRate> rowKey={(r) => r.taxRateId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 20 }} locale={{ emptyText: '등록된 세율이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '세율 수정' : '세율 등록'} destroyOnClose width={520}>
        <Form<TaxFormValues> form={form} layout="vertical" onFinish={(v) => editing?.taxRateId ? updateM.mutate({ id: editing.taxRateId, v }) : createM.mutate(v)}>
          <Form.Item label="세금 유형" name="taxType" rules={[{ required: true }]}><Select options={taxTypeOpts} /></Form.Item>
          <Form.Item label="적용 연도" name="applyYear" rules={[{ required: true }]}><InputNumber min={2000} max={2099} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="근로자 부담률 (소수, 예: 0.045)" name="rate" rules={[{ required: true }]}><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="회사 부담률 (소수, 선택)" name="employerRate"><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item>

          {/* 국민연금/건강보험만 상/하한 지원 */}
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.taxType !== curr.taxType}>
            {({ getFieldValue }) => {
              const currentType = getFieldValue('taxType') as TaxTypeCode | undefined;
              if (!currentType || !TAX_CAP_SUPPORTED_TYPES.has(currentType)) {
                return null;
              }
              return (
                <>
                  <Form.Item
                    label="기준소득 상한 (월, 원)"
                    name="incomeCeiling"
                    extra={
                      currentType === 'NATIONAL_PENSION'
                        ? '국민연금 기준소득월액 상한 (2026년 6,170,000원 기준)'
                        : '건강보험 보수월액 상한 (매년 변동)'
                    }
                  >
                    <InputNumber
                      min={0}
                      step={100000}
                      style={{ width: '100%' }}
                      formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
                      parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
                    />
                  </Form.Item>
                  <Form.Item
                    label="기준소득 하한 (월, 원)"
                    name="incomeFloor"
                    extra={
                      currentType === 'NATIONAL_PENSION'
                        ? '국민연금 기준소득월액 하한 (2026년 390,000원 기준)'
                        : '건강보험 보수월액 하한 (매년 변동)'
                    }
                  >
                    <InputNumber
                      min={0}
                      step={10000}
                      style={{ width: '100%' }}
                      formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
                      parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
                    />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ======================================================================
 * 4. 지급 항목 템플릿 (SalaryItemTemplate)
 *    회사가 직원에게 지급하는 항목 마스터 (기본급·수당 등)
 *    공제(4대보험·소득세) 는 [세금·4대보험] 메뉴에서 별도 관리
 * ====================================================================== */

type TemplateFormValues = {
  itemName: string;
  itemType: ItemTypeCode;
  displayOrder: number;
  isTaxableYn: 'Y' | 'N';
  // 통상임금 포함 여부 가산수당 시급 환산 base
  isOrdinaryWageYn: 'Y' | 'N';
  // 회사 기본 지급 금액 (수당 산식 v1) — applyToAll=Y 면 전 직원 자동 합산
  defaultAmount?: number | null;
  // 회사 공통(Y) / 개인 차등(N)
  applyToAllYn: 'Y' | 'N';
};

function SalaryItemTemplateTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryItemTemplate | null>(null);
  const [form] = Form.useForm<TemplateFormValues>();

  const listQ = useQuery({ queryKey: ['salary', 'salary-item-templates'], queryFn: () => salaryApi.salaryItemTemplate.list() });

  const createM = useMutation({
    mutationFn: (v: TemplateFormValues) => salaryApi.salaryItemTemplate.create(v),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: TemplateFormValues }) => salaryApi.salaryItemTemplate.update(id, v),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.salaryItemTemplate.delete(id),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const initDefaultsM = useMutation({
    mutationFn: () => salaryApi.salaryItemTemplate.initDefaults(),
    onSuccess: (res) => {
      if (res.created > 0) {
        message.success(`표준 급여 항목 ${res.created}건이 추가되었습니다.`);
      } else {
        message.info(res.message || '이미 표준 항목이 등록되어 있습니다.');
      }
      void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] });
    },
    onError: (e: Error) => message.error(e.message || '기본 항목 불러오기에 실패했습니다.'),
  });

  const cols = useMemo<ColumnsType<SalaryItemTemplate>>(() => [
    {
      title: '항목명',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (v: string, r) => (
        <Space size={4}>
          <span>{v}</span>
          {r.isSystemDefault ? <Tag color="blue">기본</Tag> : null}
        </Space>
      ),
    },
    {
      // 카테고리 기준 월 비과세 한도 한도 없음 또는 미지정 dash
      title: '기본 비과세 금액',
      dataIndex: 'monthlyNonTaxableLimit',
      key: 'monthlyNonTaxableLimit',
      width: 160,
      align: 'right',
      render: (v: number | null | undefined, r) => {
        if (typeof v === 'number' && v > 0) {
          return <span>{v.toLocaleString('ko-KR')} 원 / 월</span>;
        }
        if (typeof v === 'number' && v === 0) {
          return <Typography.Text type="secondary">한도 없음</Typography.Text>;
        }
        // null 인 경우 한도 미정 카테고리 학자금 기타 비과세
        if (r.taxCategory === 'TUITION' || r.taxCategory === 'ETC_NON_TAXABLE') {
          return <Typography.Text type="secondary">실비 / 별도</Typography.Text>;
        }
        return <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      // 적용 범위 — 회사 공통(Y) / 개인 차등(N).
      // 회사 공통이면 PayrollService 가 default_amount 를 모든 직원에게 자동 합산.
      title: '적용 범위',
      dataIndex: 'applyToAllYn',
      key: 'applyToAllYn',
      width: 120,
      render: (v: string | null | undefined) =>
        v === 'Y'
          ? <Tag color="cyan">회사 공통</Tag>
          : <Tag>개인 차등</Tag>,
    },
    {
      // 회사 기본 지급 금액 (수당 산식 v1) — applyToAll=Y 면 전 직원 자동 합산
      title: '기본 지급 금액',
      dataIndex: 'defaultAmount',
      key: 'defaultAmount',
      width: 160,
      align: 'right',
      render: (v: number | null | undefined) =>
        typeof v === 'number'
          ? <span>{v.toLocaleString('ko-KR')} 원</span>
          : <Typography.Text type="secondary">미지정</Typography.Text>,
    },
    {
      title: '유형',
      dataIndex: 'itemType',
      key: 'itemType',
      width: 100,
      render: (v) => (
        <Tag color={v === 'EARNING' ? 'green' : 'red'}>{ITEM_TYPE_KO[v] ?? v}</Tag>
      ),
    },
    {
      title: '과세',
      dataIndex: 'isTaxableYn',
      key: 'isTaxableYn',
      width: 100,
      render: (v) => (v === 'Y' ? <Tag color="blue">과세</Tag> : <Tag>비과세</Tag>),
    },
    {
      title: '통상임금',
      dataIndex: 'isOrdinaryWageYn',
      key: 'isOrdinaryWageYn',
      width: 110,
      render: (v) =>
        v === 'Y'
          ? <Tag color="purple">포함</Tag>
          : <Typography.Text type="secondary">제외</Typography.Text>,
    },
    {
      title: '액션',
      key: 'a',
      width: 180,
      render: (_, r) => (
        <Space>
          <Button size="middle" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              itemName: r.itemName ?? '',
              itemType: (r.itemType as ItemTypeCode) ?? 'EARNING',
              displayOrder: r.displayOrder ?? 0,
              isTaxableYn: (r.isTaxableYn as 'Y' | 'N') ?? 'Y',
              isOrdinaryWageYn: (r.isOrdinaryWageYn as 'Y' | 'N') ?? 'N',
              defaultAmount: r.defaultAmount ?? null,
              applyToAllYn: (r.applyToAllYn as 'Y' | 'N') ?? 'N',
            });
          }}>수정</Button>
          {r.isSystemDefault ? (
            <Typography.Text type="secondary" className="!tw-text-xs">
              삭제 불가
            </Typography.Text>
          ) : (
            <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.salaryItemTemplateId && deleteM.mutate(r.salaryItemTemplateId)}>
              <Button size="middle" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [deleteM, form]);

  /** 표시는 displayOrder 오름차순 유지.
   *  기본급은 모든 직원이 받는 Salary.baseSalary 로 처리되므로 수당 목록에서는 숨김 (DB 행 자체는 유지). */
  const sortedItems = useMemo(
    () =>
      (listQ.data ?? [])
        .filter((t) => t.delYn !== 'Y' && t.itemName !== '기본급')
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [listQ.data],
  );

  return (
    <>
      <div className="tw-flex tw-justify-end tw-mb-3">
        <Space>
          <Popconfirm
            title="기본 급여 항목을 불러올까요?"
            description="기본급, 직책수당(과세), 식대·자가운전·보육·연구활동비(비과세)가 생성됩니다. 이미 등록된 항목이 있으면 건너뜁니다."
            okText="불러오기"
            cancelText="취소"
            onConfirm={() => initDefaultsM.mutate()}
          >
            <Button loading={initDefaultsM.isPending}>기본 항목 불러오기</Button>
          </Popconfirm>
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ itemType: 'EARNING', displayOrder: 0, isTaxableYn: 'Y', isOrdinaryWageYn: 'N', applyToAllYn: 'N' }); setOpen(true); }}>항목(수당) 등록</Button>
        </Space>
      </div>
      <Table<SalaryItemTemplate>
        rowKey={(r) => r.salaryItemTemplateId ?? Math.random().toString()}
        loading={listQ.isLoading}
        dataSource={sortedItems}
        columns={cols}
        pagination={{ pageSize: 20 }}
        size="middle"
        className="!tw-text-[15px]"
        locale={{ emptyText: '등록된 항목이 없습니다.' }}
      />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? (editing.isSystemDefault ? '시스템 기본 항목(수당) 수정' : '항목(수당) 수정') : '항목(수당) 등록'} destroyOnClose width={720}>
        <Form<TemplateFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryItemTemplateId ? updateM.mutate({ id: editing.salaryItemTemplateId, v }) : createM.mutate(v)}>
          {/* 유형은 항상 EARNING 으로 자동 — 공제(세금/4대보험) 는 [세금·4대보험] 메뉴에서 별도 관리 */}
          <Form.Item name="itemType" hidden initialValue="EARNING">
            <Input />
          </Form.Item>

          {/* 1행: 수당명 + 표시 순서 */}
          <div className="tw-grid tw-grid-cols-[1fr_140px] tw-gap-3">
            <Form.Item label="수당명" name="itemName" rules={[{ required: true }]}>
              <Input maxLength={40} placeholder="예: 직책수당, 식대" />
            </Form.Item>
            <Form.Item label="표시 순서" name="displayOrder" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* 2행: 과세 여부 + 통상임금 포함 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item
              label="과세 여부"
              name="isTaxableYn"
              rules={[{ required: true }]}
              extra="과세=소득세·4대보험 포함 / 비과세=식대·자가운전 등 세법 한도 적용"
            >
              <Select
                disabled={!!editing?.isSystemDefault}
                options={[{ value: 'Y', label: '과세' }, { value: 'N', label: '비과세' }]}
              />
            </Form.Item>
            <Form.Item
              label="통상임금 포함"
              name="isOrdinaryWageYn"
              rules={[{ required: true }]}
              extra="매달 고정 수당만 포함 (연장·야간·휴일수당 시급 환산 기준)"
            >
              <Select
                options={[
                  { value: 'N', label: '제외 (성과급·식대·자가운전 등 변동·실비)' },
                  { value: 'Y', label: '포함 (직책수당·자격수당 등 매월 고정)' },
                ]}
              />
            </Form.Item>
          </div>

          {/* 3행: 적용 범위 + 수당 금액 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item
              label="적용 범위"
              name="applyToAllYn"
              rules={[{ required: true }]}
              extra="회사 공통=전 직원 자동 합산 / 개인 차등=직원별 부여 시에만 적용"
            >
              <Select
                options={[
                  { value: 'N', label: '개인 차등 (직원별로 부여)' },
                  { value: 'Y', label: '회사 공통 (전 직원 자동 적용)' },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="수당 금액 (월, 원)"
              name="defaultAmount"
              extra="회사 공통=자동 합산 금액 / 개인 차등=부여 시 기본값. 비우면 자동 적용 없음"
            >
              <InputNumber
                min={0}
                step={10000}
                style={{ width: '100%' }}
                placeholder="예: 200,000"
                formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}` : '')}
                parser={(v) => Number(String(v ?? '').replace(/[^\d]/g, '')) as 0 | number}
              />
            </Form.Item>
          </div>

          {editing?.isSystemDefault && (
            <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-xs">
              시스템 기본 항목은 이름·표시 순서만 수정됩니다. 과세 여부는 변경할 수 없습니다.
            </Typography.Paragraph>
          )}
        </Form>
      </Modal>
    </>
  );
}

/* ======================================================================
 * 5. 초과 근무 현황 (ComprehensiveOvertime)
 *    - 포괄임금제 회사만 의미, 비포괄이면 빈 테이블
 *    - 이번 달 1일 ~ 기준일 누적 승인 OT vs 고정 OT 한도
 * ====================================================================== */

export function ComprehensiveOvertimeTab() {
  const [baseDate, setBaseDate] = useState<dayjs.Dayjs>(() => dayjs());
  const iso = baseDate.format('YYYY-MM-DD');
  const formatMinutes = (v?: number | null) =>
    v == null ? '—' : `${v.toLocaleString()}분 (${(v / 60).toFixed(1)}h)`;

  const listQ = useQuery({
    queryKey: ['salary', 'comprehensive-overtime', iso],
    queryFn: () => attendanceApi.comprehensiveOvertime.getStatus(iso),
  });

  const policyQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime-policy', 'current', iso],
    queryFn: () => attendanceApi.overtimePolicy.getCurrent(),
  });

  const cols = useMemo<ColumnsType<ComprehensiveOvertimeStatus>>(() => [
    { title: '구성원', dataIndex: 'name', key: 'name', render: (v) => v ?? '—' },
    {
      title: '이번 달 누적 OT',
      dataIndex: 'approvedMinutes',
      key: 'approvedMinutes',
      width: 140,
      align: 'right',
      render: (v: number | null) => formatMinutes(v),
    },
    {
      title: '고정 한도',
      dataIndex: 'fixedLimit',
      key: 'fixedLimit',
      width: 120,
      align: 'right',
      render: (v: number | null) => formatMinutes(v),
    },
    {
      title: '회사 월 한도',
      key: 'companyMonthlyLimit',
      width: 130,
      align: 'right',
      render: () => formatMinutes(policyQ.data?.monthlyOvertimeLimitMinutes),
    },
    {
      title: '회사 월 한도 대비',
      key: 'companyMonthlyUsage',
      width: 140,
      align: 'right',
      render: (_, row) => {
        const approved = row.approvedMinutes ?? 0;
        const monthlyLimit = policyQ.data?.monthlyOvertimeLimitMinutes ?? null;
        if (!monthlyLimit || monthlyLimit <= 0) return '—';
        const pct = (approved / monthlyLimit) * 100;
        if (pct >= 100) return <Tag color="red">{pct.toFixed(1)}%</Tag>;
        if (pct >= 80) return <Tag color="orange">{pct.toFixed(1)}%</Tag>;
        return <Tag>{pct.toFixed(1)}%</Tag>;
      },
    },
    {
      title: '사용률',
      dataIndex: 'usagePercent',
      key: 'usagePercent',
      width: 100,
      align: 'right',
      render: (v: number | null) => {
        if (v == null) return '—';
        if (v >= 100) return <Tag color="red">{v.toFixed(1)}%</Tag>;
        if (v >= 80) return <Tag color="orange">{v.toFixed(1)}%</Tag>;
        return <Tag>{v.toFixed(1)}%</Tag>;
      },
      sorter: (a, b) => (a.usagePercent ?? 0) - (b.usagePercent ?? 0),
      defaultSortOrder: 'descend',
    },
    {
      title: '초과분',
      dataIndex: 'exceedMinutes',
      key: 'exceedMinutes',
      width: 120,
      align: 'right',
      render: (v: number | null) =>
        !v ? <Typography.Text type="secondary">—</Typography.Text> : <Tag color="red">{v}분</Tag>,
    },
  ], [policyQ.data?.monthlyOvertimeLimitMinutes]);

  return (
    <Space direction="vertical" className="tw-w-full" size={12}>
      <Alert
        type="info"
        showIcon
        message="직원들의 이번 달 누적 초과 근무 현황입니다."
        description="사용률 50% 이상만 표시됩니다. 고정 한도와 함께 회사 커스텀 일/월 연장근로 한도도 같이 확인할 수 있습니다."
      />
      <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-3">
        <Card size="small" className="tw-border-slate-200/80 tw-shadow-sm">
          <Typography.Text type="secondary" className="tw-text-xs">
            회사 커스텀 일 연장근로 한도
          </Typography.Text>
          <div className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900">
            {formatMinutes(policyQ.data?.dailyOvertimeLimitMinutes)}
          </div>
        </Card>
        <Card size="small" className="tw-border-slate-200/80 tw-shadow-sm">
          <Typography.Text type="secondary" className="tw-text-xs">
            회사 커스텀 월 연장근로 한도
          </Typography.Text>
          <div className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900">
            {formatMinutes(policyQ.data?.monthlyOvertimeLimitMinutes)}
          </div>
        </Card>
      </div>
      <div className="tw-flex tw-items-center tw-gap-3">
        <Typography.Text type="secondary" className="!tw-text-sm">
          기준일
        </Typography.Text>
        <DatePicker
          value={baseDate}
          onChange={(d) => d && setBaseDate(d)}
          allowClear={false}
          format="YYYY-MM-DD"
        />
      </div>
      <Table<ComprehensiveOvertimeStatus>
        rowKey={(r) => r.memberId ?? `${r.name}-${r.approvedMinutes}`}
        loading={listQ.isLoading}
        dataSource={listQ.data ?? []}
        columns={cols}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '포괄임금제 초과(또는 임박) 대상이 없습니다.' }}
      />
    </Space>
  );
}

/* ======================================================================
 * 간이세액표 (SimplifiedTaxTable) — 국세청 고시 표 엑셀 업로드
 * 매년 1월 새 표 등록 시 다음 달 급여 계산부터 정확한 소득세 적용
 * ====================================================================== */

function SimplifiedTaxTableTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [year, setYear] = useState<number>(() => dayjs().year());
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  const yearsQ = useQuery({
    queryKey: ['salary', 'simplified-tax-table', 'years'],
    queryFn: () => salaryApi.simplifiedTaxTable.listYears(),
  });

  const countQ = useQuery({
    queryKey: ['salary', 'simplified-tax-table', 'count', year],
    queryFn: () => salaryApi.simplifiedTaxTable.countByYear(year),
  });

  const handleUpload = async () => {
    if (!pickedFile) {
      message.warning('엑셀 파일을 선택하세요.');
      return;
    }
    try {
      setUploading(true);
      const res = await salaryApi.simplifiedTaxTable.upload(year, pickedFile);
      message.success(`${res.effectiveYear}년 표 ${res.inserted.toLocaleString()}행 등록 완료`);
      setPickedFile(null);
      setFileName(null);
      void qc.invalidateQueries({ queryKey: ['salary', 'simplified-tax-table'] });
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message ?? '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const yearOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const y = dayjs().year() - 1 + i;
        return { value: y, label: `${y}년` };
      }),
    [],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Alert
        type="info"
        showIcon
        message="간이세액표는 국세청 홈택스에서 매년 고시됩니다."
        description={
          <span className="tw-text-xs">
            홈택스 → 「세무업무별 서비스」 → 「원천징수」 → 「근로소득간이세액표」 에서 엑셀 다운로드 후 업로드하세요.
            같은 연도 재업로드 시 기존 행은 자동 갱신됩니다.
          </span>
        }
      />

      <Card title="신규 업로드">
        <Space direction="vertical" className="tw-w-full" size={12}>
          <Space wrap>
            <span className="tw-text-sm">적용 연도</span>
            <Select
              value={year}
              onChange={setYear}
              options={yearOptions}
              style={{ width: 140 }}
            />
          </Space>

          <Space wrap>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPickedFile(f);
                setFileName(f?.name ?? null);
              }}
            />
            {fileName && <span className="tw-text-xs tw-text-slate-500">{fileName}</span>}
          </Space>

          <Button
            type="primary"
            onClick={handleUpload}
            loading={uploading}
            disabled={!pickedFile}
          >
            업로드
          </Button>
        </Space>
      </Card>

      <Card title="등록 현황">
        <Space direction="vertical" className="tw-w-full" size={8}>
          <div>
            <span className="tw-text-sm tw-text-slate-500">{year}년 등록 행 수</span>
            <Typography.Title level={3} className="!tw-m-0 !tw-mt-1">
              {countQ.isLoading ? '…' : (countQ.data?.count ?? 0).toLocaleString()}
              <span className="tw-text-base tw-font-normal tw-ml-1">건</span>
            </Typography.Title>
          </div>

          <div>
            <span className="tw-text-sm tw-text-slate-500">등록된 연도 목록</span>
            <div className="tw-mt-1">
              {yearsQ.isLoading ? '…'
                : (yearsQ.data ?? []).length === 0
                  ? <span className="tw-text-slate-400">등록된 연도가 없습니다.</span>
                  : (yearsQ.data ?? []).map((y) => <Tag key={y} color="blue">{y}년</Tag>)
              }
            </div>
          </div>
        </Space>
      </Card>

      <Alert
        type="warning"
        showIcon
        message="간이세액표가 등록되지 않은 연도는 소득세가 0원으로 계산됩니다."
      />
    </Space>
  );
}

/* ======================================================================
 * Page — 4탭 통합 (정책/세율/항목/간이세액표 + 호봉표 조건부)
 * ====================================================================== */

export function AdminSalarySettingsPage() {
  const salaryPoliciesQ = useQuery({
    queryKey: ['salary', 'salary-policies'],
    queryFn: () => salaryApi.salaryPolicy.list(),
  });
  const hasPayGradePolicy = useMemo(
    () => hasActivePayGradeSalaryPolicy(salaryPoliciesQ.data),
    [salaryPoliciesQ.data],
  );

  const tabItems = useMemo(
    () => [
      { key: 'policy', label: '급여 정책', children: <SalaryPolicyTab /> },
      ...(hasPayGradePolicy
        ? [{ key: 'pay-grade-table', label: '호봉표 관리', children: <AdminPayGradeTablePage embedded /> }]
        : []),
      { key: 'tax', label: '세율', children: <TaxRateTab /> },
      { key: 'template', label: '지급 항목(수당)', children: <SalaryItemTemplateTab /> },
      { key: 'simplified-tax', label: '간이세액표', children: <SimplifiedTaxTableTab /> },
    ],
    [hasPayGradePolicy],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
          급여 정책
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          회사 단위 급여 정책, 세율, 항목을 관리합니다.
        </Typography.Paragraph>
      </div>
      <Card>
        <Tabs defaultActiveKey="policy" items={tabItems} />
      </Card>
    </Space>
  );
}
