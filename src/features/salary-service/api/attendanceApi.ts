/** 근태·휴가·스케줄·출장만 쪼개 둔 API (salaryServiceApi랑 경로 동일) */
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
  SpringPage,
  WorkSchedule,
  WorkScheduleCreatePayload,
  WorkScheduleUpdatePayload,
  WorkTrip,
  WorkTripCreatePayload,
  WorkTripUpdatePayload,
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

export const attendanceApi = {
  /** /attendance — 출퇴근·근태 로그 */
  attendance: {
    async clockIn(body?: AttendanceLogCreatePayload): Promise<DailyAttendance> {
      const { data } = await httpClient.post(`${BASE}/attendance/clock-in`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<DailyAttendance>(data);
    },

    async clockOut(body?: AttendanceLogCreatePayload): Promise<DailyAttendance> {
      const { data } = await httpClient.post(`${BASE}/attendance/clock-out`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<DailyAttendance>(data);
    },

    async breakStart(body?: AttendanceLogCreatePayload): Promise<AttendanceLog> {
      const { data } = await httpClient.post(`${BASE}/attendance/break-start`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<AttendanceLog>(data);
    },

    async breakEnd(body?: AttendanceLogCreatePayload): Promise<AttendanceLog> {
      const { data } = await httpClient.post(`${BASE}/attendance/break-end`, body ?? {});
      unwrapMessage(data);
      return unwrapApiResponse<AttendanceLog>(data);
    },

    async getMyDaily(dateIso: string): Promise<DailyAttendance> {
      const { data } = await httpClient.get(`${BASE}/attendance/daily/${dateIso}`);
      return unwrapApiResponse<DailyAttendance>(data);
    },

    async getMyLogs(dateIso: string): Promise<AttendanceLog[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/logs/${dateIso}`);
      const unwrapped = unwrapApiResponse<AttendanceLog[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getMyMonthly(params: {
      from: string;
      to: string;
      page?: number;
      size?: number;
    }): Promise<SpringPage<DailyAttendance>> {
      const { data } = await httpClient.get(`${BASE}/attendance/monthly`, {
        params: { from: params.from, to: params.to, page: params.page ?? 0, size: params.size ?? 31 },
      });
      return unwrapApiResponse<SpringPage<DailyAttendance>>(data);
    },

    async getCompanyDaily(params: {
      date: string;
      page?: number;
      size?: number;
    }): Promise<SpringPage<DailyAttendance>> {
      const { data } = await httpClient.get(`${BASE}/attendance/company/daily`, {
        params: { date: params.date, page: params.page ?? 0, size: params.size ?? 20 },
      });
      return unwrapApiResponse<SpringPage<DailyAttendance>>(data);
    },

    async getCompanyMonthly(params: {
      from: string;
      to: string;
      page?: number;
      size?: number;
    }): Promise<SpringPage<DailyAttendance>> {
      const { data } = await httpClient.get(`${BASE}/attendance/company/monthly`, {
        params: { from: params.from, to: params.to, page: params.page ?? 0, size: params.size ?? 50 },
      });
      return unwrapApiResponse<SpringPage<DailyAttendance>>(data);
    },
  },

  /** /member-balance — 휴가 잔여 */
  memberBalance: {
    async listMine(): Promise<MemberBalance[]> {
      const { data } = await httpClient.get(`${BASE}/member-balance`);
      const unwrapped = unwrapApiResponse<MemberBalance[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async grant(payload: MemberBalanceGrantPayload): Promise<MemberBalance> {
      const { data } = await httpClient.post(`${BASE}/member-balance/grant`, {
        memberId: payload.memberId,
        balanceType: payload.balanceType,
        totalGranted: payload.totalGranted,
        expirationDate: payload.expirationDate ?? undefined,
      });
      unwrapMessage(data);
      return unwrapApiResponse<MemberBalance>(data);
    },
  },

  /** /leave-policies — 연차 정책 CRUD */
  leavePolicy: {
    async list(): Promise<LeavePolicy[]> {
      const { data } = await httpClient.get(`${BASE}/leave-policies`);
      const unwrapped = unwrapApiResponse<LeavePolicy[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(policyId: string): Promise<LeavePolicy> {
      const { data } = await httpClient.get(`${BASE}/leave-policies/${encodeURIComponent(policyId)}`);
      return unwrapApiResponse<LeavePolicy>(data);
    },

    async create(payload: LeavePolicyCreatePayload): Promise<LeavePolicy> {
      const { data } = await httpClient.post(`${BASE}/leave-policies/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<LeavePolicy>(data);
    },

    async update(policyId: string, payload: LeavePolicyUpdatePayload): Promise<LeavePolicy> {
      const { data } = await httpClient.put(`${BASE}/leave-policies/${encodeURIComponent(policyId)}`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<LeavePolicy>(data);
    },

    async delete(policyId: string): Promise<void> {
      await httpClient.delete(`${BASE}/leave-policies/${encodeURIComponent(policyId)}`);
    },
  },

  /** /company-holidays — 회사 공휴일 관리 */
  companyHoliday: {
    async list(): Promise<CompanyHoliday[]> {
      const { data } = await httpClient.get(`${BASE}/company-holidays`);
      const unwrapped = unwrapApiResponse<CompanyHoliday[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: CompanyHolidayCreatePayload): Promise<CompanyHoliday> {
      const { data } = await httpClient.post(`${BASE}/company-holidays/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<CompanyHoliday>(data);
    },

    async update(holidayId: string, payload: CompanyHolidayUpdatePayload): Promise<CompanyHoliday> {
      const { data } = await httpClient.put(`${BASE}/company-holidays/${encodeURIComponent(holidayId)}`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<CompanyHoliday>(data);
    },

    async delete(holidayId: string): Promise<void> {
      await httpClient.delete(`${BASE}/company-holidays/${encodeURIComponent(holidayId)}`);
    },
  },

  /** /work-schedules — 근무 스케줄 */
  workSchedule: {
    async list(): Promise<WorkSchedule[]> {
      const { data } = await httpClient.get(`${BASE}/work-schedules`);
      const unwrapped = unwrapApiResponse<WorkSchedule[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(scheduleId: string): Promise<WorkSchedule> {
      const { data } = await httpClient.get(`${BASE}/work-schedules/${encodeURIComponent(scheduleId)}`);
      return unwrapApiResponse<WorkSchedule>(data);
    },

    async create(payload: WorkScheduleCreatePayload): Promise<WorkSchedule> {
      const { data } = await httpClient.post(`${BASE}/work-schedules/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<WorkSchedule>(data);
    },

    async update(scheduleId: string, payload: WorkScheduleUpdatePayload): Promise<WorkSchedule> {
      const { data } = await httpClient.put(`${BASE}/work-schedules/${encodeURIComponent(scheduleId)}`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<WorkSchedule>(data);
    },

    async delete(scheduleId: string): Promise<void> {
      await httpClient.delete(`${BASE}/work-schedules/${encodeURIComponent(scheduleId)}`);
    },
  },

  /** /work-trip — 출장/외근 */
  workTrip: {
    async listMine(): Promise<WorkTrip[]> {
      const { data } = await httpClient.get(`${BASE}/work-trip`);
      const unwrapped = unwrapApiResponse<WorkTrip[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async listByDaily(dailyAttendanceId: string): Promise<WorkTrip[]> {
      const { data } = await httpClient.get(`${BASE}/work-trip/daily/${encodeURIComponent(dailyAttendanceId)}`);
      const unwrapped = unwrapApiResponse<WorkTrip[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: WorkTripCreatePayload): Promise<WorkTrip> {
      const { data } = await httpClient.post(`${BASE}/work-trip/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<WorkTrip>(data);
    },

    async update(workTripDetailId: string, payload: WorkTripUpdatePayload): Promise<WorkTrip> {
      const { data } = await httpClient.put(`${BASE}/work-trip/${encodeURIComponent(workTripDetailId)}`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<WorkTrip>(data);
    },

    async delete(workTripDetailId: string): Promise<void> {
      await httpClient.delete(`${BASE}/work-trip/${encodeURIComponent(workTripDetailId)}`);
    },
  },
};
