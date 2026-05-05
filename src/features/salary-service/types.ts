/**
 * salary-service DTO랑 맞춘 타입. 필드 더 생기면 여기만 확장.
 */

export type AttendanceStatusCode = 'NORMAL' | 'ABSENT' | 'LEAVE' | 'HALF' | string;
export type OvertimeRequestTypeCode = 'PRE' | 'POST' | string;
export type OvertimeApprovalStatusCode =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | string;
export type AllowanceApprovalStatusCode =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'AUTO'
  | string;

export type EventTypeCode = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END' | string;

/** Spring Data `Page` JSON (Jackson 기본 직렬화) */
export type SpringPage<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
};

export type ClosureStatusCode =
  | 'OPEN'
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'FINALIZED'
  | 'LOCKED';

/**
 * 일별 근태의 정정 진행 상태
 *  NORMAL     정상 — 액션 불필요
 *  ABNORMAL   이상 — 누락, 정정 신청 가능
 *  PENDING    검토중 — 신청 후 관리자 결정 대기
 *  COMPLETED  정정 완료
 */
export type CorrectionStateCode = 'NORMAL' | 'ABNORMAL' | 'PENDING' | 'COMPLETED';

export type DailyAttendance = {
  dailyAttendanceId?: string;
  memberId?: string;
  attendanceDate?: string;
  status?: AttendanceStatusCode;
  closureStatus?: ClosureStatusCode;
  correctionState?: CorrectionStateCode;
  workScheduleId?: string;
  firstClockIn?: string | null;
  lastClockOut?: string | null;
  workedMinutes?: number | null;
  overtimeMinutes?: number | null;
  /** 출장/외근 - WorkTripDetail.workTripType (BUSINESS_TRIP / OUTSIDE_WORK), 없으면 null */
  workTripType?: 'BUSINESS_TRIP' | 'OUTSIDE_WORK' | null;
};

/** 출퇴근 정정 신청 페이로드 */
export type AttendanceCorrectionReqPayload = {
  attendanceDate: string; // YYYY-MM-DD
  requestedClockIn?: string | null; // ISO LocalDateTime
  requestedClockOut?: string | null; // ISO LocalDateTime
  reason: string;
};

/** 정정 검토 큐 행 (관리자 화면) */
export type AttendanceCorrectionPending = {
  dailyAttendanceId: string;
  memberId: string;
  attendanceDate: string;
  requestedClockIn?: string | null;
  requestedClockOut?: string | null;
  reason?: string | null;
  requestedAt?: string | null;
};

/** 누락 후보 일자 (휴가·휴직 복귀 안전망) */
export type MissingAttendanceSuspect = {
  date: string; // YYYY-MM-DD
  reasonCode: 'NO_RECORD' | 'CLOCK_IN_MISSING' | 'CLOCK_OUT_MISSING';
  reasonLabel?: string;
};

export type AttendanceLog = {
  attendanceLogId?: string;
  eventType?: EventTypeCode;
  eventTime?: string;
  deviceId?: string | null;
  isCorrectedYn?: string | null;
};

export type AttendanceLogCreatePayload = {
  eventTime?: string | null;
  deviceId?: string | null;
};

