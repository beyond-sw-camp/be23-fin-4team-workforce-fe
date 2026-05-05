import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

/** Quartz 잡 1건 */
export type SaasSchedule = {
  jobKey: string;
  triggerKey: string;
  cronExpression: string | null;
  nextFireTime: string | null;
  previousFireTime: string | null;
  paused: boolean;
  /** 어느 서비스 소속인지 - FE 통합 화면용 */
  source: 'member' | 'salary';
};

type RawSchedule = Omit<SaasSchedule, 'source'>;

const memberBase = '/saas/schedules/member';
const salaryBase = '/saas/schedules/salary';

async function fetchList(base: string, source: SaasSchedule['source']): Promise<SaasSchedule[]> {
  const { data } = await httpClient.get(base);
  const list = unwrapApiResponse<RawSchedule[] | null>(data);
  if (!Array.isArray(list)) return [];
  return list.map((it) => ({ ...it, source }));
}

const taxTableBase = '/saas/tax-table';
const taxRateBase = '/saas/tax-rate';
const companyBase = '/saas/companies';

export type SaasCompany = {
  companyId: string;
  companyName: string;
  businessNumber: string;
};

export type TaxType =
  | 'NATIONAL_PENSION'
  | 'HEALTH_INSURANCE'
  | 'LONG_TERM_CARE'
  | 'EMPLOYMENT_INSURANCE'
  | 'ACCIDENT_INSURANCE'
  | 'INCOME_TAX'
  | 'LOCAL_INCOME_TAX';

export type TaxRate = {
  taxRateId: string;
  taxType: TaxType;
  rate: number;
  employerRate: number | null;
  incomeCeiling: number | null;
  incomeFloor: number | null;
  applyYear: number;
};

export type TaxRateInput = {
  taxType: TaxType;
  applyYear: number;
  rate: number;
  employerRate?: number | null;
  incomeCeiling?: number | null;
  incomeFloor?: number | null;
};

export const saasApi = {
  company: {
    async list(): Promise<SaasCompany[]> {
      const { data } = await httpClient.get(companyBase);
      const list = unwrapApiResponse<SaasCompany[] | null>(data);
      return Array.isArray(list) ? list : [];
    },
  },
  taxRate: {
    /** 연도별 세율 목록 */
    async list(applyYear: number): Promise<TaxRate[]> {
      const { data } = await httpClient.get(taxRateBase, { params: { applyYear } });
      const list = unwrapApiResponse<TaxRate[] | null>(data);
      return Array.isArray(list) ? list : [];
    },
    async create(input: TaxRateInput): Promise<TaxRate> {
      const { data } = await httpClient.post(taxRateBase, input);
      return unwrapApiResponse<TaxRate>(data);
    },
    async update(taxRateId: string, input: TaxRateInput): Promise<TaxRate> {
      const { data } = await httpClient.put(`${taxRateBase}/${taxRateId}`, input);
      return unwrapApiResponse<TaxRate>(data);
    },
    async remove(taxRateId: string): Promise<void> {
      await httpClient.delete(`${taxRateBase}/${taxRateId}`);
    },
    /** 표준 4대보험+세금 일괄 시드 (이미 있는 유형은 skip) */
    async initDefaults(applyYear: number): Promise<{ applyYear: number; inserted: number; skipped: number }> {
      const { data } = await httpClient.post(`${taxRateBase}/init`, null, { params: { applyYear } });
      return unwrapApiResponse<{ applyYear: number; inserted: number; skipped: number }>(data);
    },
  },
  taxTable: {
    /** 등록된 연도 목록 */
    async listYears(): Promise<number[]> {
      const { data } = await httpClient.get(`${taxTableBase}/years`);
      const list = unwrapApiResponse<number[] | null>(data);
      return Array.isArray(list) ? list : [];
    },
    /** 연도별 등록 행 수 */
    async count(year: number): Promise<number> {
      const { data } = await httpClient.get(`${taxTableBase}/count`, { params: { year } });
      const res = unwrapApiResponse<{ year: number; count: number } | null>(data);
      return res?.count ?? 0;
    },
    /** 엑셀 업로드 (multipart). force=true 면 같은 연도 있어도 덮어씀 */
    async upload(effectiveYear: number, file: File, force = false): Promise<{ effectiveYear: number; inserted: number }> {
      const fd = new FormData();
      fd.append('effectiveYear', String(effectiveYear));
      fd.append('file', file);
      fd.append('force', String(force));
      const { data } = await httpClient.post(`${taxTableBase}/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return unwrapApiResponse<{ effectiveYear: number; inserted: number }>(data);
    },
  },
  schedule: {
    /** member 서비스 잡만 */
    listMember(): Promise<SaasSchedule[]> {
      return fetchList(memberBase, 'member');
    },
    /** salary 서비스 잡만 */
    listSalary(): Promise<SaasSchedule[]> {
      return fetchList(salaryBase, 'salary');
    },

    async updateCron(source: SaasSchedule['source'], jobKey: string, cron: string): Promise<void> {
      const base = source === 'salary' ? salaryBase : memberBase;
      // jobKey 는 query parameter 로 (path 안에 :: -> %3A%3A 인코딩 회피)
      await httpClient.put(base, { cron }, { params: { jobKey } });
    },

    /** active=true 면 재개, false 면 일시중지 */
    async setActive(source: SaasSchedule['source'], jobKey: string, active: boolean): Promise<void> {
      const base = source === 'salary' ? salaryBase : memberBase;
      const op = active ? 'resume' : 'pause';
      await httpClient.post(`${base}/${op}`, null, { params: { jobKey } });
    },
  },
};
