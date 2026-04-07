/** goal-service `MeasureType` — 수치 방향(정량/정성 구분 아님) */
export type MeasureType = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'TARGET_MATCH';

/** goal-service `UnitType` */
export type UnitType = 'NUMBER' | 'AMOUNT' | 'PERCENTAGE' | 'RATIO' | 'CUSTOM';

export type KpiCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

/** goal-service `GoalOwnerType` */
export type OwnerType = 'MEMBER' | 'ORGANIZATION';

export type Visibility = 'PUBLIC' | 'TEAM_ONLY' | 'PRIVATE';

/** goal-service 실적 `InputType` */
export type PerformanceInputType = 'NUMBER' | 'TEXT' | 'FILE';

export type KpiTemplate = {
  id: string;
  companyId?: string | null;
  name: string;
  measureType: MeasureType;
  unitType: UnitType;
  cycle: KpiCycle;
  capPct?: number;
};

export type PerformanceRecord = {
  id: string;
  goalId?: string;
  actualValue: number;
  description?: string;
  selfScore?: number;
  inputType: PerformanceInputType;
  confirmed?: boolean | null;
  convertedScore?: number | null;
  rejectReason?: string | null;
  createdAt?: string;
};

/** goal-service `GoalStatus` — DB enum과 동일 */
export type GoalStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type Goal = {
  id: string;
  kpiTemplateId?: string;
  companyId?: string;
  ownerType: OwnerType;
  ownerId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  measureType: MeasureType;
  unitType: UnitType;
  baseline?: number;
  targetValue?: number;
  actualValue?: number;
  /** 목표 집계 API가 채우는 달성률(%) — 있으면 진행 UI에 우선 사용 */
  achievementPct?: number;
  capPct?: number;
  visibility: Visibility;
  weightPct?: number;
  /** API가 추후 값을 추가해도 매핑 레이어에서 허용 */
  status?: GoalStatus | string;
  performanceRecords?: PerformanceRecord[];
};

export type CreateKpiTemplatePayload = {
  companyId: string;
  name: string;
  measureType: MeasureType;
  unitType: UnitType;
  cycle: KpiCycle;
  capPct: number;
};

/** `GoalCreateReqDto` — UUID·날짜는 JSON 문자열로 전송 (Spring이 파싱) */
export type CreateGoalPayload = {
  kpiTemplateId: string;
  companyId: string;
  /** 선택, 상위 목표 연결 시 */
  parentGoalId?: string;
  ownerType: OwnerType;
  ownerId: string;
  title: string;
  /** 백엔드 `@NotBlank`, 최대 300자 */
  description: string;
  startDate: string;
  endDate: string;
  measureType: MeasureType;
  unitType: UnitType;
  /** 선택, 사용자 정의 단위 표기 */
  unitLabel?: string;
  baseline: number;
  targetValue: number;
  /** 백엔드 `@NotNull` `@Min(1)` */
  capPct: number;
  contributionPct?: number;
  weightPct?: number;
  visibility: Visibility;
};

export type SubmitPerformancePayload = {
  actualValue: number;
  description?: string;
  selfScore: number;
  inputType: PerformanceInputType;
};

export type ReviewPerformancePayload = {
  confirmed: boolean;
  convertedScore: number;
  rejectReason?: string;
};
