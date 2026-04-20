/**
 * salary-service 게이트웨이 경로 기준 API 묶음.
 * 근태(/attendance 등) + 급여(/salary/...) + 휴가·스케줄·출장 한데 모아둠.
 */
import type {
  AttendanceLog,
  AttendanceLogCreatePayload,
  CompanyHoliday,
  CompanyHolidayCreatePayload,
  CompanyHolidayUpdatePayload,
  DailyAttendance,
  LeavePolicy,
  LeavePolicyCreatePayload,
  LeavePolicyUpdatePayload,
  MemberBalance,
  MemberBalanceGrantPayload,
  Payroll,
  PayrollCreatePayload,
  PayrollItem,
  PayrollItemCreatePayload,
  PayrollItemUpdatePayload,
  Salary,
  SalaryCreatePayload,
  SalaryItemTemplate,
  SalaryItemTemplateCreatePayload,
  SalaryItemTemplateUpdatePayload,
  SalaryPolicy,
  SalaryPolicyCreatePayload,
  SalaryPolicyUpdatePayload,
  SalaryUpdatePayload,
  SpringPage,
  TaxRate,
  TaxRateCreatePayload,
  TaxRateUpdatePayload,
  WorkSchedule,
  WorkScheduleCreatePayload,
  WorkScheduleUpdatePayload,
  WorkTrip,
  WorkTripCreatePayload,
  WorkTripUpdatePayload,
} from '@/features/salary-service/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

/**
 * salary-service 베이스 경로.
 * 게이트웨이에서 `/salary` 등으로 묶여 있다면 .env에 맞춰 `VITE_API_BASE_URL`만 조정하고,
 * 필요 시 이 상수에 프리픽스를 붙이면 됩니다.
 */
const SALARY = '';

function unwrapMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const m = (payload as { message?: unknown }).message;
    return typeof m === 'string' ? m : undefined;
  }
  return undefined;
}

