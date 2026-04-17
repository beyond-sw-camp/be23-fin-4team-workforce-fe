/**
 * GoalWorkflowSteps — 목표 상태 흐름을 시각적 스텝 인디케이터로 표시.
 *
 * DRAFT ─── (활성화 승인) ─── ACTIVE ─── (종료 승인) ─── COMPLETED
 *
 * 각 단계에서 현재 위치, 승인 대기 여부, 다음 액션 힌트를 표시합니다.
 */
import { CheckCircleOutlined, ClockCircleOutlined, RightOutlined } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import type { GoalApprovalPolicy } from '@/features/goals/model/types';

export type WorkflowStepStatus = 'done' | 'current' | 'waiting' | 'upcoming';

type StepDef = {
  key: string;
  label: string;
  status: WorkflowStepStatus;
  hint?: string;
  approvalTag?: 'activation' | 'completion';
};

export type GoalWorkflowStepsProps = {
  /** goal.status 정규화 값 */
  goalStatus: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | string;
  /** 현재 승인 상태 */
  approvalFlowStatus: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  /** KpiTemplate에서 가져온 승인 정책 */
  approvalPolicy: GoalApprovalPolicy;
  /** 컴팩트 모드 (카드 내부 등) */
  compact?: boolean;
};

function resolveSteps(
  goalStatus: string,
  approvalFlowStatus: string,
  policy: GoalApprovalPolicy,
): StepDef[] {
  const needsActivation = policy === 'ACTIVATION_ONLY' || policy === 'BOTH';
  const needsCompletion = policy === 'COMPLETION_ONLY' || policy === 'BOTH';
  const steps: StepDef[] = [];

  // ── Step 1: 초안
  if (goalStatus === 'DRAFT') {
    steps.push({ key: 'draft', label: '초안', status: 'current', hint: needsActivation ? '활성화 승인을 요청하세요' : '진행을 시작하세요' });
  } else {
    steps.push({ key: 'draft', label: '초안', status: 'done' });
  }

  // ── Step 2: 활성화 승인 (정책이 있을 때만)
  if (needsActivation) {
    if (goalStatus === 'DRAFT' && approvalFlowStatus === 'PENDING') {
      steps.push({ key: 'act-approval', label: '활성화 승인', status: 'waiting', hint: '승인자 검토 중', approvalTag: 'activation' });
    } else if (goalStatus === 'DRAFT' && approvalFlowStatus === 'REJECTED') {
      steps.push({ key: 'act-approval', label: '활성화 반려', status: 'current', hint: '보완 후 재요청하세요', approvalTag: 'activation' });
    } else if (goalStatus === 'DRAFT') {
      steps.push({ key: 'act-approval', label: '활성화 승인', status: 'upcoming', approvalTag: 'activation' });
    } else {
      steps.push({ key: 'act-approval', label: '활성화 승인', status: 'done', approvalTag: 'activation' });
    }
  }

  // ── Step 3: 진행 중
  if (goalStatus === 'ACTIVE') {
    steps.push({ key: 'active', label: '진행 중', status: 'current', hint: needsCompletion ? '완료 후 종료 승인을 요청하세요' : '완료되면 바로 종료할 수 있어요' });
  } else if (goalStatus === 'COMPLETED' || goalStatus === 'CANCELLED') {
    steps.push({ key: 'active', label: '진행 중', status: 'done' });
  } else {
    steps.push({ key: 'active', label: '진행 중', status: 'upcoming' });
  }

  // ── Step 4: 종료 승인 (정책이 있을 때만)
  if (needsCompletion) {
    if (goalStatus === 'ACTIVE' && approvalFlowStatus === 'PENDING') {
      steps.push({ key: 'comp-approval', label: '종료 승인', status: 'waiting', hint: '승인자 검토 중', approvalTag: 'completion' });
    } else if (goalStatus === 'ACTIVE' && approvalFlowStatus === 'REJECTED') {
      steps.push({ key: 'comp-approval', label: '종료 반려', status: 'current', hint: '보완 후 재요청하세요', approvalTag: 'completion' });
    } else if (goalStatus === 'COMPLETED') {
      steps.push({ key: 'comp-approval', label: '종료 승인', status: 'done', approvalTag: 'completion' });
    } else {
      steps.push({ key: 'comp-approval', label: '종료 승인', status: 'upcoming', approvalTag: 'completion' });
    }
  }

  // ── Step 5: 완료
  if (goalStatus === 'COMPLETED') {
    steps.push({ key: 'completed', label: '완료', status: 'done' });
  } else if (goalStatus === 'CANCELLED') {
    steps.push({ key: 'cancelled', label: '취소됨', status: 'done' });
  } else {
    steps.push({ key: 'completed', label: '완료', status: 'upcoming' });
  }

  return steps;
}