export type OvertimeRequest = {
  overtimeRequestId?: string;
  memberId?: string;
  targetDate?: string;
  requestType?: OvertimeRequestTypeCode;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  requestedMinutes?: number | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  actualMinutes?: number | null;
  reason?: string | null;
  approvalStatus?: OvertimeApprovalStatusCode;
  approvalRequestId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type OvertimeRequestCreatePayload = {
  targetDate: string;
  requestType: OvertimeRequestTypeCode;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  requestedMinutes?: number | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  actualMinutes?: number | null;
  reason?: string | null;
};

export type ApprovalModeCode = 'PRE_ONLY' | 'POST_ONLY' | 'HYBRID' | string;

export type OvertimePolicy = {
  overtimePolicyId?: string;
  companyId?: string;
  /** 연장근로 인정 단위(분), 15 또는 30. 백엔드 컬럼명은 overtime_floor_minutes (FLOOR 기반 내림) */
  overtimeFloorMinutes?: number | null;
  approvalMode?: ApprovalModeCode | null;
  postApprovalDeadlineHours?: number | null;
  weeklyOvertimeLimitMinutes?: number | null;
  weeklyTotalLimitMinutes?: number | null;
  dailyOvertimeLimitMinutes?: number | null;
  monthlyOvertimeLimitMinutes?: number | null;
  holidayWorkRequiresApproval?: boolean | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

export type OvertimePolicyCreatePayload = {
  overtimeFloorMinutes: number;
  approvalMode: ApprovalModeCode;
  postApprovalDeadlineHours?: number | null;
  weeklyOvertimeLimitMinutes?: number | null;
  weeklyTotalLimitMinutes?: number | null;
  dailyOvertimeLimitMinutes?: number | null;
  monthlyOvertimeLimitMinutes?: number | null;
  holidayWorkRequiresApproval?: boolean | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type OvertimePolicyUpdatePayload = Omit<OvertimePolicyCreatePayload, 'effectiveFrom'> & {
  effectiveFrom?: string;
};

export type FlexibleTimeSlot = {
  slotId?: string;
  workScheduleId?: string;
  slotCode?: string;
  slotLabel?: string;
  startTime?: string;
  endTime?: string;
  workMinutes?: number | null;
  /** 슬롯에 박힌 점심·휴게 시작 시각 (HH:mm:ss). 직원이 슬롯을 고르면 이 점심시간이 함께 적용된다. */
  breakStart?: string | null;
  /** 슬롯에 박힌 점심·휴게 종료 시각 (HH:mm:ss). */
  breakEnd?: string | null;
  isDefault?: boolean | null;
  delYn?: string | null;
};

export type FlexibleTimeSlotCreatePayload = {
  workScheduleId: string;
  slotCode?: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  workMinutes: number;
  /** 슬롯 점심 시작 시각 (HH:mm:ss). 디폴트 12:00. */
  breakStart?: string | null;
  /** 슬롯 점심 종료 시각 (HH:mm:ss). 디폴트 13:00. */
  breakEnd?: string | null;
  isDefault?: boolean;
};

export type FlexibleTimeSlotUpdatePayload = Partial<Omit<FlexibleTimeSlotCreatePayload, 'workScheduleId'>>;

export type ScheduleApprovalStatusCode =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'AUTO'
  | string;

export type MemberScheduleSelection = {
  selectionId?: string;
  memberId?: string;
  targetYearMonth?: string;
  slotId?: string;
  slotLabel?: string | null;
  requestReason?: string | null;
  /** FLEXIBLE 직원이 매월 슬롯 선택 시 함께 정한 점심·휴게 시작 시각 (HH:mm:ss) */
  breakStart?: string | null;
  /** FLEXIBLE 직원이 매월 슬롯 선택 시 함께 정한 점심·휴게 종료 시각 (HH:mm:ss) */
  breakEnd?: string | null;
  /** 서버 산출 점심 분(편의용) */
  breakMinutes?: number | null;
  approvalStatus?: ScheduleApprovalStatusCode;
  approvalRequestId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MemberScheduleSelectionCreatePayload = {
  memberId?: string;
  targetYearMonth: string;
  slotId: string;
  requestReason?: string | null;
  /** FLEXIBLE 직원이 함께 선택한 점심 시작 시각 (HH:mm:ss) */
  breakStart?: string | null;
  /** FLEXIBLE 직원이 함께 선택한 점심 종료 시각 (HH:mm:ss) */
  breakEnd?: string | null;
};

export type MemberAllowance = {
  memberAllowanceId?: string;
  memberId?: string;
  companyId?: string;
  salaryItemTemplateId?: string;
  amount?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  reason?: string | null;
  approvalStatus?: AllowanceApprovalStatusCode;
  approvalRequestId?: string | null;
  requestedBy?: string | null;
  requestedAt?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MemberAllowanceCreatePayload = {
  salaryItemTemplateId: string;
  amount: number;
  effectiveFrom: string;
  reason?: string | null;
};

/** 관리자용 자동부여(Auto-grant) — 신규입사자에게 자격수당을 즉시 적용 */
export type MemberAllowanceAutoGrantPayload = {
  memberId: string;
  salaryItemTemplateId: string;
  amount: number;
  effectiveFrom: string;
};

export type BalanceTypeCode = 'ANNUAL' | 'MONTHLY' | 'CARRYOVER' | string;

export type MemberBalance = {
  memberBalanceId?: string;
  memberId?: string;
  balanceType?: BalanceTypeCode;
  totalGranted?: number | null;
  totalUsed?: number | null;
  remaining?: number | null;
  expirationDate?: string | null;
  isUsableYn?: string | null;
  isExpireYn?: string | null;
  /** 이월 동의 여부 - 회사 정책 isCarryoverConsentYn='Y' 일 때만 의미 */
  carryoverConsentYn?: string | null;
  /** 이월 동의 회신 시각 */
  carryoverConsentAt?: string | null;
};

export type MemberBalanceGrantPayload = {
  memberId: string;
  balanceType: BalanceTypeCode;
  totalGranted: number;
  expirationDate?: string | null;
};

export type AccrualBaseCode = 'FISCAL' | 'HIRE_DATE' | string;

export type PayrollStatusCode = 'DRAFT' | 'CONFIRMED' | 'PAID' | string;

// 급여 구분 정기급여 / 성과급 / 특별상여 / 소급분
export type PayrollTypeCode =
  | 'REGULAR_MONTHLY'
  | 'PERFORMANCE_BONUS'
  | 'SPECIAL_BONUS'
  | 'RETROACTIVE'
  | 'RETIREMENT_SETTLEMENT'
  | string;

export type Payroll = {
  payrollId?: string;
  salaryId?: string;
  memberId?: string;
  payrollYearMonthDay?: string;
  /** 정산 대상 월 (YYYY-MM) - 어느 월분 급여인지 */
  targetYearMonth?: string | null;
  paidAt?: string | null;
  totalPayment?: number | null;
  totalDeduction?: number | null;
  netPay?: number | null;
  payrollStatus?: PayrollStatusCode;
  payrollType?: PayrollTypeCode;
  createdAt?: string | null;
  updatedAt?: string | null;
};

// 회사 월 단위 급여대장 목록 행 직원 정보 결합
export type PayrollAdminListItem = {
  payrollId: string;
  memberId: string;
  sabun?: string | null;
  name?: string | null;
  organizationName?: string | null;
  payrollYearMonthDay: string;
  /** 정산 대상 월 (YYYY-MM) */
  targetYearMonth?: string | null;
  paidAt?: string | null;
  payrollStatus: PayrollStatusCode;
  payrollType?: PayrollTypeCode;
  totalPayment: number;
  totalDeduction: number;
  netPay: number;
  createdAt?: string | null;
};

// 일괄 확정 / 일괄 지급 처리 결과
export type BulkPayrollActionResult = {
  success: number;
  fail: number;
  failures: string[];
};

// 직원 본인 연봉 조회 응답 연도 합계 + 월별 + 항목별 누적
export type AnnualSalaryMonthlyRow = {
  month: number;
  payrollId?: string | null;
  payrollYearMonthDay?: string | null;
  /** 정산 대상 월 (YYYY-MM) - 어느 월분 급여 */
  targetYearMonth?: string | null;
  payrollStatus?: PayrollStatusCode | null;
  totalPayment: number;
  totalDeduction: number;
  netPay: number;
};

export type AnnualSalaryItemBreakdown = {
  itemName: string;
  totalAmount: number;
};

export type AnnualSalarySummary = {
  year: number;
  monthly: AnnualSalaryMonthlyRow[];
  earnings: AnnualSalaryItemBreakdown[];
  deductions: AnnualSalaryItemBreakdown[];
  totalPayment: number;
  totalDeduction: number;
  netPay: number;
  monthlyAverage: number;
  payrollCount: number;
};

// 4대보험 + 원천세 월별 집계 단일 응답
// 직원 부담은 정확값 회사 부담 산재는 추정값 (참고용)
export type TaxSummary = {
  yearMonth: string;
  memberCount: number;
  // 직원 부담 (정확)
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  // 회사 부담 추정 (참고용)
  nationalPensionEmployer: number;
  healthInsuranceEmployer: number;
  longTermCareEmployer: number;
  employmentInsuranceEmployer: number;
  industrialAccidentEmployer: number;
  // 원천세 (정확)
  incomeTax: number;
  localIncomeTax: number;
  // 합계
  fourInsuranceTotal: number;
  fourInsuranceEmployerTotal: number;
  withholdingTotal: number;
};

export type ItemTypeCode = 'EARNING' | 'DEDUCTION' | string;

export type PayrollItem = {
  payrollItemId?: string;
  payrollId?: string;
  itemName?: string;
  itemType?: ItemTypeCode;
  amount?: number | null;
  displayOrder?: number | null;
  /** 과세 여부 Y/N — 비과세 항목 표시용 */
  isTaxableYn?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type PayrollCreatePayload = {
  memberId: string;
  payrollYearMonthDay: string;
  payrollType?: PayrollTypeCode;
};

export type PayrollItemCreatePayload = {
  salaryItemTemplateId: string;
  amount: number;
};

export type PayrollItemUpdatePayload = {
  amount: number;
  displayOrder?: number | null;
};

// 세법 카테고리 비과세 한도 판정 기준 국세청 소득세법 시행령 기반
export type TaxCategoryCode =
  | 'TAXABLE'
  | 'MEAL'
  | 'VEHICLE_SELF'
  | 'CHILDCARE'
  | 'TUITION'
  | 'RESEARCH'
  | 'HAZARD_REMOTE'
  | 'OVERSEAS_WORK'
  | 'ETC_NON_TAXABLE'
  | string;

export type SalaryItemTemplate = {
  salaryItemTemplateId?: string;
  companyId?: string;
  itemName?: string;
  itemType?: ItemTypeCode;
  displayOrder?: number | null;
  isTaxableYn?: string | null;
  /** 통상임금 포함 여부 Y면 시급 환산 기준에 합산 (가산수당 base) */
  isOrdinaryWageYn?: string | null;
  /** 세법 카테고리 카탈로그 기반 자동 복사 또는 관리자 선택 */
  taxCategory?: TaxCategoryCode | null;
  /** 월 비과세 한도 카테고리에 따라 결정 한도 없음이면 null 일반 과세는 0 */
  monthlyNonTaxableLimit?: number | null;
  /** 회사 기본 지급 금액 (수당 산식 v1) — 부가 수당 부여 시 자동 채워짐.
   *  null 이면 부여 시 admin 이 직접 입력. 향후 v2 에서 식("BASE * 0.05") 으로 확장. */
  defaultAmount?: number | null;
  /** 회사 공통 적용 여부 Y/N.
   *  Y면 모든 직원 PayrollItem 에 defaultAmount 가 자동 합산됨 (식대 등).
   *  N면 MemberAllowance 가 명시된 직원만 적용 (직책수당, 자녀수당 등). */
  applyToAllYn?: string | null;
  /** 시스템 기본 항목 여부. true 면 삭제 불가, 일부 필드 수정 제한 */
  isSystemDefault?: boolean | null;
  delYn?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type LeavePolicy = {
  policyId?: string;
  companyId?: string;
  isPromotionYn?: string | null;
  promotion1stBeforeDays?: number | null;
  promotion2ndBeforeDays?: number | null;
  isCarryoverYn?: string | null;
  carryoverDays?: number | null;
  /** 이월 동의서 사용 여부 - 'Y' 면 직원별 동의 받아야 이월 처리 진행 */
  isCarryoverConsentYn?: string | null;
  isPayoutYn?: string | null;
  defaultAnnualDays?: number | null;
  /** 매 N년마다 추가 부여 단위 근로기준법 디폴트 1 */
  extraDaysPerInterval?: number | null;
  /** 추가 부여 주기 년 단위 근로기준법 디폴트 2 */
  extraIntervalYears?: number | null;
  /** 연차 상한 근로기준법 25 */
  maxAnnualDays?: number | null;
  accrualBase?: AccrualBaseCode | null;
};

// 촉진 통보 단계
export type PromotionStageCode = 'FIRST' | 'SECOND' | string;

// 통보 이력 상태
// SENT 발송완료 응답대기 ACKNOWLEDGED 직원 회신완료 DESIGNATED 회사 강제지정완료
export type PromotionLogStatusCode = 'SENT' | 'ACKNOWLEDGED' | 'DESIGNATED' | string;

// LeaveRequest 신청 주체 SELF 직원본인 ADMIN_DESIGNATION 회사강제지정
export type LeaveInitiatorCode = 'SELF' | 'ADMIN_DESIGNATION' | string;

// 직원 본인이 받은 촉진 통보 단건
export type LeavePromotionMy = {
  promotionLogId: string;
  stage: PromotionStageCode;
  status: PromotionLogStatusCode;
  sentOn: string;
  acknowledgedAt?: string | null;
  // 직원이 처음 통보를 열람한 시각 - markViewed 호출 시 기록 (멱등)
  viewedAt?: string | null;
  balanceExpirationDate?: string | null;
  remainingDays?: number | null;
  // 직원이 회신한 사용 계획 날짜 ACKNOWLEDGED 일 때만 채워짐
  plannedDates?: string[] | null;
  // 회사가 강제 지정한 연차일 DESIGNATED 일 때만 채워짐
  designatedDates?: string[] | null;
  // 강제 지정 사유
  designationReason?: string | null;
};

// 관리자 미응답자 단건
export type LeavePromotionNoResponse = {
  promotionLogId: string;
  memberId: string;
  stage: PromotionStageCode;
  sentOn: string;
  balanceExpirationDate?: string | null;
  remainingDays?: number | null;
  daysSinceSent: number;
};

/** 관리자 — 회신 완료 + 강제 지정 이력 */
export type LeavePromotionHistory = {
  promotionLogId: string;
  memberId: string;
  stage: PromotionStageCode;
  status: PromotionLogStatusCode;     // ACKNOWLEDGED / DESIGNATED
  sentOn: string;
  balanceExpirationDate?: string | null;
  remainingDays?: number | null;
  acknowledgedAt?: string | null;
  plannedDates?: string[];
  designatedDates?: string[];
  designationReason?: string | null;
};

// 직원 회신 페이로드 사용계획 날짜는 참고용 잔여 차감 없음
export type LeavePromotionRespondPayload = {
  plannedDates: string[];
};

// 관리자 강제 지정 페이로드 노무수령 거부 절차
export type LeavePromotionDesignatePayload = {
  dates: string[];
  reason: string;
};

export type LeavePolicyCreatePayload = {
  isPromotionYn?: string | null;
  promotion1stBeforeDays?: number | null;
  promotion2ndBeforeDays?: number | null;
  isCarryoverYn?: string | null;
  carryoverDays?: number | null;
  isCarryoverConsentYn?: string | null;
  isPayoutYn?: string | null;
  defaultAnnualDays?: number | null;
  extraDaysPerInterval?: number | null;
  extraIntervalYears?: number | null;
  maxAnnualDays?: number | null;
  accrualBase: AccrualBaseCode;
};

export type LeavePolicyUpdatePayload = Partial<LeavePolicyCreatePayload>;

/** 회사 휴일 (CompanyHoliday) */
export type CompanyHoliday = {
  companyHolidayId?: string;
  companyId?: string;
  holidayDate?: string;
  holidayName?: string;
  isPaidYn?: string | null;
};

export type CompanyHolidayCreatePayload = {
  holidayDate: string;
  holidayName: string;
  isPaidYn?: string | null;
};

export type CompanyHolidayUpdatePayload = Partial<CompanyHolidayCreatePayload>;

/** 근무 스케줄 (WorkSchedule) */
export type WorkTypeCode = 'FIXED' | 'FLEXIBLE' | string;

export type WorkSchedule = {
  workScheduleId?: string;
  companyId?: string;
  memberId?: string | null;
  scheduleName?: string;
  workType?: WorkTypeCode;
  startTime?: string;
  endTime?: string;
  workMinutes?: number | null;
  /** 회사 정책 점심·휴게 시작 시각 (HH:mm:ss). FIXED 만 의미 있음. */
  breakStart?: string | null;
  /** 회사 정책 점심·휴게 종료 시각 (HH:mm:ss). FIXED 만 의미 있음. */
  breakEnd?: string | null;
  /** breakStart/breakEnd 로부터 계산된 점심 분(서버 산출, 표시·계산용). */
  breakMinutes?: number | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
};

/** WorkSchedule 생성/수정 페이로드.
 *  - workType=FIXED: startTime/endTime/workMinutes 필수
 *  - workType=FLEXIBLE: 위 세 필드는 null 전송 (실제 시간대는 FlexibleTimeSlot 에서 정의) */
export type WorkScheduleCreatePayload = {
  memberId?: string | null;
  scheduleName: string;
  workType: WorkTypeCode;
  startTime: string | null;
  endTime: string | null;
  workMinutes: number | null;
  /** FIXED 만 사용. FLEXIBLE 은 null/생략. 디폴트 12:00. */
  breakStart?: string | null;
  /** FIXED 만 사용. FLEXIBLE 은 null/생략. 디폴트 13:00. */
  breakEnd?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type WorkScheduleUpdatePayload = Partial<Omit<WorkScheduleCreatePayload, 'memberId'>>;

/** 출장/외근 (WorkTrip) */
export type WorkTripTypeCode = 'BUSINESS_TRIP' | 'OUTSIDE_WORK' | string;
export type ExpenseTypeCode = 'TRANSPORT' | 'ACCOMMODATION' | 'MEAL' | 'ETC' | string;
export type ExpenseStatusCode = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

export type WorkTrip = {
  workTripDetailId?: string;
  memberId?: string;
  workTripType?: WorkTripTypeCode;
  destination?: string | null;
  purpose?: string | null;
  expenseAmount?: number | null;
  expenseType?: ExpenseTypeCode | null;
  expenseStatus?: ExpenseStatusCode | null;
  attendanceDate?: string | null;
};

export type WorkTripCreatePayload = {
  date: string;
  workTripType: WorkTripTypeCode;
  destination?: string | null;
  purpose?: string | null;
  expenseAmount?: number | null;
  expenseType?: ExpenseTypeCode | null;
};

export type WorkTripUpdatePayload = {
  workTripType?: WorkTripTypeCode;
  destination?: string | null;
  purpose?: string | null;
  expenseAmount?: number | null;
  expenseType?: ExpenseTypeCode | null;
};

/* ──────────────────────────────────────────────
 * 급여(Salary) 관리 — 관리자 설정 영역
 * ────────────────────────────────────────────── */

/** 소득세 감면 유형 (조세특례제한법 등). NONE = 감면 없음. */
export type TaxReductionTypeCode =
  | 'NONE'
  | 'YOUTH_SME'
  | 'DISABLED'
  | 'FOREIGNER'
  | 'ETC'
  | string;

/** 기본급 (Salary) */
export type Salary = {
  salaryId?: string;
  memberId?: string;
  companyId?: string;
  salaryPolicyId?: string;
  baseSalary?: number | null;
  /** 호봉 (호봉제 정책일 때만 사용) */
  step?: number | null;
  jobGradeName?: string | null;
  jobTitleName?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  /** 부양가족수 (간이세액표 룩업용, 0~11, 기본 1=본인만) */
  dependentCount?: number | null;
  /** 8세 이상 20세 이하 자녀 수 (자녀세액공제 차원). 기본 0. */
  childUnder20Count?: number | null;
  /** 소득세 감면 유형. 미지정 시 NONE. */
  taxReductionType?: TaxReductionTypeCode | null;
  /** 감면율 0.00 ~ 1.00 (예: 청년 SME 90% 감면 → 0.90) */
  taxReductionRate?: number | string | null;
  /** 감면 종료일. 청년 SME 5년 한정 등. */
  taxReductionEffectiveTo?: string | null;
  /** 회사 단위 목록 조회 시 member-service 결합 결과 */
  sabun?: string | null;
  name?: string | null;
  organizationName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SalaryCreatePayload = {
  memberId: string;
  salaryPolicyId: string;
  /** 호봉제면 생략, 연봉제면 필수 */
  baseSalary?: number | null;
  /** 호봉제일 때만 지정, 서버가 호봉표에서 baseSalary 조회 */
  step?: number | null;
  jobGradeName?: string | null;
  jobTitleName?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  /** 부양가족수 0~11, 미입력 시 서버가 1로 기본 처리 */
  dependentCount?: number | null;
  /** 8세 이상 20세 이하 자녀 수, 미입력 시 0 */
  childUnder20Count?: number | null;
  /** 소득세 감면 유형, 미입력 시 NONE */
  taxReductionType?: TaxReductionTypeCode | null;
  /** 감면율 0.00 ~ 1.00 */
  taxReductionRate?: number | string | null;
  taxReductionEffectiveTo?: string | null;
};

export type SalaryUpdatePayload = Omit<SalaryCreatePayload, 'memberId'>;

/** 급여대장 생성 사전 검증 응답 */
export type PayrollPrecheckRes = {
  totalActiveMembers: number;
  missingSalaryCount: number;
  missingSalary: PayrollPrecheckMemberRef[];
  missingBankAccountCount: number;
  missingBankAccount: PayrollPrecheckMemberRef[];
};
export type PayrollPrecheckMemberRef = {
  memberId: string;
  name?: string | null;
  sabun?: string | null;
  organizationName?: string | null;
};

/** 급여 정책 (SalaryPolicy) */
export type WageSystemTypeCode = 'COMPREHENSIVE' | 'NON_COMPREHENSIVE' | string;
export type PeriodStartTypeCode = 'FIRST' | 'SPECIFIC' | string;
export type PeriodEndTypeCode = 'LAST' | 'SPECIFIC' | string;
/** 지급일이 주말/공휴일일 때 조정 규칙. BEFORE=직전 영업일(실무 표준), AFTER=직후 영업일, NONE=해당일 그대로 */
export type PayDayShiftRuleCode = 'NONE' | 'BEFORE' | 'AFTER' | string;

/** 일할계산 방식. DAYS_IN_MONTH 해당월 일수 / FIXED_30 30일 고정 (통상임금 표준) / WORKING_DAYS 월 소정근로일 */
export type ProrationMethodCode = 'DAYS_IN_MONTH' | 'FIXED_30' | 'WORKING_DAYS' | string;

/**
 * 급여 지급 주기.
 * - CURRENT_MONTH: 해당 월에 그 월분 지급 (예 5/25 에 5월분, 보통 payDay 20-말일)
 * - PREVIOUS_MONTH: 다음 달에 전월분 지급 (예 6/10 에 5월분, 보통 payDay 1-15)
 * 평균임금 / 일할 / 보너스 환산의 정산 대상 월(targetYearMonth) 산출 기준.
 */
export type PayCycleTypeCode = 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | string;

/** SalaryPolicy 는 절사 단위를 갖지 않음. 절사 단위는 OvertimePolicy.overtimeFloorMinutes 가 단일 진실. */
export type SalaryPolicy = {
  salaryPolicyId?: string;
  companyId?: string;
  policyName?: string;
  payDay?: number | null;
  /** 호봉제 사용 여부, Y/N */
  usePayGradeYn?: string | null;
  wageSystemType?: WageSystemTypeCode;
  fixedOvertimeMinutes?: number | null;
  periodStartType?: PeriodStartTypeCode;
  periodEndType?: PeriodEndTypeCode;
  /** 지급일 주말/공휴일 조정 규칙 (기본 BEFORE) */
  payDayShiftRule?: PayDayShiftRuleCode | null;
  /** 월 소정근로시간 시급 환산 기준 한국 표준 209 */
  monthlyOrdinaryHours?: number | null;
  /** 일할계산 방식 입사 / 퇴사 / 기간변경 월 적용 */
  prorationMethod?: ProrationMethodCode | null;
  /** 급여 지급 주기 (당월분/전월분) */
  payCycleType?: PayCycleTypeCode | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SalaryPolicyCreatePayload = {
  policyName: string;
  payDay: number;
  /** 호봉제 사용 여부, Y/N. 기본 N */
  usePayGradeYn: string;
  wageSystemType: WageSystemTypeCode;
  fixedOvertimeMinutes?: number | null;
  periodStartType: PeriodStartTypeCode;
  periodEndType: PeriodEndTypeCode;
  /** 지급일 주말/공휴일 조정 규칙, 기본 BEFORE */
  payDayShiftRule: PayDayShiftRuleCode;
  /** 월 소정근로시간 한국 표준 209 회사별 다름 */
  monthlyOrdinaryHours?: number | null;
  /** 일할계산 방식 입사 / 퇴사 / 기간변경 월 적용 */
  prorationMethod?: ProrationMethodCode | null;
  /** 급여 지급 주기 (당월분/전월분), 기본 CURRENT_MONTH */
  payCycleType?: PayCycleTypeCode | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type SalaryPolicyUpdatePayload = SalaryPolicyCreatePayload;

/** 퇴직급여 제도 유형 */
export type RetirementTypeCode = 'LEGAL' | 'DB' | 'DC' | string;

/** 퇴직급여 정책 (RetirementPolicy) */
export type RetirementPolicy = {
  retirementPolicyId?: string;
  companyId?: string;
  retirementType?: RetirementTypeCode;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  memo?: string | null;
  /** 오늘 기준 활성 여부 (서버 계산) */
  active?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RetirementPolicyCreatePayload = {
  retirementType: RetirementTypeCode;
  effectiveFrom: string;
  effectiveTo?: string | null;
  memo?: string | null;
};

/** 시작일은 변경 불가 — 종료일·제도·메모만 수정 */
export type RetirementPolicyUpdatePayload = {
  retirementType: RetirementTypeCode;
  effectiveTo?: string | null;
  memo?: string | null;
};

/** 퇴직금 시뮬 요청 (직원 본인용 — memberId 는 헤더에서 자동) */
export type RetirementSimReq = {
  /** 입사일 옵션 — 미지정 시 백엔드가 member-service 에서 자동 조회 */
  joinDate?: string;  // YYYY-MM-DD
  resignDate: string; // YYYY-MM-DD
};

/** 퇴직금 시뮬 응답
 *  평균임금 정확 산정 breakdown 포함 (근로기준법 제2조 1항 6호 + 시행령 제2조)
 */
export type RetirementSimRes = {
  retirementType: RetirementTypeCode;
  modeDescription: string;
  memberId: string;
  memberName: string;
  joinDate: string;       // 정산 시작일
  resignDate: string;     // 예상 퇴직일
  serviceDays: number;    // 재직일수
  avgMonthlyWage: number; // 평균 월급 (호환성)

  // 평균임금 breakdown
  basePeriodPayment?: number;        // 직전 3개월 정기급여 임금총액
  basePeriodDays?: number;            // 3개월 일수 (89~92)
  simpleDailyAverage?: number;        // 단순 일평균 (가산 전)
  // 시행령 제2조 평균임금 산정 제외 기간 (출산/육아/산재/병역 등)
  excludedLeaveDays?: number;         // 3개월 기간 내 휴직 일수 합계
  excludedLeaveCount?: number;        // 제외된 휴직 건수
  adjustedPeriodDays?: number;        // 조정된 분모 (basePeriodDays - excludedLeaveDays)
  bonusAddition12mAvg?: number;       // 12개월 상여 환산 (3/12)
  unusedLeaveAddition12mAvg?: number; // 12개월 연차수당 환산 (3/12)
  averageDailyWage?: number;          // 평균임금 일액 (가산 후)
  ordinaryDailyWage?: number;         // 통상시급 일액 (× 8h)
  appliedDailyWage?: number;          // 적용 일평균 max(평균, 통상)
  appliedBasis?: 'AVERAGE' | 'ORDINARY' | string;

  estimatedAmount: number;// 예상 퇴직금
  eligible: boolean;      // 1년 이상 자격
  disclaimer: string;
};

/** 세율 (TaxRate) */
export type TaxTypeCode =
  | 'NATIONAL_PENSION'
  | 'HEALTH_INSURANCE'
  | 'LONG_TERM_CARE'
  | 'EMPLOYMENT_INSURANCE'
  | 'ACCIDENT_INSURANCE'
  | 'INCOME_TAX'
  | 'LOCAL_INCOME_TAX'
  | string;

export type TaxRate = {
  taxRateId?: string;
  taxType?: TaxTypeCode;
  rate?: number | null;
  applyYear?: number | null;
  employerRate?: number | null;
  /** 기준소득 상한 (월, 원). 국민연금/건강보험만 적용 */
  incomeCeiling?: number | null;
  /** 기준소득 하한 (월, 원). 국민연금/건강보험만 적용 */
  incomeFloor?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TaxRateCreatePayload = {
  taxType: TaxTypeCode;
  rate: number;
  applyYear: number;
  employerRate?: number | null;
  incomeCeiling?: number | null;
  incomeFloor?: number | null;
};

export type TaxRateUpdatePayload = TaxRateCreatePayload;

/** 상/하한 적용 가능한 세금 유형 */
export const TAX_CAP_SUPPORTED_TYPES: ReadonlySet<TaxTypeCode> = new Set([
  'NATIONAL_PENSION',
  'HEALTH_INSURANCE',
]);

/* ──────────────────────────────────────────────
 * 미사용 연차수당 (UnusedLeavePayout)
 * ────────────────────────────────────────────── */

/** `GET /salary/unused-leave/preview` 응답 항목
 *  - 백엔드 DTO: UnusedLeavePayoutPreviewResDto
 */
export type UnusedLeavePayoutPreview = {
  memberId?: string;
  /** 전년 12월 기본급 */
  baseSalary?: number | null;
  /** 1일 통상임금 */
  dailyWage?: number | null;
  /** 미이월 잔여일수 */
  unusedDays?: number | null;
  /** 자동 계산된 수당 금액 */
  calculatedAmount?: number | null;
  /** 반영될 Payroll ID (null 이면 Payroll 없음) */
  targetPayrollId?: string | null;
  /** 전년 12월 급여 존재 여부 */
  hasSalary?: boolean;
  /** 이미 반영되었는지 여부 */
  alreadyApplied?: boolean;
  /** 경고 메시지 (UI 에 노란 배지) */
  warning?: string | null;
};

/** `POST /salary/unused-leave/apply` 요청의 각 대상
 *  - 담당자가 preview 에서 금액 조정 후 확정
 */
export type UnusedLeavePayoutApplyItem = {
  payrollId: string;
  memberId: string;
  amount: number;
};

export type UnusedLeavePayoutApplyPayload = {
  items: UnusedLeavePayoutApplyItem[];
};

/* ──────────────────────────────────────────────
 * 급여대장 재계산 (PayrollRecalculate)
 * ────────────────────────────────────────────── */

export type PayrollRecalculatePayload = {
  /** 정산 연월일 (YYYY-MM-DD). 미지정 시 정책 기준 자동 산정 */
  settlementDate?: string | null;
};

/** 소급분 자동 재계산 요청 (preview / apply 동일 페이로드) */
export type RetroactivePayrollPayload = {
  memberId: string;
  /** YYYY-MM 형식 */
  fromMonth: string;
  /** YYYY-MM 형식 */
  toMonth: string;
  /** 새 통상임금 (인상 후) */
  newOrdinaryWage: number;
  memo?: string | null;
};

/** 소급분 월별 차액 항목 */
export type RetroactiveMonthlyDiff = {
  month: string;            // YYYY-MM
  oldAllowance: number;
  newAllowance: number;
  diff: number;
  sourcePayrollId?: string | null;
};

/** 소급분 미리보기 / 발행 응답 */
export type RetroactivePayrollResult = {
  memberId: string;
  fromMonth: string;
  toMonth: string;
  previousOrdinaryWage: number;
  newOrdinaryWage: number;
  monthlyDiffs: RetroactiveMonthlyDiff[];
  totalDiff: number;
  /** apply 시점에만 채워짐 */
  newPayrollId?: string | null;
  issuedDate?: string | null;
  message?: string | null;
};

export type PayrollRecalculateResult = {
  /** 신규 생성된 급여대장 수 */
  created: number;
  /** 이미 존재해 스킵된 수 */
  duplicateSkip: number;
  /** 활성 Salary 없어서 스킵된 수 */
  noSalary: number;
  /** 비즈니스 예외 수 */
  badRequest: number;
  /** 시스템 예외 수 */
  fail: number;
};

/** 급여 항목 템플릿 — Create/Update (기존 SalaryItemTemplate은 이미 정의) */
export type SalaryItemTemplateCreatePayload = {
  itemName: string;
  itemType: ItemTypeCode;
  displayOrder: number;
  isTaxableYn: string;
  /** 통상임금 포함 여부 Y/N null 이면 N 처리 */
  isOrdinaryWageYn?: string | null;
  /** 회사 기본 지급 금액 (수당 산식 v1) */
  defaultAmount?: number | null;
  /** 회사 공통 적용 여부 Y/N. Y면 모든 직원에게 defaultAmount 자동 합산 */
  applyToAllYn?: string | null;
};

export type SalaryItemTemplateUpdatePayload = SalaryItemTemplateCreatePayload;

/** 회사 휴가 종류 (CompanyLeaveType) */
export type CompanyLeaveType = {
  companyLeaveTypeId?: string;
  code?: string;
  name?: string;
  balanceType?: BalanceTypeCode | null;
  daysPerUse?: number | null;
  isSystemDefault?: boolean | null;
  isPaidYn?: string | null;
  maxDaysPerYear?: number | null;
  requireEvidenceYn?: string | null;
  displayOrder?: number | null;
};

export type CompanyLeaveTypeCreatePayload = {
  code?: string;
  name: string;
  balanceType?: BalanceTypeCode | null;
  daysPerUse: number;
  isPaidYn: string;
  maxDaysPerYear?: number | null;
  requireEvidenceYn: string;
  displayOrder: number;
};

export type CompanyLeaveTypeUpdatePayload = {
  name: string;
  balanceType?: BalanceTypeCode | null;
  daysPerUse?: number | null;
  isPaidYn?: string | null;
  maxDaysPerYear?: number | null;
  requireEvidenceYn?: string | null;
  displayOrder: number;
};

/** 주간 근무시간 요약, 본인 주 52시간 자가 체크 */
export type WorkTimeSummary = {
  weekStart?: string | null;
  weekEnd?: string | null;
  totalWorkedMinutes?: number | null;
  totalLimitMinutes?: number | null;
  totalUsagePercent?: number | null;
  overtimeApprovedMinutes?: number | null;
  overtimeLimitMinutes?: number | null;
  overtimeUsagePercent?: number | null;
  /** 월 누적 OT (현재 월 1일 ~ 기준일까지 합) */
  monthlyOvertimeMinutes?: number | null;
  /** 회사 정책 monthlyOvertimeLimitMinutes - 미설정 시 null */
  monthlyOvertimeLimitMinutes?: number | null;
  monthlyOvertimeUsagePercent?: number | null;
  /** 근기법 55조 주휴수당 자격, 주 15시간 이상 + 개근 */
  weeklyHolidayEligible?: boolean | null;
  weeklyHolidayMinRequiredMinutes?: number | null;
  weeklyAbsentDays?: number | null;
  weeklyHolidayReason?: string | null;
};

/** 휴직 (Member Leave of Absence) */
export type LeaveOfAbsenceTypeCode =
  | 'MATERNITY'
  | 'PATERNAL'
  | 'SICK'
  | 'UNPAID'
  | 'STUDY'
  | 'MILITARY'
  | string;

export type LeaveOfAbsenceApprovalStatusCode =
  | 'REQUESTED'
  | 'ACTIVE'
  | 'ENDED'
  | 'REJECTED'
  | 'CANCELLED'
  | string;

export type LeaveOfAbsenceSubmitPayload = {
  type: LeaveOfAbsenceTypeCode;
  startDate: string;
  endDate: string;
  isPaidYn: string;
  reason?: string | null;
  evidenceFileUrl?: string | null;
};

export type LeaveOfAbsence = {
  leaveOfAbsenceId?: string;
  memberId?: string;
  companyId?: string;
  type?: LeaveOfAbsenceTypeCode;
  startDate?: string | null;
  endDate?: string | null;
  actualEndDate?: string | null;
  isPaidYn?: string | null;
  reason?: string | null;
  evidenceFileUrl?: string | null;
  approvalRequestId?: string | null;
  status?: LeaveOfAbsenceApprovalStatusCode;
  requestedAt?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;
};

/** 휴가 신청 (LeaveRequest) */
export type LeaveApprovalStatusCode =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | string;

export type LeaveRequest = {
  leaveRequestId?: string;
  memberId?: string;
  companyId?: string;
  companyLeaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  usageDays?: number | null;
  /** 비연속 사용 날짜 - 채워지면 그 날짜만 사용, 비면 startDate~endDate 연속 범위 */
  plannedDates?: string[] | null;
  reason?: string | null;
  evidenceFileUrl?: string | null;
  deductedBalanceType?: BalanceTypeCode | null;
  approvalRequestId?: string | null;
  approvalStatus?: LeaveApprovalStatusCode;
  requestedAt?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;
};

export type LeaveRequestSubmitPayload = {
  companyLeaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  evidenceFileUrl?: string | null;
  /** 비연속 사용 날짜 - 채워지면 startDate~endDate 무시하고 이 날짜들만 카운트 */
  plannedDates?: string[];
};

/** 직원 월별 OT 누적 vs 회사 월 한도 현황 (전 직원, wage type 무관) */
export type OvertimeUsage = {
  memberId?: string;
  name?: string | null;
  organizationName?: string | null;
  /** 실측 OT 분 (DailyAttendance.overtimeMinutes 합) */
  actualOvertimeMinutes?: number | null;
  /** 승인 OT 분 (OvertimeRequest APPROVED 합) */
  approvedMinutes?: number | null;
  /** 회사 월 한도 분 (OvertimePolicy.monthlyOvertimeLimitMinutes) */
  fixedLimit?: number | null;
  usagePercent?: number | null;
  exceedMinutes?: number | null;
  /** 기간 총 근무시간 분 (정규 + 초과) */
  totalWorkMinutes?: number | null;
};

/** 호봉표 (PayGradeTable), 호봉 → 기본급 (직급 무관) */
export type PayGradeTable = {
  payGradeTableId?: string;
  step?: number;
  baseSalary?: number;
  effectiveFrom?: string | null;
  /** null 이면 현재 활성 */
  effectiveTo?: string | null;
  description?: string | null;
};

export type PayGradeTableCreatePayload = {
  step: number;
  baseSalary: number;
  effectiveFrom: string;
  description?: string | null;
};

export type PayGradeTableUpdatePayload = {
  baseSalary: number;
  description?: string | null;
};

export type PayGradeTableBulkCreatePayload = {
  effectiveFrom: string;
  entries: Array<{
    step: number;
    baseSalary: number;
    description?: string | null;
  }>;
};

/* ──────────────────────────────────────────────
 * 연봉 협상 (SalaryNegotiation)
 *  단건 + 일괄 등록 (groupId 묶음)
 *  자체 워크플로 DRAFT → SUBMITTED → APPROVED/REJECTED → APPLIED
 *  직원 응답 화면 없음 본인 협상 이력 조회만
 * ────────────────────────────────────────────── */

// 협상 종류 정기/승진/수시/유지
export type NegotiationTypeCode =
  | 'REGULAR'
  | 'PROMOTION'
  | 'AD_HOC'
  | 'RETENTION'
  | string;

// 협상 진행 상태
export type NegotiationStatusCode =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | string;

export type SalaryNegotiation = {
  negotiationId?: string;
  companyId?: string;
  memberId?: string;

  negotiationType?: NegotiationTypeCode;
  groupId?: string | null;
  groupName?: string | null;

  // member-service 결합
  sabun?: string | null;
  memberName?: string | null;
  organizationName?: string | null;

  currentBaseSalary?: number | null;
  currentJobGradeName?: string | null;
  currentJobTitleName?: string | null;

  proposedBaseSalary?: number | null;
  proposedJobGradeName?: string | null;
  proposedJobTitleName?: string | null;
  proposedEffectiveFrom?: string | null;
  changeRate?: number | null;
  reason?: string | null;

  status?: NegotiationStatusCode;
  approvalRequestId?: string | null;

  proposedAt?: string | null;
  decidedAt?: string | null;
  appliedAt?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;

  appliedSalaryId?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SalaryNegotiationCreatePayload = {
  memberId: string;
  negotiationType: NegotiationTypeCode;
  groupId?: string | null;
  groupName?: string | null;
  proposedBaseSalary: number;
  proposedJobGradeName?: string | null;
  proposedJobTitleName?: string | null;
  proposedEffectiveFrom: string;
  reason?: string | null;
};

export type SalaryNegotiationBulkItem = {
  memberId: string;
  proposedBaseSalary: number;
  proposedJobGradeName?: string | null;
  proposedJobTitleName?: string | null;
  reason?: string | null;
};

export type SalaryNegotiationBulkCreatePayload = {
  groupName: string;
  negotiationType: NegotiationTypeCode;
  proposedEffectiveFrom: string;
  items: SalaryNegotiationBulkItem[];
};

export type SalaryNegotiationUpdatePayload = {
  proposedBaseSalary?: number | null;
  proposedJobGradeName?: string | null;
  proposedJobTitleName?: string | null;
  proposedEffectiveFrom?: string | null;
  reason?: string | null;
};

/* ──────────────────────────────────────────────
 * 보너스 정책 (BonusPolicy)
 *  회사 표준 룰만 저장 (정기상여 / 성과급 / 명절상여)
 *  실제 지급은 PayrollType (PERFORMANCE_BONUS / SPECIAL_BONUS) 새 Payroll 행에서 처리
 * ────────────────────────────────────────────── */

// 보너스 지급 대상 범위
export type BonusEligibilityScopeCode = 'ALL' | 'REGULAR_ONLY' | string;

// 명절상여 지급 방식
export type HolidayBonusTypeCode = 'RATE' | 'AMOUNT' | string;

export type BonusPolicy = {
  bonusPolicyId?: string;
  companyId?: string;

  // 정기상여
  useRegularBonusYn?: string | null;
  regularBonusAnnualRate?: number | null;
  regularBonusPaymentCount?: number | null;

  // 성과급
  usePerformanceBonusYn?: string | null;
  performanceBonusMaxRate?: number | null;
  performanceBonusBasis?: string | null;

  // 명절상여
  useHolidayBonusYn?: string | null;
  holidayBonusType?: HolidayBonusTypeCode | null;
  holidayBonusValue?: number | null;

  // 공통
  eligibilityScope?: BonusEligibilityScopeCode;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  memo?: string | null;
  active?: boolean;

  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BonusPolicyCreatePayload = {
  useRegularBonusYn?: string | null;
  regularBonusAnnualRate?: number | null;
  regularBonusPaymentCount?: number | null;
  usePerformanceBonusYn?: string | null;
  performanceBonusMaxRate?: number | null;
  performanceBonusBasis?: string | null;
  useHolidayBonusYn?: string | null;
  holidayBonusType?: HolidayBonusTypeCode | null;
  holidayBonusValue?: number | null;
  eligibilityScope: BonusEligibilityScopeCode;
  effectiveFrom: string;
  effectiveTo?: string | null;
  memo?: string | null;
};

// 시작일 변경 불가 나머지 항목 모두 갱신 가능
export type BonusPolicyUpdatePayload = Omit<BonusPolicyCreatePayload, 'effectiveFrom'>;
