export type KpiCycle = 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type GoalOwnerType = 'ORGANIZATION' | 'MEMBER';
export type GoalStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SKIPPED';
export type GoalApprovalStatus = 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type Grade = 'S' | 'A' | 'B' | 'C';

export type Goal = {
  goalId: string;
  id?: string;
  companyId: string;
  ownerType: GoalOwnerType;
  ownerId: string;
  alignedOrgGoalId?: string | null;
  parentGoalId?: string | null;
  title: string;
  description: string;
  cycle: KpiCycle;
  cycleStartDate: string;
  cycleEndDate: string;
  cycleKey: string;
  startDate?: string;
  endDate?: string;
  weightPct: number;
  status: GoalStatus;
  goalApprovalStatus: GoalApprovalStatus;
  approvalStatus?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  visibleTeamIds: string[];
  participantMemberIds: string[];
  gradeS?: string;
  gradeA?: string;
  gradeB?: string;
  gradeC?: string;
  objectiveTitle?: string | null;
  objectiveGradeS?: string;
  objectiveGradeA?: string;
  objectiveGradeB?: string;
  objectiveGradeC?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GoalCycle = {
  cycle: KpiCycle;
  cycleStartDate: string;
  cycleEndDate: string;
  organizationGoalCount: number;
};

export type GoalCreatePayload = {
  ownerType: GoalOwnerType;
  ownerId: string;
  alignedOrgGoalId?: string | null;
  title: string;
  description: string;
  cycle: KpiCycle;
  cycleStartDate: string;
  cycleEndDate: string;
  weightPct: number;
  visibleTeamIds?: string[];
  participantMemberIds?: string[];
  gradeS?: string;
  gradeA?: string;
  gradeB?: string;
  gradeC?: string;
};

export type GoalUpdatePayload = {
  ownerId?: string;
  title?: string;
  description?: string;
  weightPct?: number;
  alignedOrgGoalId?: string | null;
  visibleTeamIds?: string[];
  participantMemberIds?: string[];
  gradeS?: string;
  gradeA?: string;
  gradeB?: string;
  gradeC?: string;
};

export type ListMyGoalsParams = { status?: GoalStatus };
export type ListCompanyGoalsParams = { cycle?: KpiCycle };
export type ListOrgGoalsParams = { orgId: string };
export type ListObjectiveParams = { cycle?: KpiCycle };
export type ListOrgObjectivesParams = { orgId: string; cycle?: KpiCycle };

export type GoalAggregate = {
  orgGoalId: string;
  childCount: number;
  confirmedCount: number;
  weightedAvgScore: number | null;
  simpleAvgScore: number | null;
  childGoalIds: string[];
  childCountByStatus: Record<GoalStatus, number>;
};

export type GradeCriteria = never;
export type GradeCriteriaPayload = never;
export type GoalApprovalPolicy = 'NONE' | 'ACTIVATION_ONLY' | 'COMPLETION_ONLY' | 'BOTH';
export type BundleApprovalKind = 'ACTIVATION' | 'COMPLETION';
export type GoalApprovalBundleSummary = { bundleId: string; status: string };
