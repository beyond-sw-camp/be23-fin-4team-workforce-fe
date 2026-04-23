/** 급여·정책·템플릿·세율만 쪼개 둔 API (salaryServiceApi랑 경로 동일) */
import type {
  MemberAllowance,
  MemberAllowanceCreatePayload,
  PayGradeTable,
  PayGradeTableBulkCreatePayload,
  PayGradeTableCreatePayload,
  PayGradeTableUpdatePayload,
  Payroll,
  PayrollCreatePayload,
  PayrollItem,
  PayrollItemCreatePayload,
  PayrollItemUpdatePayload,
  PayrollRecalculatePayload,
  PayrollRecalculateResult,
  Salary,
  SalaryBootstrapPayload,
  SalaryCreatePayload,
  SalaryItemTemplate,
  SalaryItemTemplateCreatePayload,
  SalaryItemTemplateUpdatePayload,
  SalaryPolicy,
  SalaryPolicyCreatePayload,
  SalaryPolicyUpdatePayload,
  SalaryUpdatePayload,
  TaxRate,
  TaxRateCreatePayload,
  TaxRateUpdatePayload,
  UnusedLeavePayoutApplyPayload,
  UnusedLeavePayoutPreview,
} from '@/features/salary-service/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

const BASE = '';

function unwrapMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const m = (payload as { message?: unknown }).message;
    return typeof m === 'string' ? m : undefined;
  }
  return undefined;
}

