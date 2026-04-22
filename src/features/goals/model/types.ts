/** goal-service `MeasureType` — 수치 방향(정량/정성 구분 아님) */
export type MeasureType = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'TARGET_MATCH';

/** goal-service `UnitType` */
export type UnitType = 'NUMBER' | 'AMOUNT' | 'PERCENTAGE' | 'RATIO' | 'CUSTOM';

/** KPI 템플릿 `KpiCycle` — goal-service: MONTHLY, QUARTERLY, ANYTIME (+ 레거시 값 호환) */
export type KpiCycle = 'MONTHLY' | 'QUARTERLY' | 'ANYTIME' | 'HALF_YEARLY' | 'YEARLY';

/** goal-service `GoalOwnerType` */
export type OwnerType = 'MEMBER' | 'ORGANIZATION';

/** goal-service `RollupPolicy` — 목표 생성·수정 */
export type RollupPolicy = 'CHILDREN_AVG' | 'CHILDREN_WEIGHTED';

export type Visibility = 'PUBLIC' | 'TEAM_ONLY' | 'PRIVATE';

/** 세분화된 승인 정책 — 기존 requireApproval 불리언을 확장 */
export type GoalApprovalPolicy = 'NONE' | 'ACTIVATION_ONLY' | 'COMPLETION_ONLY' | 'BOTH';

/** 번들의 활성화/종료 구분 */
export type BundleApprovalKind = 'ACTIVATION' | 'COMPLETION';

export type KpiTemplate = {
  id: string;
  companyId?: string | null;
  name: string;
  measureType: MeasureType;
  unitType: UnitType;
  /** 화면 표시 단위 — 템플릿·목표에 복사되는 문자열 (API: 최대 20자) */
  unitLabel: string;
  cycle: KpiCycle;
  capPct?: number;
  /** 비활성 템플릿은 새 목표에서 선택 불가 — 응답 없으면 활성으로 간주 */
  isActive?: boolean;
  specCycleType?: string;
  targetTeamId?: string | null;
  /** @deprecated goalApprovalPolicy 사용 권장 */
  requireApproval?: boolean;
  /** 세분화된 승인 정책. 서버가 항상 내려주며, 없으면 requireApproval 로부터 유도. */
  goalApprovalPolicy?: GoalApprovalPolicy;
  /** 서버 `KpiTemplateResDto.kpis` — 구조화 배열 (우선). */
  kpis?: unknown[] | null;
  /** 레거시/직렬화용 — `kpis`만 올 때 API 레이어에서 JSON 문자열로도 채움 */
  kpisJson?: string | null;
};

/** GET `/goal` 쿼리 — `status`는 서버 `GoalHealthStatus` */
export type ListGoalsParams = {
  parentId?: string;
  cycle?: KpiCycle;
  ownerId?: string;
  status?: GoalHealthStatus;
  depth?: number;
};

/** `KpiTemplateGenerateReqDto` — POST `/goal/kpi-template/{id}/generate` (필드 모두 선택) */
export type KpiTemplateGeneratePayload = {
  periodStart?: string;
  periodEnd?: string;
  parentGoalId?: string;
  ownerMapping?: Array<{ kpiIndex: number; ownerId: string; ownerType?: OwnerType }>;
  approval?: { approverId: string };
};

/** goal-service `GoalStatus` — DB enum과 동일 */
export type GoalStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type GoalHealthStatus =
  | 'NOT_STARTED'
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'BEHIND'
  | 'COMPLETED'
  | string;

export type GoalKindType = 'objective' | 'kr' | 'task' | string;

export type Goal = {
  id: string;
  kpiTemplateId?: string;
  /** 상위 목표 `goalId` — 루트면 없음 */
  parentGoalId?: string | null;
  companyId?: string;
  ownerType: OwnerType;
  ownerId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  measureType: MeasureType;
  unitType: UnitType;
  /** 화면 표시 단위(최대 20자) — 없으면 목표 생성 시 템플릿 값 사용 */
  unitLabel?: string;
  baseline?: number;
  targetValue?: number;
  actualValue?: number;
  /** 목표 집계 API가 채우는 달성률(%) — 있으면 진행 UI에 우선 사용 */
  achievementPct?: number;
  capPct?: number;
  /** 서버 공식 롤업 달성률(있으면 상위 목표 표시 기준으로 사용) */
  rolledAchievementPct?: number | null;
  /** 롤업 출처 */
  rollupSource?: 'SELF' | 'CHILDREN_AVG' | 'CHILDREN_WEIGHTED' | string;
  /** 롤업 정책 */
  rollupPolicy?: 'CHILDREN_AVG' | 'CHILDREN_WEIGHTED' | string;
  /** 직속 하위 개수 */
  childCount?: number;
  /** 트리 조회 시 포함될 수 있는 뎁스 */
  depth?: number;
  /** 루트부터 현재 목표까지 path */
  path?: string[];
  /** 트리 조회 시 자식 존재 여부 */
  hasChildren?: boolean;
  /**
   * 목표 승인 워크플로 상태 — API `goalApprovalStatus`와 동일 의미(매핑 시 둘 다 수용).
   */
  approvalStatus?: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  visibility: Visibility;
  weightPct?: number;
  /** API가 추후 값을 추가해도 매핑 레이어에서 허용 */
  status?: GoalStatus | string;
  /** KPI 템플릿 주기 — `GoalResDto.cycle` */
  cycle?: KpiCycle;
  /** 명세 objective|kr|task — API `type` */
  type?: GoalKindType;
  /** UI 진행률 0~100 — API `progress` */
  progress?: number;
  autoUpdate?: boolean;
  healthStatus?: GoalHealthStatus;
  visibleTeamIds?: string[];
  participantMemberIds?: string[];
  /**
   * 목표 생성 시 지정된 "종료 승인자" — 완료 승인 요청 모달에서 기본값으로 사용.
   * API `GoalResDto.completionApproverId` 와 매핑.
   */
  completionApproverId?: string;
};

