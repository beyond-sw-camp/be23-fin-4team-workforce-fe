/** 근태·휴가·스케줄·출장만 쪼개 둔 API (salaryServiceApi랑 경로 동일) */
import type {
  AttendanceCorrectionPending,
  AttendanceCorrectionReqPayload,
  AttendanceLog,
  AttendanceLogCreatePayload,
  MissingAttendanceSuspect,
  OvertimeUsage,
  CompanyHoliday,
  LeaveOfAbsenceSubmitPayload,
  LeaveRequest,
  LeaveRequestSubmitPayload,
  CompanyHolidayCreatePayload,
  CompanyHolidayUpdatePayload,
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
  LeavePromotionHistory,
  LeavePromotionMy,
  LeavePromotionNoResponse,
  LeavePromotionRespondPayload,
  LeavePromotionDesignatePayload,
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
import type { ApiError } from '@/shared/api/types';
import { unwrapApiResponse } from '@/shared/api/response';

const BASE = '';

function unwrapMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const m = (payload as { message?: unknown }).message;
    return typeof m === 'string' ? m : undefined;
  }
  return undefined;
}

function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'status' in e && typeof (e as ApiError).status === 'number';
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

    /** 잘못 누른 퇴근 취소 — 오늘자 ClosureStatus=OPEN 일 때만 허용 */
    async cancelClockOut(): Promise<DailyAttendance> {
      const { data } = await httpClient.delete(`${BASE}/attendance/clock-out`);
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

    /* ─────────────────────────────────────────────────
     * 출퇴근 정정 신청 / 승인 / 반려
     * 새 테이블 없이 DailyAttendance.closureStatus = UNDER_REVIEW + AttendanceLog 의
     * sourceType = ADMIN_MANUAL 활용. 정정 가능 기간은 백엔드 정책 (default 7일)
     * ───────────────────────────────────────────────── */
    correction: {
      /** 직원: 정정 신청. 출근/퇴근 둘 중 하나 이상 + 사유 필수 */
      async request(payload: AttendanceCorrectionReqPayload): Promise<string> {
        const { data } = await httpClient.post(`${BASE}/attendance/correction`, payload);
        return unwrapApiResponse<string>(data);
      },

      /** 직원: 누락 후보 일자 (휴가·휴직 복귀 안전망) */
      async listMyMissing(): Promise<MissingAttendanceSuspect[]> {
        const { data } = await httpClient.get(`${BASE}/attendance/correction/my/missing-suspect`);
        const unwrapped = unwrapApiResponse<MissingAttendanceSuspect[] | null>(data);
        return Array.isArray(unwrapped) ? unwrapped : [];
      },

      /** 관리자: 정정 검토 큐 (UNDER_REVIEW 상태 DA 전체) */
      async listPending(): Promise<AttendanceCorrectionPending[]> {
        const { data } = await httpClient.get(`${BASE}/attendance/correction/pending`);
        const unwrapped = unwrapApiResponse<AttendanceCorrectionPending[] | null>(data);
        return Array.isArray(unwrapped) ? unwrapped : [];
      },

      /** 관리자: 승인 → 재계산 + FINALIZED */
      async approve(dailyAttendanceId: string): Promise<void> {
        await httpClient.post(`${BASE}/attendance/correction/${dailyAttendanceId}/approve`);
      },

      /** 관리자: 반려 → 정정 로그 삭제 + 원본 복구 + OPEN 복귀 */
      async reject(dailyAttendanceId: string, rejectReason: string): Promise<void> {
        await httpClient.post(`${BASE}/attendance/correction/${dailyAttendanceId}/reject`, {
          rejectReason,
        });
      },
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

    // 이월 동의 회신 (회사 정책 isCarryoverConsentYn='Y' 일 때만 사용)
    async agreeCarryover(memberBalanceId: string): Promise<MemberBalance> {
      const { data } = await httpClient.post(
        `${BASE}/member-balance/${encodeURIComponent(memberBalanceId)}/carryover-consent`,
      );
      unwrapMessage(data);
      return unwrapApiResponse<MemberBalance>(data);
    },

    // 이월 동의 철회
    async revokeCarryoverConsent(memberBalanceId: string): Promise<MemberBalance> {
      const { data } = await httpClient.delete(
        `${BASE}/member-balance/${encodeURIComponent(memberBalanceId)}/carryover-consent`,
      );
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

  // 연차 사용 촉진 통보 회신 강제지정
  leavePromotion: {
    // 직원 본인 통보 목록 응답 필요한 것 우선
    async listMy(): Promise<LeavePromotionMy[]> {
      const { data } = await httpClient.get(`${BASE}/leave-promotions/my`);
      const unwrapped = unwrapApiResponse<LeavePromotionMy[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    // 직원 사용계획 회신 LeaveRequest 자동생성 안 함 잔여 차감 없음
    async respond(promotionLogId: string,
                  payload: LeavePromotionRespondPayload): Promise<void> {
      const { data } = await httpClient.post(
        `${BASE}/leave-promotions/${encodeURIComponent(promotionLogId)}/respond`,
        payload,
      );
      unwrapMessage(data);
    },

    // 직원 통보 열람 기록 첫 호출만 viewedAt 기록 이후는 멱등 무시
    async markViewed(promotionLogId: string): Promise<void> {
      const { data } = await httpClient.post(
        `${BASE}/leave-promotions/${encodeURIComponent(promotionLogId)}/view`,
      );
      unwrapMessage(data);
    },

    // 관리자 무응답자 리스트 2차 통보 후 10일 경과만 노출
    async listNoResponse(): Promise<LeavePromotionNoResponse[]> {
      const { data } = await httpClient.get(`${BASE}/leave-promotions/admin/no-response`);
      const unwrapped = unwrapApiResponse<LeavePromotionNoResponse[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    // 관리자 강제 지정 노무수령 거부 LeaveRequest 자동 생성 잔여 차감
    async designate(promotionLogId: string,
                    payload: LeavePromotionDesignatePayload): Promise<void> {
      const { data } = await httpClient.post(
        `${BASE}/leave-promotions/${encodeURIComponent(promotionLogId)}/designate`,
        payload,
      );
      unwrapMessage(data);
    },

    // 관리자 — 통보 이력 (회신 완료 + 강제 지정)
    async listHistory(): Promise<LeavePromotionHistory[]> {
      const { data } = await httpClient.get(`${BASE}/leave-promotions/admin/history`);
      const unwrapped = unwrapApiResponse<LeavePromotionHistory[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    // 시연용 — 촉진 배치 즉시 실행
    async runBatch(targetDate?: string): Promise<{
      targetDate: string;
      firstSent: number;
      secondSent: number;
      skipped: number;
    }> {
      const { data } = await httpClient.post(`${BASE}/leave-promotions/batch/run`, null, {
        params: targetDate ? { targetDate } : undefined,
      });
      return unwrapApiResponse(data);
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

    /** 회사 기본 휴가(연차/반차/경조 등) 시드 codes 지정 시 해당 코드만 시드 */
    async initDefaults(companyId: string, codes?: string[]): Promise<void> {
      await httpClient.post(
        `${BASE}/attendance/leave-types/init`,
        codes && codes.length > 0 ? { codes } : undefined,
        { params: { companyId } },
      );
    },
  },

  /** /attendance/leave-of-absence — 휴직 */
  leaveOfAbsence: {
    /** 본인 휴직 신청, 결재 연계 pre-action 전용 */
    async submit(payload: LeaveOfAbsenceSubmitPayload): Promise<LeaveOfAbsence> {
      const { data } = await httpClient.post(`${BASE}/attendance/leave-of-absence/my`, payload);
      const unwrapped = unwrapApiResponse<LeaveOfAbsence | null>(data);
      if (!unwrapped) throw new Error('휴직 신청 생성에 실패했습니다.');
      return unwrapped;
    },

    /** 결재 생성 후 approvalRequestId 역링크 */
    async linkApproval(leaveOfAbsenceId: string, approvalRequestId: string): Promise<void> {
      await httpClient.patch(
        `${BASE}/attendance/leave-of-absence/my/${encodeURIComponent(leaveOfAbsenceId)}/approval-link`,
        { approvalRequestId },
      );
    },

    /** 결재 생성 실패 시 best-effort 롤백 (본인 철회) */
    async cancel(leaveOfAbsenceId: string): Promise<void> {
      await httpClient.delete(
        `${BASE}/attendance/leave-of-absence/my/${encodeURIComponent(leaveOfAbsenceId)}`,
      );
    },

    /** 내 휴직 이력 전체 */
    async listMy(): Promise<LeaveOfAbsence[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/leave-of-absence/my`);
      const unwrapped = unwrapApiResponse<LeaveOfAbsence[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    /** 상태별 목록, REQUESTED/ACTIVE/ENDED/REJECTED/CANCELLED (관리자) */
    async listByStatus(status: LeaveOfAbsenceApprovalStatusCode): Promise<LeaveOfAbsence[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/leave-of-absence/admin`, {
        params: { status },
      });
      const unwrapped = unwrapApiResponse<LeaveOfAbsence[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    /** 조기 복직 처리, actualEndDate 지정 (관리자) */
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

  /** /attendance/leave-requests — 휴가 신청 (결재 연계 pre-action 전용) */
  leaveRequest: {
    // 결재 올리기 전 LeaveRequest 먼저 생성, 잔여·날짜·한도 사전 검증
    async submit(payload: LeaveRequestSubmitPayload): Promise<LeaveRequest> {
      const { data } = await httpClient.post(`${BASE}/attendance/leave-requests/my`, payload);
      const unwrapped = unwrapApiResponse<LeaveRequest | null>(data);
      if (!unwrapped) throw new Error('휴가 신청 생성에 실패했습니다.');
      return unwrapped;
    },

    // 내 휴가 신청 이력 페이지 조회 휴가 계획 관리 화면 신청내용 표 데이터 소스
    async listMyHistory(params?: {
      page?: number;
      size?: number;
    }): Promise<SpringPage<LeaveRequest>> {
      const { data } = await httpClient.get(`${BASE}/attendance/leave-requests/my`, {
        params: { page: params?.page ?? 0, size: params?.size ?? 20 },
      });
      return unwrapApiResponse<SpringPage<LeaveRequest>>(data);
    },

    // 결재 생성 후 approvalRequestId 역링크
    async linkApproval(leaveRequestId: string, approvalRequestId: string): Promise<void> {
      await httpClient.patch(
        `${BASE}/attendance/leave-requests/my/${encodeURIComponent(leaveRequestId)}/approval-link`,
        { approvalRequestId },
      );
    },

    // 결재 생성 실패 시 best-effort 롤백
    async cancel(leaveRequestId: string): Promise<void> {
      await httpClient.delete(
        `${BASE}/attendance/leave-requests/my/${encodeURIComponent(leaveRequestId)}`,
      );
    },
  },

  /** /attendance/overtime-usage - 직원 월별 OT 누적 vs 회사 월 한도 현황 */
  overtimeUsage: {
    // 관리자 전체 현황 (사용률 내림차순)
    async getStatus(baseDate?: string): Promise<OvertimeUsage[]> {
      const { data } = await httpClient.get(`${BASE}/attendance/overtime-usage/status`, {
        params: baseDate ? { baseDate } : undefined,
      });
      const unwrapped = unwrapApiResponse<OvertimeUsage[] | null>(data);
      return Array.isArray(unwrapped) ? unwrapped : [];
    },

    // 내 OT 사용 현황
    async getMy(baseDate?: string): Promise<OvertimeUsage | null> {
      try {
        const { data } = await httpClient.get(`${BASE}/attendance/overtime-usage/my`, {
          params: baseDate ? { baseDate } : undefined,
        });
        return unwrapApiResponse<OvertimeUsage | null>(data);
      } catch (e) {
        // 백엔드에 해당 API가 아직 배포되지 않은 환경(404)은 미적용(null)로 안전 처리
        if (isApiError(e) && e.status === 404) return null;
        throw e;
      }
    },
  },
};
