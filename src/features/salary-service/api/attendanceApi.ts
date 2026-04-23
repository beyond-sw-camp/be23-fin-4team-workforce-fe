/** 근태·휴가·스케줄·출장만 쪼개 둔 API (salaryServiceApi랑 경로 동일) */
import type {
  AttendanceLog,
  AttendanceLogCreatePayload,
  CompanyHoliday,
  CompanyHolidayCreatePayload,
  CompanyHolidayUpdatePayload,
  CompanyIpWhitelist,
  CompanyIpWhitelistCreatePayload,
  CompanyIpWhitelistUpdatePayload,
  CompanyLeaveType,
  CompanyLeaveTypeCreatePayload,
  CompanyLeaveTypeUpdatePayload,
  OvertimeRequest,
  OvertimeRequestCreatePayload,
  OvertimePolicy,
  OvertimePolicyCreatePayload,
  OvertimePolicyUpdatePayload,
  FlexibleTimeSlot,
  FlexibleTimeSlotCreatePayload,
  FlexibleTimeSlotUpdatePayload,
  MemberScheduleSelection,
  MemberScheduleSelectionCreatePayload,
  DailyAttendance,
  LeaveOfAbsence,
  LeaveOfAbsenceApprovalStatusCode,
  LeavePolicy,
  LeavePolicyCreatePayload,
  LeavePolicyUpdatePayload,
  MemberBalance,
  MemberBalanceGrantPayload,
  SpringPage,
  WorkSchedule,
  WorkScheduleCreatePayload,
  WorkScheduleUpdatePayload,
  WorkTimeSummary,
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

    /** 본인 주간 근무시간 요약, date 기준 월요일~일요일 집계. date 생략 시 오늘 */
    async getMyWorkTimeSummary(date?: string): Promise<WorkTimeSummary> {
      const { data } = await httpClient.get(`${BASE}/attendance/my/work-time-summary`, {
        params: date ? { date } : undefined,
      });
      return unwrapApiResponse<WorkTimeSummary>(data);
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

    /** 지정 연도 법정 공휴일 재수집, 커스텀 휴일은 보존 */
    async refreshLegal(year: number): Promise<{ year: number; importedCount: number }> {
      /** POST 본문 `null`은 일부 프록시/서버에서 이상 동작할 수 있어 본문 생략 */
      const { data } = await httpClient.post(`${BASE}/company-holidays/refresh-legal`, undefined, {
        params: { year },
      });
      unwrapMessage(data);
      return unwrapApiResponse<{ year: number; importedCount: number }>(data);
    },
  },

  /** /attendance/ip-whitelist — 회사 허용 IP 관리 (출퇴근 IP 검증) */
  companyIpWhitelist: {
    async list(): Promise<CompanyIpWhitelist[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/ip-whitelist`);
      const unwrapped = unwrapApiResponse<CompanyIpWhitelist[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async create(payload: CompanyIpWhitelistCreatePayload): Promise<CompanyIpWhitelist> {
      const { data } = await httpClient.post(`${BASE}/attendance/ip-whitelist/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<CompanyIpWhitelist>(data);
    },

    async update(
      companyIpWhitelistId: string,
      payload: CompanyIpWhitelistUpdatePayload,
    ): Promise<CompanyIpWhitelist> {
      const { data } = await httpClient.put(
        `${BASE}/attendance/ip-whitelist/${encodeURIComponent(companyIpWhitelistId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<CompanyIpWhitelist>(data);
    },

    async delete(companyIpWhitelistId: string): Promise<void> {
      await httpClient.delete(
        `${BASE}/attendance/ip-whitelist/${encodeURIComponent(companyIpWhitelistId)}`,
      );
    },
  },

  /** /attendance/leave-types — 회사 휴가 종류 */
  companyLeaveType: {
    async list(): Promise<CompanyLeaveType[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/leave-types`);
      const unwrapped = unwrapApiResponse<CompanyLeaveType[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(companyLeaveTypeId: string): Promise<CompanyLeaveType> {
      const { data } = await httpClient.get(
        `${BASE}/attendance/leave-types/${encodeURIComponent(companyLeaveTypeId)}`,
      );
      return unwrapApiResponse<CompanyLeaveType>(data);
    },

    async create(payload: CompanyLeaveTypeCreatePayload): Promise<CompanyLeaveType> {
      const { data } = await httpClient.post(`${BASE}/attendance/leave-types/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<CompanyLeaveType>(data);
    },

    async update(
      companyLeaveTypeId: string,
      payload: CompanyLeaveTypeUpdatePayload,
    ): Promise<CompanyLeaveType> {
      const { data } = await httpClient.put(
        `${BASE}/attendance/leave-types/${encodeURIComponent(companyLeaveTypeId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<CompanyLeaveType>(data);
    },

    async delete(companyLeaveTypeId: string): Promise<void> {
      await httpClient.delete(
        `${BASE}/attendance/leave-types/${encodeURIComponent(companyLeaveTypeId)}`,
      );
    },
  },

  /** /attendance/leave-of-absence — 휴직 (관리자) */
  leaveOfAbsence: {
    /** 상태별 목록, REQUESTED/ACTIVE/ENDED/REJECTED/CANCELLED */
    async listByStatus(status: LeaveOfAbsenceApprovalStatusCode): Promise<LeaveOfAbsence[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/leave-of-absence/admin`, {
        params: { status },
      });
      const unwrapped = unwrapApiResponse<LeaveOfAbsence[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    /** 조기 복직 처리, actualEndDate 지정 */
    async endEarly(leaveOfAbsenceId: string, actualEndDate: string): Promise<void> {
      const { data } = await httpClient.patch(
        `${BASE}/attendance/leave-of-absence/admin/${encodeURIComponent(leaveOfAbsenceId)}/end`,
        null,
        { params: { actualEndDate } },
      );
      unwrapMessage(data);
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

  /** /attendance/overtime-requests — 연장근로 신청(사원) */
  overtimeRequest: {
    async createMy(payload: OvertimeRequestCreatePayload): Promise<OvertimeRequest> {
      const { data } = await httpClient.post(`${BASE}/attendance/overtime-requests/my`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<OvertimeRequest>(data);
    },

    async listMy(params?: { page?: number; size?: number }): Promise<SpringPage<OvertimeRequest>> {
      const { data } = await httpClient.get(`${BASE}/attendance/overtime-requests/my`, {
        params: { page: params?.page ?? 0, size: params?.size ?? 20 },
      });
      return unwrapApiResponse<SpringPage<OvertimeRequest>>(data);
    },

    async listMyByDate(date: string): Promise<OvertimeRequest[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/overtime-requests/my/by-date`, {
        params: { date },
      });
      const unwrapped = unwrapApiResponse<OvertimeRequest[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    async getById(overtimeRequestId: string): Promise<OvertimeRequest> {
      const { data } = await httpClient.get(
        `${BASE}/attendance/overtime-requests/${encodeURIComponent(overtimeRequestId)}`,
      );
      return unwrapApiResponse<OvertimeRequest>(data);
    },

    async updateApprovalLink(overtimeRequestId: string, approvalRequestId: string): Promise<void> {
      await httpClient.put(
        `${BASE}/attendance/overtime-requests/my/${encodeURIComponent(overtimeRequestId)}/approval-link`,
        null,
        { params: { approvalRequestId } },
      );
    },

    async cancelMy(overtimeRequestId: string): Promise<void> {
      await httpClient.delete(`${BASE}/attendance/overtime-requests/my/${encodeURIComponent(overtimeRequestId)}`);
    },
  },

  /** /attendance/overtime-policies — 연장근로 정책(관리자) */
  overtimePolicy: {
    async create(payload: OvertimePolicyCreatePayload): Promise<OvertimePolicy> {
      const { data } = await httpClient.post(`${BASE}/attendance/overtime-policies/create`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<OvertimePolicy>(data);
    },

    async update(policyId: string, payload: OvertimePolicyUpdatePayload): Promise<OvertimePolicy> {
      const { data } = await httpClient.put(
        `${BASE}/attendance/overtime-policies/${encodeURIComponent(policyId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<OvertimePolicy>(data);
    },

    async getCurrent(): Promise<OvertimePolicy> {
      const { data } = await httpClient.get(`${BASE}/attendance/overtime-policies/current`);
      return unwrapApiResponse<OvertimePolicy>(data);
    },

    async getById(policyId: string): Promise<OvertimePolicy> {
      const { data } = await httpClient.get(
        `${BASE}/attendance/overtime-policies/${encodeURIComponent(policyId)}`,
      );
      return unwrapApiResponse<OvertimePolicy>(data);
    },

    async list(): Promise<OvertimePolicy[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/overtime-policies`);
      const unwrapped = unwrapApiResponse<OvertimePolicy[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },
  },

  /** /attendance/flexible-slots — 시차출퇴근 슬롯(관리자) */
  flexibleSlot: {
    async create(payload: FlexibleTimeSlotCreatePayload): Promise<FlexibleTimeSlot> {
      const { data } = await httpClient.post(`${BASE}/attendance/flexible-slots`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<FlexibleTimeSlot>(data);
    },

    async update(slotId: string, payload: FlexibleTimeSlotUpdatePayload): Promise<FlexibleTimeSlot> {
      const { data } = await httpClient.put(
        `${BASE}/attendance/flexible-slots/${encodeURIComponent(slotId)}`,
        payload,
      );
      unwrapMessage(data);
      return unwrapApiResponse<FlexibleTimeSlot>(data);
    },

    async delete(slotId: string): Promise<void> {
      await httpClient.delete(`${BASE}/attendance/flexible-slots/${encodeURIComponent(slotId)}`);
    },

    async setDefault(slotId: string): Promise<FlexibleTimeSlot> {
      const { data } = await httpClient.put(
        `${BASE}/attendance/flexible-slots/${encodeURIComponent(slotId)}/default`,
      );
      unwrapMessage(data);
      return unwrapApiResponse<FlexibleTimeSlot>(data);
    },

    async getById(slotId: string): Promise<FlexibleTimeSlot> {
      const { data } = await httpClient.get(`${BASE}/attendance/flexible-slots/${encodeURIComponent(slotId)}`);
      return unwrapApiResponse<FlexibleTimeSlot>(data);
    },

    async listByWorkSchedule(workScheduleId: string): Promise<FlexibleTimeSlot[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/flexible-slots`, {
        params: { workScheduleId },
      });
      const unwrapped = unwrapApiResponse<FlexibleTimeSlot[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },
  },

  /** /attendance/schedule-selections — 직원 슬롯 선택 */
  scheduleSelection: {
    async createMy(payload: MemberScheduleSelectionCreatePayload): Promise<MemberScheduleSelection> {
      const { data } = await httpClient.post(`${BASE}/attendance/schedule-selections/my`, payload);
      unwrapMessage(data);
      return unwrapApiResponse<MemberScheduleSelection>(data);
    },

    async cancelMy(selectionId: string): Promise<void> {
      await httpClient.delete(`${BASE}/attendance/schedule-selections/my/${encodeURIComponent(selectionId)}`);
    },

    async getMyCurrent(yearMonth: string): Promise<MemberScheduleSelection | null> {
      const { data } = await httpClient.get(`${BASE}/attendance/schedule-selections/my/current`, {
        params: { yearMonth },
      });
      return unwrapApiResponse<MemberScheduleSelection | null>(data);
    },

    async getMyHistory(yearMonth: string): Promise<MemberScheduleSelection[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/schedule-selections/my/history`, {
        params: { yearMonth },
      });
      const unwrapped = unwrapApiResponse<MemberScheduleSelection[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },
  },
};