const STATUS_STYLES: Record<WorkflowStepStatus, { dot: string; text: string; line: string; bg: string }> = {
  done: {
    dot: 'tw-bg-emerald-500 tw-text-white',
    text: 'tw-text-emerald-700 tw-font-medium',
    line: 'tw-bg-emerald-400',
    bg: '',
  },
  current: {
    dot: 'tw-bg-[#1e3a5f] tw-text-white tw-ring-4 tw-ring-[#1e3a5f]/20',
    text: 'tw-text-[#1e3a5f] tw-font-bold',
    line: 'tw-bg-slate-200',
    bg: '',
  },
  waiting: {
    dot: 'tw-bg-amber-400 tw-text-white tw-animate-pulse',
    text: 'tw-text-amber-700 tw-font-semibold',
    line: 'tw-bg-slate-200',
    bg: '',
  },
  upcoming: {
    dot: 'tw-bg-slate-200 tw-text-slate-400',
    text: 'tw-text-slate-400',
    line: 'tw-bg-slate-100',
    bg: '',
  },
};

export function GoalWorkflowSteps({ goalStatus, approvalFlowStatus, approvalPolicy, compact = false }: GoalWorkflowStepsProps) {
  const normalized = (goalStatus ?? '').toUpperCase();
  const steps = resolveSteps(normalized, (approvalFlowStatus ?? 'NOT_REQUESTED').toUpperCase(), approvalPolicy);

  if (normalized === 'CANCELLED') {
    return (
      <div className="tw-flex tw-items-center tw-gap-2 tw-py-2">
        <Tag color="default" className="!tw-m-0">취소됨</Tag>
        <span className="tw-text-xs tw-text-slate-400">이 목표는 취소되었습니다.</span>
      </div>
    );
  }

  return (
    <div className={`tw-flex tw-items-center tw-gap-0 ${compact ? 'tw-py-1' : 'tw-py-3'}`}>
      {steps.map((step, idx) => {
        const style = STATUS_STYLES[step.status];
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.key} className="tw-flex tw-items-center">
            {/* Step dot + label */}
            <Tooltip
              title={step.hint ?? ''}
              open={step.hint ? undefined : false}
            >
              <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
                <div
                  className={`tw-flex tw-items-center tw-justify-center tw-rounded-full tw-transition-all ${
                    compact ? 'tw-h-6 tw-w-6' : 'tw-h-8 tw-w-8'
                  } ${style.dot}`}
                >
                  {step.status === 'done' ? (
                    <CheckCircleOutlined className={compact ? 'tw-text-[10px]' : 'tw-text-xs'} />
                  ) : step.status === 'waiting' ? (
                    <ClockCircleOutlined className={compact ? 'tw-text-[10px]' : 'tw-text-xs'} />
                  ) : (
                    <span className={`tw-font-bold ${compact ? 'tw-text-[10px]' : 'tw-text-xs'}`}>
                      {idx + 1}
                    </span>
                  )}
                </div>
                <span className={`tw-whitespace-nowrap tw-text-center ${compact ? 'tw-text-[10px]' : 'tw-text-xs'} ${style.text}`}>
                  {step.label}
                </span>
                {step.hint && step.status === 'current' && !compact ? (
                  <span className="tw-max-w-[120px] tw-text-center tw-text-[10px] tw-leading-tight tw-text-[#1e3a5f]/60">
                    {step.hint}
                  </span>
                ) : null}
              </div>
            </Tooltip>

            {/* Connector line */}
            {!isLast ? (
              <div className={`tw-mx-1.5 tw-flex tw-items-center ${compact ? 'tw-mx-1' : ''}`}>
                <div className={`tw-h-0.5 ${compact ? 'tw-w-4' : 'tw-w-8'} tw-rounded-full ${style.line}`} />
                <RightOutlined className={`tw-text-[8px] ${step.status === 'done' ? 'tw-text-emerald-400' : 'tw-text-slate-300'}`} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
