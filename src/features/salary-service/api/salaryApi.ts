/** 급여·정책·템플릿·세율만 쪼개 둔 API (salaryServiceApi랑 경로 동일) */
import type {
  Payroll,
  PayrollCreatePayload,
  PayrollItem,
  PayrollItemCreatePayload,
  PayrollItemUpdatePayload,
  PayrollRecalculatePayload,
  PayrollRecalculateResult,
  Salary,
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

  /** /salary/taxRate — 세율 관리 */
  taxRate: {
    async list(applyYear?: number): Promise<TaxRate[]> {
      const { data } = await httpClient.get(`${BASE}/salary/taxRate`, {
        params: applyYear ? { applyYear } : undefined,
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
  },
};