export const salaryApi = {
  /** /salary/payroll — 급여명세 */
  payroll: {
    async listByMember(memberId: string): Promise<Payroll[]> {
      const { data } = await httpClient.get(`${BASE}/salary/payroll/member/${encodeURIComponent(memberId)}`);
      const unwrapped = unwrapApiResponse<Payroll[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(payrollId: string): Promise<Payroll> {
      const { data } = await httpClient.get(`${BASE}/salary/payroll/${encodeURIComponent(payrollId)}`);
      return unwrapApiResponse<Payroll>(data);
    },

    async listItems(payrollId: string): Promise<PayrollItem[]> {
      const { data } = await httpClient.get(
        `${BASE}/salary/payroll/${encodeURIComponent(payrollId)}/items`,
      );
      const unwrapped = unwrapApiResponse<PayrollItem[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: PayrollCreatePayload): Promise<Payroll> {
      const { data } = await httpClient.post(`${BASE}/salary/payroll/create`, {
        memberId: payload.memberId,
        payrollYearMonthDay: payload.payrollYearMonthDay,
      });
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    async delete(payrollId: string): Promise<void> {
      await httpClient.delete(`${BASE}/salary/payroll/${encodeURIComponent(payrollId)}`);
    },

    /** 급여명세서 PDF 다운로드. 본인 또는 SALARY:READ 권한 필요 */
    async downloadPayslipPdf(payrollId: string): Promise<Blob> {
      const { data } = await httpClient.get(
        `${BASE}/salary/payroll/${encodeURIComponent(payrollId)}/payslip.pdf`,
        { responseType: 'blob' },
      );
      return data as Blob;
    },

    async confirm(payrollId: string): Promise<Payroll> {
      const { data } = await httpClient.patch(
        `${BASE}/salary/payroll/${encodeURIComponent(payrollId)}/confirm`,
      );
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    async markPaid(payrollId: string): Promise<Payroll> {
      const { data } = await httpClient.patch(`${BASE}/salary/payroll/${encodeURIComponent(payrollId)}/pay`);
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    async addItem(payrollId: string, payload: PayrollItemCreatePayload): Promise<PayrollItem> {
      const { data } = await httpClient.post(
        `${BASE}/salary/payroll/${encodeURIComponent(payrollId)}/items`,
        {
          salaryItemTemplateId: payload.salaryItemTemplateId,
          amount: payload.amount,
        },
      );
      unwrapMessage(data);
      return unwrapApiResponse<PayrollItem>(data);
    },

    async updateItem(payrollItemId: string, payload: PayrollItemUpdatePayload): Promise<PayrollItem> {
      const { data } = await httpClient.put(
        `${BASE}/salary/payroll/items/${encodeURIComponent(payrollItemId)}`,
        {
          amount: payload.amount,
          displayOrder: payload.displayOrder ?? undefined,
        },
      );
      unwrapMessage(data);
      return unwrapApiResponse<PayrollItem>(data);
    },

    async deleteItem(payrollItemId: string): Promise<void> {
      await httpClient.delete(`${BASE}/salary/payroll/items/${encodeURIComponent(payrollItemId)}`);
    },

    /** 회사 단위 급여대장 재계산 (관리자).
     *  - settlementDate 생략 시 백엔드가 정책 기준 다음 정산일을 자동 산정 */
    async recalculate(payload: PayrollRecalculatePayload = {}): Promise<PayrollRecalculateResult> {
      const { data } = await httpClient.post(`${BASE}/salary/payroll/recalculate`, {
        settlementDate: payload.settlementDate ?? null,
      });
      unwrapMessage(data);
      return unwrapApiResponse<PayrollRecalculateResult>(data);
    },
  },

  /** /salary/unused-leave — 미사용 연차수당 (관리자 수동 처리) */
  unusedLeavePayout: {
    /** 미리보기. targetMonth 는 `YYYY-MM` 형식 (백엔드 `YearMonth.parse`) */
    async preview(baseYear: number, targetMonth: string): Promise<UnusedLeavePayoutPreview[]> {
      const { data } = await httpClient.get(`${BASE}/salary/unused-leave/preview`, {
        params: { baseYear, targetMonth },
      });
      const unwrapped = unwrapApiResponse<UnusedLeavePayoutPreview[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    /** 1월 급여대장에 수당 확정 반영 */
    async apply(payload: UnusedLeavePayoutApplyPayload): Promise<void> {
      const { data } = await httpClient.post(`${BASE}/salary/unused-leave/apply`, payload);
      unwrapMessage(data);
    },
  },

  /** /salary/salary-item-templates — 급여항목 템플릿 */
  salaryItemTemplate: {
    async list(): Promise<SalaryItemTemplate[]> {
      const { data } = await httpClient.get(`${BASE}/salary/salary-item-templates`);
      const unwrapped = unwrapApiResponse<SalaryItemTemplate[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(id: string): Promise<SalaryItemTemplate> {
      const { data } = await httpClient.get(
        `${BASE}/salary/salary-item-templates/${encodeURIComponent(id)}`,
      );
      return unwrapApiResponse<SalaryItemTemplate>(data);
    },

    async create(payload: SalaryItemTemplateCreatePayload): Promise<SalaryItemTemplate> {
      const { data } = await httpClient.post(`${BASE}/salary/salary-item-templates/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<SalaryItemTemplate>(data);
    },

    async update(id: string, payload: SalaryItemTemplateUpdatePayload): Promise<SalaryItemTemplate> {
      const { data } = await httpClient.put(
        `${BASE}/salary/salary-item-templates/${encodeURIComponent(id)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<SalaryItemTemplate>(data);
    },

    async delete(id: string): Promise<void> {
      await httpClient.delete(`${BASE}/salary/salary-item-templates/${encodeURIComponent(id)}`);
    },

    /** 회사 표준 급여 항목 일괄 시드 (기본급/식대/자가운전 등). 이미 시드된 회사는 skip */
    async initDefaults(): Promise<{ created: number; message: string }> {
      const { data } = await httpClient.post(`${BASE}/salary/salary-item-templates/init`);
      unwrapMessage(data);
      return unwrapApiResponse<{ created: number; message: string }>(data);
    },
  },

  /** /salary/salaries — 멤버별 기본급 관리 */
  salary: {
    async listByCompany(): Promise<Salary[]> {
      const { data } = await httpClient.get(`${BASE}/salary/salaries`);
      const unwrapped = unwrapApiResponse<Salary[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(salaryId: string): Promise<Salary> {
      const { data } = await httpClient.get(
        `${BASE}/salary/salaries/${encodeURIComponent(salaryId)}`,
      );
      return unwrapApiResponse<Salary>(data);
    },

    async getByMemberId(memberId: string): Promise<Salary[]> {
      const { data } = await httpClient.get(
        `${BASE}/salary/salaries/member/${encodeURIComponent(memberId)}`,
      );
      const unwrapped = unwrapApiResponse<Salary[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: SalaryCreatePayload): Promise<Salary> {
      const { data } = await httpClient.post(`${BASE}/salary/salaries/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<Salary>(data);
    },

    /** 입사 누락 복구 — Kafka 실패/백필 시 수동 트리거.
     *  - 활성 SalaryPolicy 필수, 없으면 백엔드가 skip */
    async bootstrap(payload: SalaryBootstrapPayload): Promise<void> {
      const { data } = await httpClient.post(`${BASE}/salary/salaries/bootstrap`, {
        memberId: payload.memberId,
        hireDate: payload.hireDate,
        baseSalary: payload.baseSalary ?? null,
        jobGradeId: payload.jobGradeId ?? null,
        jobGradeName: payload.jobGradeName ?? null,
        jobTitleName: payload.jobTitleName ?? null,
      });
      unwrapMessage(data);
    },

    async update(salaryId: string, payload: SalaryUpdatePayload): Promise<Salary> {
      const { data } = await httpClient.put(
        `${BASE}/salary/salaries/${encodeURIComponent(salaryId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<Salary>(data);
    },

    async delete(salaryId: string): Promise<void> {
      await httpClient.delete(`${BASE}/salary/salaries/${encodeURIComponent(salaryId)}`);
    },
  },

  /** /salary/salary-policies — 급여 정책 CRUD */
  salaryPolicy: {
    async list(): Promise<SalaryPolicy[]> {
      const { data } = await httpClient.get(`${BASE}/salary/salary-policies`);
      const unwrapped = unwrapApiResponse<SalaryPolicy[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(id: string): Promise<SalaryPolicy> {
      const { data } = await httpClient.get(
        `${BASE}/salary/salary-policies/${encodeURIComponent(id)}`,
      );
      return unwrapApiResponse<SalaryPolicy>(data);
    },

    async create(payload: SalaryPolicyCreatePayload): Promise<SalaryPolicy> {
      const { data } = await httpClient.post(`${BASE}/salary/salary-policies/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<SalaryPolicy>(data);
    },

    async update(id: string, payload: SalaryPolicyUpdatePayload): Promise<SalaryPolicy> {
      const { data } = await httpClient.put(
        `${BASE}/salary/salary-policies/${encodeURIComponent(id)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<SalaryPolicy>(data);
    },

    async delete(id: string): Promise<void> {
      await httpClient.delete(`${BASE}/salary/salary-policies/${encodeURIComponent(id)}`);
    },
  },

  /** /salary/taxRate — 세율 관리 (목록 조회 시 applyYear 필수 — 백엔드 @RequestParam) */
  taxRate: {
    async list(applyYear?: number): Promise<TaxRate[]> {
      const year = applyYear ?? new Date().getFullYear();
      const { data } = await httpClient.get(`${BASE}/salary/taxRate`, {
        params: { applyYear: year },
      });
      const unwrapped = unwrapApiResponse<TaxRate[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(id: string): Promise<TaxRate> {
      const { data } = await httpClient.get(
        `${BASE}/salary/taxRate/${encodeURIComponent(id)}`,
      );
      return unwrapApiResponse<TaxRate>(data);
    },

    async create(payload: TaxRateCreatePayload): Promise<TaxRate> {
      const { data } = await httpClient.post(`${BASE}/salary/taxRate/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<TaxRate>(data);
    },

    async update(id: string, payload: TaxRateUpdatePayload): Promise<TaxRate> {
      const { data } = await httpClient.put(
        `${BASE}/salary/taxRate/${encodeURIComponent(id)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<TaxRate>(data);
    },

    async delete(id: string): Promise<void> {
      await httpClient.delete(`${BASE}/salary/taxRate/${encodeURIComponent(id)}`);
    },

    /** 지정 연도 표준 세율 시드, 기존 값은 보존 (멱등) */
    async initDefaults(applyYear: number): Promise<{
      applyYear: number;
      inserted: number;
      skipped: number;
    }> {
      const { data } = await httpClient.post(`${BASE}/salary/taxRate/init`, null, {
        params: { applyYear },
      });
      unwrapMessage(data);
      return unwrapApiResponse<{ applyYear: number; inserted: number; skipped: number }>(data);
    },
  },

  /** /salary/pay-grade-table — 호봉표 관리 (호봉 → 기본급, 직급 무관) */
  payGradeTable: {
    async list(): Promise<PayGradeTable[]> {
      const { data } = await httpClient.get(`${BASE}/salary/pay-grade-table`);
      const unwrapped = unwrapApiResponse<PayGradeTable[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(payGradeTableId: string): Promise<PayGradeTable> {
      const { data } = await httpClient.get(
        `${BASE}/salary/pay-grade-table/${encodeURIComponent(payGradeTableId)}`,
      );
      return unwrapApiResponse<PayGradeTable>(data);
    },

    async create(payload: PayGradeTableCreatePayload): Promise<PayGradeTable> {
      const { data } = await httpClient.post(`${BASE}/salary/pay-grade-table/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<PayGradeTable>(data);
    },

    async update(
      payGradeTableId: string,
      payload: PayGradeTableUpdatePayload,
    ): Promise<PayGradeTable> {
      const { data } = await httpClient.put(
        `${BASE}/salary/pay-grade-table/${encodeURIComponent(payGradeTableId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<PayGradeTable>(data);
    },

    async delete(payGradeTableId: string): Promise<void> {
      await httpClient.delete(
        `${BASE}/salary/pay-grade-table/${encodeURIComponent(payGradeTableId)}`,
      );
    },

    /** 일괄 등록, 같은 (직급, 호봉) 활성 레코드는 자동 마감 후 신규 발행 */
    async bulkCreate(
      payload: PayGradeTableBulkCreatePayload,
    ): Promise<{ created: number; replaced: number }> {
      const { data } = await httpClient.post(
        `${BASE}/salary/pay-grade-table/bulk-create`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<{ created: number; replaced: number }>(data);
    },
  },

  /** /api/salary/me/allowances — 개인 수당 신청(사원) */
  memberAllowance: {
    async createMy(payload: MemberAllowanceCreatePayload): Promise<MemberAllowance> {
      const { data } = await httpClient.post(`${BASE}/api/salary/me/allowances`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<MemberAllowance>(data);
    },

    async listMy(): Promise<MemberAllowance[]> {
      const { data } = await httpClient.get(`${BASE}/api/salary/me/allowances`);
      const unwrapped = unwrapApiResponse<MemberAllowance[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async updateApprovalLink(memberAllowanceId: string, approvalRequestId: string): Promise<void> {
      await httpClient.patch(
        `${BASE}/api/salary/me/allowances/${encodeURIComponent(memberAllowanceId)}/approval-link`,
        null,
        { params: { approvalRequestId } },
      );
    },

    async cancelMy(memberAllowanceId: string): Promise<void> {
      await httpClient.delete(`${BASE}/api/salary/me/allowances/${encodeURIComponent(memberAllowanceId)}`);
    },
  },

  /** /api/salary/admin/allowances — 수당 관리자 조회/자동등록 */
  memberAllowanceAdmin: {
    async autoGrant(payload: {
      memberId: string;
      salaryItemTemplateId: string;
      amount: number;
      effectiveFrom: string;
    }): Promise<void> {
      const { data } = await httpClient.post(`${BASE}/api/salary/admin/allowances/auto-grant`, payload);
      unwrapMessage(data);
    },

    async listByStatus(status?: string): Promise<MemberAllowance[]> {
      const { data } = await httpClient.get(`${BASE}/api/salary/admin/allowances`, {
        params: status ? { status } : undefined,
      });
      const unwrapped = unwrapApiResponse<MemberAllowance[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async listActiveByMember(memberId: string, date: string): Promise<MemberAllowance[]> {
      const { data } = await httpClient.get(
        `${BASE}/api/salary/admin/allowances/members/${encodeURIComponent(memberId)}/active`,
        { params: { date } },
      );
      const unwrapped = unwrapApiResponse<MemberAllowance[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },
  },
};
