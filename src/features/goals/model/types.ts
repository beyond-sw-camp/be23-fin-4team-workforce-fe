export type KpiCycle = 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type GoalOwnerType = 'ORGANIZATION' | 'MEMBER';
export type GoalVisibility = 'COMPANY' | 'TEAM' | 'PRIVATE';
export type GoalStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SKIPPED';
export type GoalApprovalStatus = 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type Grade = 'S' | 'A' | 'B' | 'C';
export type GoalHealthStatus = 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'COMPLETED';

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
  visibility: GoalVisibility;
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
  actualValue?: number | null;
  achievementPct?: number | null;
  rolledAchievementPct?: number | null;
  healthStatus?: GoalHealthStatus | null;
  unitLabel?: string;
  unitType?: string;
  measureType?: string;
  createdAt?: string;
  updatedAt?: string;
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
  visibility: GoalVisibility;
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
  visibility?: GoalVisibility;
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
export type Visibility = GoalVisibility;
export type GoalApprovalPolicy = 'NONE' | 'ACTIVATION_ONLY' | 'COMPLETION_ONLY' | 'BOTH';
export type BundleApprovalKind = 'ACTIVATION' | 'COMPLETION';
export type GoalApprovalBundleSummary = { bundleId: string; status: string };

export type GoalProgressUpdatePayload = {
  value: number;
  status: GoalHealthStatus;
  note?: string;
};

export type GoalProgressUpdate = {
  updateId: string | null;
  goalId: string;
  value: number | null;
  status: GoalHealthStatus | null;
  note?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
};

export type GoalSeasonReadinessIssue = {
  memberId: string;
  reason: string;
  weightSum?: number | null;
  goalCount?: number | null;
};

export type GoalSeasonReadiness = {
  seasonId: string;
  ready: boolean;
  targetMemberCount: number;
  activeGoalCount: number;
  blockerCount: number;
  warningCount: number;
  missingGoals: GoalSeasonReadinessIssue[];
  weightIssues: GoalSeasonReadinessIssue[];
  pendingBundles: GoalSeasonReadinessIssue[];
  missingProgressUpdates: GoalSeasonReadinessIssue[];
  missingLeads: GoalSeasonReadinessIssue[];
};
