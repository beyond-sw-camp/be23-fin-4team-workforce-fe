import type {
  MeetingRecord,
  MeetingAction,
  CreateMeetingPayload,
  UpdateMeetingPayload,
  CompleteMeetingPayload,
  MemberReactionPayload,
  CreateActionPayload,
  RateActionPayload,
} from '@/features/meetings/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

// ── Helpers ──
function mapMeeting(raw: any): MeetingRecord {
  return {
    meetingRecordId: raw.meetingRecordId,
    parentRecordId: raw.parentRecordId ?? undefined,
    memberId: raw.memberId,
    managerId: raw.managerId,
    repeatCycle: raw.repeatCycle,
    scheduledAt: raw.scheduledAt,
    completedAt: raw.completedAt ?? undefined,
    agenda: raw.agenda ?? undefined,
    memo: raw.memo ?? undefined,
    privateMemo: raw.privateMemo ?? undefined,
    managerReaction: raw.managerReaction ?? undefined,
    memberReaction: raw.memberReaction ?? undefined,
    relatedGoalIdsJson: raw.relatedGoalIdsJson ?? undefined,
    relatedEvaluationResponseId: raw.relatedEvaluationResponseId ?? undefined,
    relatedSeasonId: raw.relatedSeasonId ?? undefined,
    companyId: raw.companyId ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function mapAction(raw: any): MeetingAction {
  const isCompleted = Boolean(raw.isCompleted ?? raw.completed ?? raw.status === 'COMPLETED');
  return {
    meetingActionId: raw.meetingActionId,
    meetingRecordId: raw.meetingRecordId,
    content: raw.content ?? raw.description ?? '',
    description: raw.description ?? raw.content ?? undefined,
    assigneeId: raw.assigneeId,
    dueDate: raw.dueDate ?? undefined,
    status: raw.status ?? (isCompleted ? 'COMPLETED' : 'PENDING'),
    completedAt: raw.completedAt ?? undefined,
    tlRating: raw.tlRating ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeArray<T>(payload: unknown, mapFn: (r: any) => T): T[] {
  if (Array.isArray(payload)) return payload.map(mapFn);
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['items', 'content', 'data', 'list']) {
      if (Array.isArray(o[k])) return (o[k] as any[]).map(mapFn);
    }
  }
  return [];
}

// ── API ──
export const meetingApi = {
  // ── Meeting Records ──
  async createMeeting(body: CreateMeetingPayload): Promise<MeetingRecord> {
    const res = await httpClient.post('/meeting/record', body);
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },

  async getMeeting(meetingRecordId: string): Promise<MeetingRecord> {
    const res = await httpClient.get(`/meeting/record/${meetingRecordId}`);
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },

  async listMyMeetingsAsMember(): Promise<MeetingRecord[]> {
    const res = await httpClient.get('/meeting/record/me/as-member');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapMeeting);
  },

  async listMyMeetingsAsManager(): Promise<MeetingRecord[]> {
    const res = await httpClient.get('/meeting/record/me/as-manager');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapMeeting);
  },

  async listWithMember(memberId: string): Promise<MeetingRecord[]> {
    const res = await httpClient.get(`/meeting/record/member/${memberId}/manager/me`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapMeeting);
  },

  async listSeasonMeetings(seasonId: string): Promise<MeetingRecord[]> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}/meetings`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapMeeting);
  },

  async updateMeeting(meetingRecordId: string, body: UpdateMeetingPayload): Promise<MeetingRecord> {
    const res = await httpClient.patch(`/meeting/record/${meetingRecordId}`, body);
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },

  async completeMeeting(meetingRecordId: string, body: CompleteMeetingPayload): Promise<MeetingRecord> {
    const res = await httpClient.patch(`/meeting/record/${meetingRecordId}/complete`, body);
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },

  async recordMemberReaction(meetingRecordId: string, body: MemberReactionPayload): Promise<MeetingRecord> {
    const res = await httpClient.patch(`/meeting/record/${meetingRecordId}/member-reaction`, body);
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },

  async updatePrivateMemo(meetingRecordId: string, privateMemo: string): Promise<MeetingRecord> {
    const res = await httpClient.patch(`/meeting/record/${meetingRecordId}/private-memo`, { privateMemo });
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },

  // ── Meeting Actions ──
  async listActions(meetingRecordId: string): Promise<MeetingAction[]> {
    const res = await httpClient.get(`/meeting/${meetingRecordId}/action`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapAction);
  },

  async createAction(meetingRecordId: string, body: CreateActionPayload): Promise<MeetingAction> {
    const res = await httpClient.post(`/meeting/${meetingRecordId}/action`, {
      assigneeId: body.assigneeId,
      description: body.description ?? body.content,
      dueDate: body.dueDate,
    });
    return mapAction(unwrapApiResponse<any>(res.data));
  },

  async listMyPendingActions(): Promise<MeetingAction[]> {
    const res = await httpClient.get('/meeting/action/me/pending');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapAction);
  },

  async completeAction(meetingRecordId: string, actionId: string): Promise<MeetingAction> {
    const res = await httpClient.patch(`/meeting/${meetingRecordId}/action/${actionId}/complete`);
    return mapAction(unwrapApiResponse<any>(res.data));
  },

  async rateAction(meetingRecordId: string, actionId: string, body: RateActionPayload): Promise<MeetingAction> {
    const res = await httpClient.patch(`/meeting/${meetingRecordId}/action/${actionId}/rate`, body);
    return mapAction(unwrapApiResponse<any>(res.data));
  },

  async linkActionApproval(meetingRecordId: string, actionId: string, approvalId: string): Promise<MeetingAction> {
    const res = await httpClient.patch(`/meeting/${meetingRecordId}/action/${actionId}/approval`, { approvalId });
    return mapAction(unwrapApiResponse<any>(res.data));
  },

  async deleteAction(meetingRecordId: string, actionId: string): Promise<void> {
    await httpClient.delete(`/meeting/${meetingRecordId}/action/${actionId}`);
  },

  // ── Meeting Record ── 연관 목표 연결
  async linkGoals(meetingRecordId: string, relatedGoalIdsJson: string): Promise<MeetingRecord> {
    const res = await httpClient.patch(`/meeting/record/${meetingRecordId}/goals`, { relatedGoalIdsJson });
    return mapMeeting(unwrapApiResponse<any>(res.data));
  },
};