export type CreateKpiTemplatePayload = {
  companyId: string;
  name: string;
  measureType: MeasureType;
  unitType: UnitType;
  /** 필수, @NotBlank, 최대 20자 */
  unitLabel: string;
  cycle: KpiCycle;
  capPct: number;
  /** 승인 정책 — 미지정 시 BE가 NONE 으로 기본 처리 */
  goalApprovalPolicy?: GoalApprovalPolicy;
};

/** `GoalCreateReqDto` — UUID·날짜는 JSON 문자열로 전송 (Spring이 파싱) */
export type CreateGoalPayload = {
  kpiTemplateId?: string;
  companyId: string;
  /** 선택, 상위 목표 연결 시 */
  parentGoalId?: string;
  /** 미입력 시 서버 기본 CHILDREN_AVG */
  rollupPolicy?: RollupPolicy;
  ownerType: OwnerType;
  ownerId: string;
  title: string;
  description?: string;
  cycle?: KpiCycle;
  goalKind?: 'OBJECTIVE' | 'KR' | 'TASK';
  autoUpdate?: boolean;
  requireApproval?: boolean;
  activateImmediately?: boolean;
  approverId?: string;
  visibleTeamIds?: string[];
  memberIds?: string[];
  startDate: string;
  endDate: string;
  measureType?: MeasureType;
  unitType?: UnitType;
  /** 비우면 템플릿 `unitLabel` 적용. 값이 있으면 최대 20자 */
  unitLabel?: string;
  baseline?: number;
  targetValue: number;
  capPct?: number;
  contributionPct?: number;
  weightPct?: number;
  visibility: Visibility;
};

export type GoalApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

export type GoalApprovalSummary = {
  goalId: string;
  requestId?: string;
  approvalStatus: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  /** 번들이 활성화(ACTIVATION) 승인인지 종료(COMPLETION) 승인인지 구분. */
  approvalKind?: BundleApprovalKind;
  approverId?: string;
  decision?: GoalApprovalDecision;
  decidedAt?: string | null;
  comment?: string | null;
  completionSummary?: string | null;
  completionEvidenceFiles?: string | null;
  watchers?: Array<{ memberId: string }>;
};

/** `GoalApprovalRequestCreateReqDto` */
export type GoalApprovalRequestPayload = {
  approverId: string;
};

export type GoalApprovalWatchersPayload = {
  watcherIds: string[];
};

export type GoalApprovalDecisionPayload = {
  comment?: string;
  reason?: string;
};

export type GoalApprovalBundleSummary = {
  requestId: string;
  status: string;
  /** 번들의 활성화/종료 구분 */
  approvalKind?: BundleApprovalKind;
  goalCount: number;
  requestedAt?: string;
  completionSummary?: string | null;
  completionEvidenceFiles?: string | null;
};

export type GoalApprovalBundleDetail = {
  requestId: string;
  status: string;
  /** 번들의 활성화/종료 구분 */
  approvalKind?: BundleApprovalKind;
  rejectionReason?: string | null;
  goals: Goal[];
  approverId?: string;
  decision?: GoalApprovalDecision;
  decidedAt?: string | null;
  comment?: string | null;
  completionSummary?: string | null;
  completionEvidenceFiles?: string | null;
  watchers?: Array<{ memberId: string }>;
};

export type GoalActivity = {
  activityId: string;
  type:
    | 'GOAL_CREATED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'COMMENT_ADDED'
    | 'PROGRESS_UPDATED'
    | 'GOAL_METADATA_UPDATED'
    | string;
  actorId?: string;
  createdAt?: string;
  summary?: string;
  meta?: Record<string, unknown>;
};

/** `GoalUpdateReqDto` — PATCH `/goal/{goalId}` (모두 선택) */
export type UpdateGoalPayload = {
  title?: string;
  description?: string;
  visibility?: Visibility;
  weightPct?: number;
  contributionPct?: number;
  parentGoalId?: string;
  cycle?: KpiCycle;
  rollupPolicy?: RollupPolicy;
  goalKind?: 'OBJECTIVE' | 'KR' | 'TASK';
  autoUpdate?: boolean;
  healthStatus?: GoalHealthStatus;
  visibleTeamIds?: string[];
  memberIds?: string[];
};

export type GoalComment = {
  commentId: string;
  goalId: string;
  authorId: string;
  body: string;
  reactionsJson?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateGoalCommentPayload = {
  /** goal-service `GoalCommentReqDto.body` */
  body: string;
};

export type UpdateGoalCommentPayload = {
  body: string;
};

export type AddGoalProgressUpdatePayload = {
  /** 0~100 */
  value: number;
  status: GoalHealthStatus;
  note?: string;
};

/**
 * 완료 승인 요청 페이로드.
 *
 * `approverId` 는 선택:
 *   - 없으면 서버가 `Goal.completionApproverId` 를 기본 사용
 *   - 있으면 오버라이드 + Goal 엔티티에도 저장되어 다음 재요청 시 기본값으로 사용
 */
export type GoalCompletionSubmitPayload = {
  approverId?: string;
  summary?: string;
  evidenceFiles?: string;
};

export type GoalProgressUpdate = {
  updateId: string;
  goalId: string;
  value: number;
  status: GoalHealthStatus;
  note?: string | null;
  createdBy?: string;
  createdAt?: string;
};
