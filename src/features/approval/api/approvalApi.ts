import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import { normalizeArray } from '@/shared/api/normalize';
import type {
  GoalApprovalBundle,
  SubmitCyclePayload,
  ApprovePayload,
  RejectPayload,
} from '../model/types';

function pickStr(o: any, ...keys: string[]): string {
  for (const k of keys) if (o?.[k] != null) return String(o[k]);
  return '';
}
function pickNum(o: any, ...keys: string[]): number {
  for (const k of keys) if (o?.[k] != null) return Number(o[k]);
  return 0;
}
function pickArr(o: any, ...keys: string[]): any[] {
  for (const k of keys) if (Array.isArray(o?.[k])) return o[k];
  return [];
}

function mapBundle(b: any): GoalApprovalBundle {
  return {
    bundleId: pickStr(b, 'bundleId', 'id'),
    companyId: pickStr(b, 'companyId'),
    requestedBy: pickStr(b, 'requestedBy'),
    requestedAt: pickStr(b, 'requestedAt'),
    cycleKey: pickStr(b, 'cycleKey'),
    revision: pickNum(b, 'revision'),
    originalBundleId: b.originalBundleId ?? null,
    weightSumSnapshot: pickNum(b, 'weightSumSnapshot'),
    status: pickStr(b, 'status') as GoalApprovalBundle['status'],
    decision: pickStr(b, 'decision') as GoalApprovalBundle['decision'],
    approverId: pickStr(b, 'approverId'),
    decidedAt: b.decidedAt ?? null,
    commentText: b.commentText ?? null,
    rejectionReason: b.rejectionReason ?? null,
    lastRejectedReason: b.lastRejectedReason ?? null,
    goalIds: pickArr(b, 'goalIds').map(String),
    affectedGoalIds: pickArr(b, 'affectedGoalIds').map(String),
    watcherIds: pickArr(b, 'watcherIds').map(String),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export const approvalApi = {
  async submitCycle(cycleKey: string, payload: SubmitCyclePayload): Promise<GoalApprovalBundle> {
    const res = await httpClient.post(`/goal/approval/cycles/${cycleKey}/submit`, payload);
    return mapBundle(unwrapApiResponse<unknown>(res.data));
  },
  async approve(bundleId: string, payload: ApprovePayload): Promise<GoalApprovalBundle> {
    const res = await httpClient.post(`/goal/approval-bundles/${bundleId}/approve`, payload);
    return mapBundle(unwrapApiResponse<unknown>(res.data));
  },
  async reject(bundleId: string, payload: RejectPayload): Promise<GoalApprovalBundle> {
    const res = await httpClient.post(`/goal/approval-bundles/${bundleId}/reject`, payload);
    return mapBundle(unwrapApiResponse<unknown>(res.data));
  },
  async withdraw(bundleId: string): Promise<GoalApprovalBundle> {
    const res = await httpClient.post(`/goal/approval-bundles/${bundleId}/withdraw`);
    return mapBundle(unwrapApiResponse<unknown>(res.data));
  },
  async get(bundleId: string): Promise<GoalApprovalBundle> {
    const res = await httpClient.get(`/goal/approval-bundles/${bundleId}`);
    return mapBundle(unwrapApiResponse<unknown>(res.data));
  },
  async listMyRequested(): Promise<GoalApprovalBundle[]> {
    const res = await httpClient.get('/goal/approval-bundles/me/requested');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapBundle);
  },
  async listMyQueue(): Promise<GoalApprovalBundle[]> {
    const res = await httpClient.get('/goal/approval-bundles/me/queue');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapBundle);
  },
};