export const salaryServiceApi = {
  // /attendance — 출퇴근·개인/전사 조회
  attendance: {
    async clockIn(body?: AttendanceLogCreatePayload): Promise<DailyAttendance> {
      const { data } = await httpClient.post(`${SALARY}/attendance/clock-in`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<DailyAttendance>(data);
    },

    async clockOut(body?: AttendanceLogCreatePayload): Promise<DailyAttendance> {
      const { data } = await httpClient.post(`${SALARY}/attendance/clock-out`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<DailyAttendance>(data);
    },

    async breakStart(body?: AttendanceLogCreatePayload): Promise<AttendanceLog> {
      const { data } = await httpClient.post(`${SALARY}/attendance/break-start`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<AttendanceLog>(data);
    },

    async breakEnd(body?: AttendanceLogCreatePayload): Promise<AttendanceLog> {
      const { data } = await httpClient.post(`${SALARY}/attendance/break-end`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<AttendanceLog>(data);
    },

    async getMyDaily(dateIso: string): Promise<DailyAttendance> {
      const { data } = await httpClient.get(`${SALARY}/attendance/daily/${dateIso}`);
      return unwrapApiResponse<DailyAttendance>(data);
    },

    async getMyLogs(dateIso: string): Promise<AttendanceLog[]> {
      const { data } = await httpClient.get(`${SALARY}/attendance/logs/${dateIso}`);
      const unwrapped = unwrapApiResponse<AttendanceLog[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getMyMonthly(params: {
      from: string;
      to: string;
      page?: number;
      size?: number;
    }): Promise<SpringPage<DailyAttendance>> {
      const { data } = await httpClient.get(`${SALARY}/attendance/monthly`, {
        params: {
          from: params.from,
          to: params.to,
          page: params.page ?? 0,
          size: params.size ?? 31,
        },
      });
      return unwrapApiResponse<SpringPage<DailyAttendance>>(data);
    },

    async getCompanyDaily(params: {
      date: string;
      page?: number;
      size?: number;
    }): Promise<SpringPage<DailyAttendance>> {
      const { data } = await httpClient.get(`${SALARY}/attendance/company/daily`, {
        params: {
          date: params.date,
          page: params.page ?? 0,
          size: params.size ?? 20,
        },
      });
      return unwrapApiResponse<SpringPage<DailyAttendance>>(data);
    },

    async getCompanyMonthly(params: {
      from: string;
      to: string;
      page?: number;
      size?: number;
    }): Promise<SpringPage<DailyAttendance>> {
      const { data } = await httpClient.get(`${SALARY}/attendance/company/monthly`, {
        params: {
          from: params.from,
          to: params.to,
          page: params.page ?? 0,
          size: params.size ?? 50,
        },
      });
      return unwrapApiResponse<SpringPage<DailyAttendance>>(data);
    },
  },

  // /member-balance
  memberBalance: {
    async listMine(): Promise<MemberBalance[]> {
      const { data } = await httpClient.get(`${SALARY}/member-balance`);
      const unwrapped = unwrapApiResponse<MemberBalance[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async grant(payload: MemberBalanceGrantPayload): Promise<MemberBalance> {
      // TODO: 승인 이벤트에서 balanceType(ANNUAL/MONTHLY) 정확히 내려오게 맞추기
      const { data } = await httpClient.post(`${SALARY}/member-balance/grant`, {
        memberId: payload.memberId,
        balanceType: payload.balanceType,
        totalGranted: payload.totalGranted,
        expirationDate: payload.expirationDate ?? undefined,
      });
      unwrapMessage(data);
      return unwrapApiResponse<MemberBalance>(data);
    },
  },

  // /leave-policies
  leavePolicy: {
    async list(): Promise<LeavePolicy[]> {
      const { data } = await httpClient.get(`${SALARY}/leave-policies`);
      const unwrapped = unwrapApiResponse<LeavePolicy[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(policyId: string): Promise<LeavePolicy> {
      const { data } = await httpClient.get(
        `${SALARY}/leave-policies/${encodeURIComponent(policyId)}`,
      );
      return unwrapApiResponse<LeavePolicy>(data);
    },

    async create(payload: LeavePolicyCreatePayload): Promise<LeavePolicy> {
      const { data } = await httpClient.post(`${SALARY}/leave-policies/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<LeavePolicy>(data);
    },

    async update(policyId: string, payload: LeavePolicyUpdatePayload): Promise<LeavePolicy> {
      const { data } = await httpClient.put(
        `${SALARY}/leave-policies/${encodeURIComponent(policyId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<LeavePolicy>(data);
    },

    async delete(policyId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/leave-policies/${encodeURIComponent(policyId)}`);
    },
  },

  // /company-holidays
  companyHoliday: {
    async list(): Promise<CompanyHoliday[]> {
      const { data } = await httpClient.get(`${SALARY}/company-holidays`);
      const unwrapped = unwrapApiResponse<CompanyHoliday[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: CompanyHolidayCreatePayload): Promise<CompanyHoliday> {
      const { data } = await httpClient.post(`${SALARY}/company-holidays/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<CompanyHoliday>(data);
    },

    async update(holidayId: string, payload: CompanyHolidayUpdatePayload): Promise<CompanyHoliday> {
      const { data } = await httpClient.put(
        `${SALARY}/company-holidays/${encodeURIComponent(holidayId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<CompanyHoliday>(data);
    },

    async delete(holidayId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/company-holidays/${encodeURIComponent(holidayId)}`);
    },
  },

  // /work-schedules
  workSchedule: {
    async list(): Promise<WorkSchedule[]> {
      const { data } = await httpClient.get(`${SALARY}/work-schedules`);
      const unwrapped = unwrapApiResponse<WorkSchedule[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(scheduleId: string): Promise<WorkSchedule> {
      const { data } = await httpClient.get(
        `${SALARY}/work-schedules/${encodeURIComponent(scheduleId)}`,
      );
      return unwrapApiResponse<WorkSchedule>(data);
    },

    async create(payload: WorkScheduleCreatePayload): Promise<WorkSchedule> {
      const { data } = await httpClient.post(`${SALARY}/work-schedules/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<WorkSchedule>(data);
    },

    async update(scheduleId: string, payload: WorkScheduleUpdatePayload): Promise<WorkSchedule> {
      const { data } = await httpClient.put(
        `${SALARY}/work-schedules/${encodeURIComponent(scheduleId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<WorkSchedule>(data);
    },

    async delete(scheduleId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/work-schedules/${encodeURIComponent(scheduleId)}`);
    },
  },

  // /work-trip
  workTrip: {
    async listMine(): Promise<WorkTrip[]> {
      const { data } = await httpClient.get(`${SALARY}/work-trip`);
      const unwrapped = unwrapApiResponse<WorkTrip[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async listByDaily(dailyAttendanceId: string): Promise<WorkTrip[]> {
      const { data } = await httpClient.get(
        `${SALARY}/work-trip/daily/${encodeURIComponent(dailyAttendanceId)}`,
      );
      const unwrapped = unwrapApiResponse<WorkTrip[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: WorkTripCreatePayload): Promise<WorkTrip> {
      const { data } = await httpClient.post(`${SALARY}/work-trip/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<WorkTrip>(data);
    },

    async update(workTripDetailId: string, payload: WorkTripUpdatePayload): Promise<WorkTrip> {
      const { data } = await httpClient.put(
        `${SALARY}/work-trip/${encodeURIComponent(workTripDetailId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<WorkTrip>(data);
    },

    async delete(workTripDetailId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/work-trip/${encodeURIComponent(workTripDetailId)}`);
    },
  },

  // /salary/payroll
  payroll: {
    async listByMember(memberId: string): Promise<Payroll[]> {
      const { data } = await httpClient.get(`${SALARY}/salary/payroll/member/${encodeURIComponent(memberId)}`);
      const unwrapped = unwrapApiResponse<Payroll[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(payrollId: string): Promise<Payroll> {
      const { data } = await httpClient.get(`${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}`);
      return unwrapApiResponse<Payroll>(data);
    },

    async listItems(payrollId: string): Promise<PayrollItem[]> {
      const { data } = await httpClient.get(
        `${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}/items`,
      );
      const unwrapped = unwrapApiResponse<PayrollItem[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: PayrollCreatePayload): Promise<Payroll> {
      const { data } = await httpClient.post(`${SALARY}/salary/payroll/create`, {
        memberId: payload.memberId,
        payrollYearMonthDay: payload.payrollYearMonthDay,
      });
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    // 급여대장 본체 수기 수정
    async update(
      payrollId: string,
      payload: {
        payrollYearMonthDay: string;
        totalPayment: number;
        totalDeduction: number;
        netPay: number;
      },
    ): Promise<Payroll> {
      const { data } = await httpClient.put(
        `${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    async delete(payrollId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}`);
    },

    async confirm(payrollId: string): Promise<Payroll> {
      const { data } = await httpClient.patch(
        `${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}/confirm`,
      );
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    async markPaid(payrollId: string): Promise<Payroll> {
      const { data } = await httpClient.patch(`${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}/pay`);
      unwrapMessage(data);
      return unwrapApiResponse<Payroll>(data);
    },

    async addItem(payrollId: string, payload: PayrollItemCreatePayload): Promise<PayrollItem> {
      const { data } = await httpClient.post(
        `${SALARY}/salary/payroll/${encodeURIComponent(payrollId)}/items`,
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
        `${SALARY}/salary/payroll/items/${encodeURIComponent(payrollItemId)}`,
        {
          amount: payload.amount,
          displayOrder: payload.displayOrder ?? undefined,
        },
      );
      unwrapMessage(data);
      return unwrapApiResponse<PayrollItem>(data);
    },

    async deleteItem(payrollItemId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/salary/payroll/items/${encodeURIComponent(payrollItemId)}`);
    },
  },

  // /salary/salary-item-templates
  salaryItemTemplate: {
    async list(): Promise<SalaryItemTemplate[]> {
      const { data } = await httpClient.get(`${SALARY}/salary/salary-item-templates`);
      const unwrapped = unwrapApiResponse<SalaryItemTemplate[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(id: string): Promise<SalaryItemTemplate> {
      const { data } = await httpClient.get(
        `${SALARY}/salary/salary-item-templates/${encodeURIComponent(id)}`,
      );
      return unwrapApiResponse<SalaryItemTemplate>(data);
    },

    async create(payload: SalaryItemTemplateCreatePayload): Promise<SalaryItemTemplate> {
      const { data } = await httpClient.post(`${SALARY}/salary/salary-item-templates/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<SalaryItemTemplate>(data);
    },

    async update(id: string, payload: SalaryItemTemplateUpdatePayload): Promise<SalaryItemTemplate> {
      const { data } = await httpClient.put(
        `${SALARY}/salary/salary-item-templates/${encodeURIComponent(id)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<SalaryItemTemplate>(data);
    },

    async delete(id: string): Promise<void> {
      await httpClient.delete(`${SALARY}/salary/salary-item-templates/${encodeURIComponent(id)}`);
    },
  },

  // /salary/salaries
  salary: {
    async listByCompany(): Promise<Salary[]> {
      const { data } = await httpClient.get(`${SALARY}/salary/salaries`);
      const unwrapped = unwrapApiResponse<Salary[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(salaryId: string): Promise<Salary> {
      const { data } = await httpClient.get(
        `${SALARY}/salary/salaries/${encodeURIComponent(salaryId)}`,
      );
      return unwrapApiResponse<Salary>(data);
    },

    async getByMemberId(memberId: string): Promise<Salary[]> {
      const { data } = await httpClient.get(
        `${SALARY}/salary/salaries/member/${encodeURIComponent(memberId)}`,
      );
      const unwrapped = unwrapApiResponse<Salary[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: SalaryCreatePayload): Promise<Salary> {
      const { data } = await httpClient.post(`${SALARY}/salary/salaries/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<Salary>(data);
    },

    async update(salaryId: string, payload: SalaryUpdatePayload): Promise<Salary> {
      const { data } = await httpClient.put(
        `${SALARY}/salary/salaries/${encodeURIComponent(salaryId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<Salary>(data);
    },

    async delete(salaryId: string): Promise<void> {
      await httpClient.delete(`${SALARY}/salary/salaries/${encodeURIComponent(salaryId)}`);
    },
  },

  // /salary/salary-policies
  salaryPolicy: {
    async list(): Promise<SalaryPolicy[]> {
      const { data } = await httpClient.get(`${SALARY}/salary/salary-policies`);
      const unwrapped = unwrapApiResponse<SalaryPolicy[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(id: string): Promise<SalaryPolicy> {
      const { data } = await httpClient.get(
        `${SALARY}/salary/salary-policies/${encodeURIComponent(id)}`,
      );
      return unwrapApiResponse<SalaryPolicy>(data);
    },

    async create(payload: SalaryPolicyCreatePayload): Promise<SalaryPolicy> {
      const { data } = await httpClient.post(`${SALARY}/salary/salary-policies/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<SalaryPolicy>(data);
    },

    async update(id: string, payload: SalaryPolicyUpdatePayload): Promise<SalaryPolicy> {
      const { data } = await httpClient.put(
        `${SALARY}/salary/salary-policies/${encodeURIComponent(id)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<SalaryPolicy>(data);
    },

    async delete(id: string): Promise<void> {
      await httpClient.delete(`${SALARY}/salary/salary-policies/${encodeURIComponent(id)}`);
    },
  },
  
  // /salary/taxRate
  taxRate: {
    async list(applyYear?: number): Promise<TaxRate[]> {
      const year = applyYear ?? new Date().getFullYear();
      const { data } = await httpClient.get(`${SALARY}/salary/taxRate`, {
        params: { applyYear: year },
      });
      const unwrapped = unwrapApiResponse<TaxRate[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(id: string): Promise<TaxRate> {
      const { data } = await httpClient.get(
        `${SALARY}/salary/taxRate/${encodeURIComponent(id)}`,
      );
      return unwrapApiResponse<TaxRate>(data);
    },

    async create(payload: TaxRateCreatePayload): Promise<TaxRate> {
      const { data } = await httpClient.post(`${SALARY}/salary/taxRate/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<TaxRate>(data);
    },

    async update(id: string, payload: TaxRateUpdatePayload): Promise<TaxRate> {
      const { data } = await httpClient.put(
        `${SALARY}/salary/taxRate/${encodeURIComponent(id)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<TaxRate>(data);
    },

    async delete(id: string): Promise<void> {
      await httpClient.delete(`${SALARY}/salary/taxRate/${encodeURIComponent(id)}`);
    },
  },
};
