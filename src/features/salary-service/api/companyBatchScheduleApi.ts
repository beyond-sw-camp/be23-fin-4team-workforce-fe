import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

// 회사 관리자용 자동 작업 1건
export type CompanyBatchSchedule = {
  jobKey: string;
  triggerKey: string;
  cronExpression: string | null;
  nextFireTime: string | null;
  previousFireTime: string | null;
  paused: boolean;
};

const base = '/salary/company-batch-schedule';

export const companyBatchScheduleApi = {
  async list(): Promise<CompanyBatchSchedule[]> {
    const { data } = await httpClient.get(base);
    const list = unwrapApiResponse<CompanyBatchSchedule[] | null>(data);
    return Array.isArray(list) ? list : [];
  },
  async updateCron(jobKey: string, cron: string): Promise<void> {
    await httpClient.put(base, { cron }, { params: { jobKey } });
  },
  async setActive(jobKey: string, active: boolean): Promise<void> {
    const op = active ? 'resume' : 'pause';
    await httpClient.post(`${base}/${op}`, null, { params: { jobKey } });
  },
};
