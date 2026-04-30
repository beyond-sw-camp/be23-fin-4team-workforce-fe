import type { NavigateOptions } from '@tanstack/react-router';

export type ApprovalHomeModalKey = 'pending' | 'my-all' | 'viewers' | 'official' | 'draft';

type BuildApprovalRouteInput = {
  notificationType?: string | null;
  targetType?: string | null;
  title?: string | null;
  content?: string | null;
  /** 결재 알림 등에서 오는 결재 요청 UUID */
  targetId?: string | null;
};

function pickApprovalHomeModal(input: BuildApprovalRouteInput): ApprovalHomeModalKey {
  const t = String(input.notificationType ?? '')
    .trim()
    .toUpperCase();
  const targetType = String(input.targetType ?? '')
    .trim()
    .toUpperCase();
  const title = String(input.title ?? '')
    .trim()
    .toUpperCase();
  const content = String(input.content ?? '')
    .trim()
    .toUpperCase();
  const bucket = `${t} ${targetType} ${title} ${content}`;

  if (t === 'APPROVAL_REQUESTED') return 'pending';
  if (t === 'APPROVAL_APPROVED' || t === 'APPROVAL_REJECTED' || t === 'APPROVAL_CANCELED') return 'my-all';
  if (t === 'APPROVAL_REFERENCED' || t === 'APPROVAL_CIRCULATED') return 'viewers';
  if (bucket.includes('OFFICIAL') || bucket.includes('공문'.toUpperCase())) return 'official';
  if (bucket.includes('DRAFT') || bucket.includes('임시저장'.toUpperCase())) return 'draft';
  return 'my-all';
}

/** 전자결재 알림: 모두 결재 작성 허브로 진입. `targetId`가 있으면 해당 요청 상세 모달까지 연다. */
export function buildApprovalNotificationNavigate(input: BuildApprovalRouteInput): NavigateOptions {
  const modal = pickApprovalHomeModal(input);
  const requestId = String(input.targetId ?? '').trim();
  const search: Record<string, string | undefined> = {
    tab: 'compose',
    approvalModal: modal,
    approvalOpenAt: String(Date.now()),
  };
  if (requestId) {
    search.approvalRequestId = requestId;
  }
  return {
    to: '/app/approvals',
    search,
  } as NavigateOptions;
}

/** 목표 승인 번들 알림: 성과 승인 상세 라우트로 진입. */
export function buildGoalBundleNotificationNavigate(input: BuildApprovalRouteInput): NavigateOptions {
  const bundleId = String(input.targetId ?? '').trim();
  if (!bundleId) {
    return { to: '/app/performance' } as NavigateOptions;
  }
  return {
    to: '/app/performance',
    search: {
      view: 'my-objective',
      bundleId,
    },
  } as NavigateOptions;
}

