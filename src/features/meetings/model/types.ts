// ── Enums ──
export type RepeatCycle = 'ONE_TIME' | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type Reaction = 'VERY_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE';
export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type TlRating = 'EXCEEDS' | 'MEETS' | 'BELOW';

// ── MeetingRecord ──
export type MeetingRecord = {
  meetingRecordId: string;
  parentRecordId?: string;
  memberId: string;
  managerId: string;
  repeatCycle: RepeatCycle;
  scheduledAt: string;
  completedAt?: string;
  agenda?: string;
  memo?: string;
  privateMemo?: string;
  managerReaction?: Reaction;
  memberReaction?: Reaction;
  relatedGoalIdsJson?: string;
  relatedEvaluationResponseId?: string;
  relatedSeasonId?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMeetingPayload = {
  parentRecordId?: string;
  memberId: string;
  managerId: string;
  repeatCycle: RepeatCycle;
  scheduledAt: string;
  agenda?: string;
};

export type UpdateMeetingPayload = {
  scheduledAt?: string;
  agenda?: string;
  repeatCycle?: RepeatCycle;
};

export type CompleteMeetingPayload = {
  memo: string;
  managerReaction?: Reaction;
  privateMemo?: string;
};

export type MemberReactionPayload = {
  memberReaction: Reaction;
};

// ── MeetingAction ──
export type MeetingAction = {
  meetingActionId: string;
  meetingRecordId: string;
  content: string;
  assigneeId: string;
  dueDate?: string;
  status: ActionStatus;
  completedAt?: string;
  tlRating?: TlRating;
  createdAt: string;
  updatedAt: string;
};

export type CreateActionPayload = {
  content: string;
  assigneeId: string;
  dueDate?: string;
};

export type RateActionPayload = {
  tlRating: TlRating;
};
