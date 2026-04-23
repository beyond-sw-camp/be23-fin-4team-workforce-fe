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

export type DailyAttendance = {
  dailyAttendanceId?: string;
  memberId?: string;
  attendanceDate?: string;
  status?: AttendanceStatusCode;
  workScheduleId?: string;
  firstClockIn?: string | null;
  lastClockOut?: string | null;
  breakMinutes?: number | null;
  totalBreakMinutes?: number | null;
  workedMinutes?: number | null;
  overtimeMinutes?: number | null;
};

export type AttendanceLog = {
  attendanceLogId?: string;
  eventType?: EventTypeCode;
  eventTime?: string;
  latitude?: number | null;
  longitude?: number | null;
  deviceId?: string | null;
  isCorrectedYn?: string | null;
};

export type AttendanceLogCreatePayload = {
  eventTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  overtimeRoundingMinutes?: number | null;
  approvalMode?: ApprovalModeCode | null;
  postApprovalDeadlineHours?: number | null;
  weeklyOvertimeLimitMinutes?: number | null;
  weeklyTotalLimitMinutes?: number | null;
  dailyOvertimeLimitMinutes?: number | null;
  monthlyOvertimeLimitMinutes?: number | null;
  nightStartTime?: string | null;
  nightEndTime?: string | null;
  holidayWorkRequiresApproval?: boolean | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

export type OvertimePolicyCreatePayload = {
  overtimeRoundingMinutes: number;
  approvalMode: ApprovalModeCode;
  postApprovalDeadlineHours?: number | null;
  weeklyOvertimeLimitMinutes?: number | null;
  weeklyTotalLimitMinutes?: number | null;
  dailyOvertimeLimitMinutes?: number | null;
  monthlyOvertimeLimitMinutes?: number | null;
  nightStartTime?: string | null;
  nightEndTime?: string | null;
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
  breakMinutes?: number | null;
  isDefault?: boolean | null;
  delYn?: string | null;
};

export type FlexibleTimeSlotCreatePayload = {
  workScheduleId: string;
  slotCode: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  workMinutes: number;
  breakMinutes: number;
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
};

export type MemberAllowance = {
  memberAllowanceId?: string;
  memberId?: string;
  salaryItemTemplateId?: string;
  amount?: number | null;
  effectiveFrom?: string | null;
  reason?: string | null;
  approvalStatus?: AllowanceApprovalStatusCode;
  approvalRequestId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MemberAllowanceCreatePayload = {
  salaryItemTemplateId: string;
  amount: number;
  effectiveFrom: string;
  reason?: string | null;
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
};

export type MemberBalanceGrantPayload = {
  memberId: string;
  balanceType: BalanceTypeCode;
  totalGranted: number;
  expirationDate?: string | null;
};

export type AccrualBaseCode = 'FISCAL' | 'HIRE_DATE' | string;

export type PayrollStatusCode = 'DRAFT' | 'CONFIRMED' | 'PAID' | string;

export type Payroll = {
  payrollId?: string;
  salaryId?: string;
  memberId?: string;
  payrollYearMonthDay?: string;
  paidAt?: string | null;
  totalPayment?: number | null;
  totalDeduction?: number | null;
  netPay?: number | null;
  payrollStatus?: PayrollStatusCode;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ItemTypeCode = 'EARNING' | 'DEDUCTION' | string;

export type PayrollItem = {
  payrollItemId?: string;
  payrollId?: string;
  itemName?: string;
  itemType?: ItemTypeCode;
  amount?: number | null;
  displayOrder?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type PayrollCreatePayload = {
  memberId: string;
  payrollYearMonthDay: string;
};

export type PayrollItemCreatePayload = {
  salaryItemTemplateId: string;
  amount: number;
};

export type PayrollItemUpdatePayload = {
  amount: number;
  displayOrder?: number | null;
};

export type SalaryItemTemplate = {
  salaryItemTemplateId?: string;
  companyId?: string;
  itemName?: string;
  itemType?: ItemTypeCode;
  displayOrder?: number | null;
  isTaxableYn?: string | null;
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
  isCarryoverConsentYn?: string | null;
  isPayoutYn?: string | null;
  defaultAnnualDays?: number | null;
  accrualBase?: AccrualBaseCode | null;
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
export type WorkTypeCode = 'FIXED' | 'FLEXIBLE' | 'SHIFT' | string;

export type WorkSchedule = {
  workScheduleId?: string;
  companyId?: string;
  memberId?: string | null;
  scheduleName?: string;
  workType?: WorkTypeCode;
  startTime?: string;
  endTime?: string;
  workMinutes?: number | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
};

export type WorkScheduleCreatePayload = {
  memberId?: string | null;
  scheduleName: string;
  workType: WorkTypeCode;
  startTime: string;
  endTime: string;
  workMinutes: number;
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
  destinationLat?: number | null;
  destinationLng?: number | null;
  /** 출장지 허용 반경 (미터). 미지정 시 서버 기본값 200m */
  destinationRadiusMeters?: number | null;
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
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationRadiusMeters?: number | null;
  purpose?: string | null;
  expenseAmount?: number | null;
  expenseType?: ExpenseTypeCode | null;
};

export type WorkTripUpdatePayload = {
  workTripType?: WorkTripTypeCode;
  destination?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationRadiusMeters?: number | null;
  purpose?: string | null;
  expenseAmount?: number | null;
  expenseType?: ExpenseTypeCode | null;
};

/* ──────────────────────────────────────────────
 * 급여(Salary) 관리 — 관리자 설정 영역
 * ────────────────────────────────────────────── */

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
};

export type SalaryUpdatePayload = Omit<SalaryCreatePayload, 'memberId'>;

/** `POST /salary/salaries/bootstrap` — 입사 누락 복구용
 *  - 백엔드가 `MemberHiredEvent`를 바디로 받아 `bootstrapSalary()` 호출
 *  - 활성 급여정책이 이미 있어야 Salary가 생성됨
 *  - `companyId`는 X-User-CompanyId 헤더로 주입되므로 바디에서 생략 */
export type SalaryBootstrapPayload = {
  memberId: string;
  hireDate: string;
  baseSalary?: number | null;
  jobGradeId?: string | null;
  jobGradeName?: string | null;
  jobTitleName?: string | null;
};

/** 급여 정책 (SalaryPolicy) */
export type PayTypeCode = 'MONTHLY' | 'BONUS' | 'SEVERANCE' | string;
export type WageSystemTypeCode = 'COMPREHENSIVE' | 'NON_COMPREHENSIVE' | string;
export type PeriodStartTypeCode = 'FIRST' | 'SPECIFIC' | string;
export type PeriodEndTypeCode = 'LAST' | 'SPECIFIC' | string;
/** 지급일이 주말/공휴일일 때 조정 규칙. BEFORE=직전 영업일(실무 표준), AFTER=직후 영업일, NONE=해당일 그대로 */
export type PayDayShiftRuleCode = 'NONE' | 'BEFORE' | 'AFTER' | string;

export type SalaryPolicy = {
  salaryPolicyId?: string;
  companyId?: string;
  policyName?: string;
  payType?: PayTypeCode;
  payDay?: number | null;
  /** 호봉제 사용 여부, Y/N */
  usePayGradeYn?: string | null;
  overtimeRoundingMinutes?: number | null;
  wageSystemType?: WageSystemTypeCode;
  fixedOvertimeMinutes?: number | null;
  periodStartType?: PeriodStartTypeCode;
  periodEndType?: PeriodEndTypeCode;
  /** 지급일 주말/공휴일 조정 규칙 (기본 BEFORE) */
  payDayShiftRule?: PayDayShiftRuleCode | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SalaryPolicyCreatePayload = {
  policyName: string;
  payType: PayTypeCode;
  payDay: number;
  /** 호봉제 사용 여부, Y/N. 기본 N */
  usePayGradeYn: string;
  overtimeRoundingMinutes?: number | null;
  wageSystemType: WageSystemTypeCode;
  fixedOvertimeMinutes?: number | null;
  periodStartType: PeriodStartTypeCode;
  periodEndType: PeriodEndTypeCode;
  /** 지급일 주말/공휴일 조정 규칙, 기본 BEFORE */
  payDayShiftRule: PayDayShiftRuleCode;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type SalaryPolicyUpdatePayload = SalaryPolicyCreatePayload;

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
  /** 사유 발생일(eventDate) 기준 사용 마감 일수, null 이면 기한 없음 (경조/출산 등) */
  usageDeadlineDays?: number | null;
  displayOrder?: number | null;
};

export type CompanyLeaveTypeCreatePayload = {
  code: string;
  name: string;
  balanceType?: BalanceTypeCode | null;
  daysPerUse: number;
  isPaidYn: string;
  maxDaysPerYear?: number | null;
  requireEvidenceYn: string;
  usageDeadlineDays?: number | null;
  displayOrder: number;
};

export type CompanyLeaveTypeUpdatePayload = {
  name: string;
  balanceType?: BalanceTypeCode | null;
  daysPerUse?: number | null;
  isPaidYn?: string | null;
  maxDaysPerYear?: number | null;
  requireEvidenceYn?: string | null;
  usageDeadlineDays?: number | null;
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

/** 회사 허용 IP 화이트리스트 */
export type CompanyIpWhitelist = {
  companyIpWhitelistId?: string;
  cidr?: string;
  label?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CompanyIpWhitelistCreatePayload = {
  cidr: string;
  label?: string | null;
};

export type CompanyIpWhitelistUpdatePayload = CompanyIpWhitelistCreatePayload;

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
