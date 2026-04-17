/**
 * GoalActionBar — 목표 상태에 따른 "다음 할 일" CTA(Call-to-Action) 바.
 *
 * 모달 내부가 아닌, 목표 상세 패널 상단에 고정 배치되어
 * 사용자가 즉시 다음 액션을 취할 수 있게 합니다.
 */
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  SendOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Button, Popconfirm, Tag } from 'antd';
import type { GoalApprovalPolicy } from '@/features/goals/model/types';

export type GoalActionBarProps = {
  goalStatus: string;
  approvalFlowStatus: string;
  approvalPolicy: GoalApprovalPolicy;
  isOwner: boolean;
  canUpdate: boolean;
  // 콜백들
  onActivate: () => void;
  onRequestActivationApproval: () => void;
  onRequestCompletionApproval: () => void;
  onDirectComplete: () => void;
  onCancel: () => void;
  // 로딩 상태
  activateLoading?: boolean;
  activationApprovalLoading?: boolean;
  completionApprovalLoading?: boolean;
  directCompleteLoading?: boolean;
  cancelLoading?: boolean;
};

type ActionConfig = {
  type: 'primary' | 'default' | 'warning' | 'info';
  icon: React.ReactNode;
  label: string;
  description: string;
  buttonLabel: string;
  buttonColor: string;
  onClick: () => void;
  loading?: boolean;
  needsConfirm?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
};

export function GoalActionBar(props: GoalActionBarProps) {
  const {
    goalStatus: rawStatus,
    approvalFlowStatus: rawApproval,
    approvalPolicy,
    isOwner,
    canUpdate,
  } = props;

  const status = (rawStatus ?? '').toUpperCase();
  const approval = (rawApproval ?? 'NOT_REQUESTED').toUpperCase();
  const needsActivation = approvalPolicy === 'ACTIVATION_ONLY' || approvalPolicy === 'BOTH';
  const needsCompletion = approvalPolicy === 'COMPLETION_ONLY' || approvalPolicy === 'BOTH';
  const canAct = isOwner || canUpdate;

  const action = resolveAction();
  if (!action) return null;

  function resolveAction(): ActionConfig | null {
    // ── DRAFT 상태 ──
    if (status === 'DRAFT' && canUpdate) {
      if (needsActivation) {
        if (approval === 'PENDING') {
          return {
            type: 'info',
            icon: <ClockCircleOutlined />,
            label: '활성화 승인 대기 중',
            description: '승인자가 검토 중입니다. 승인되면 자동으로 진행이 시작됩니다.',
            buttonLabel: '승인센터에서 확인',
            buttonColor: '!tw-bg-amber-500 hover:!tw-bg-amber-600',
            onClick: () => {},
            loading: false,
          };
        }
        if (approval === 'REJECTED') {
          return {
            type: 'warning',
            icon: <ExclamationCircleOutlined />,
            label: '활성화 승인 반려됨',
            description: '승인이 반려되었습니다. 목표를 수정한 후 다시 승인 요청하세요.',
            buttonLabel: '다시 승인 요청',
            buttonColor: '!tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]',
            onClick: props.onRequestActivationApproval,
            loading: props.activationApprovalLoading,
          };
        }
        return {
          type: 'primary',
          icon: <SendOutlined />,
          label: '활성화 승인이 필요합니다',
          description: '이 목표의 KPI 템플릿은 활성화 전 상위자 승인을 요구합니다.',
          buttonLabel: '활성화 승인 요청',
          buttonColor: '!tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]',
          onClick: props.onRequestActivationApproval,
          loading: props.activationApprovalLoading,
        };
      }
      // 승인 불필요
      return {
        type: 'primary',
        icon: <PlayCircleOutlined />,
        label: '진행을 시작할 수 있습니다',
        description: '목표를 활성화하면 진행률 업데이트를 시작할 수 있어요.',
        buttonLabel: '진행 시작',
        buttonColor: '!tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]',
        onClick: props.onActivate,
        loading: props.activateLoading,
      };
    }

    // ── ACTIVE 상태 ──
    if (status === 'ACTIVE' && canAct) {
      if (needsCompletion) {
        if (approval === 'PENDING') {
          return {
            type: 'info',
            icon: <ClockCircleOutlined />,
            label: '종료 승인 대기 중',
            description: '승인자가 완료 근거를 검토 중입니다. 승인되면 자동으로 목표가 종료됩니다.',
            buttonLabel: '승인센터에서 확인',
            buttonColor: '!tw-bg-amber-500 hover:!tw-bg-amber-600',
            onClick: () => {},
            loading: false,
          };
        }
        if (approval === 'REJECTED') {
          return {
            type: 'warning',
            icon: <ExclamationCircleOutlined />,
            label: '종료 승인 반려됨',
            description: '보완이 필요합니다. 증거 자료를 수정한 후 다시 제출하세요.',
            buttonLabel: '보완 재제출',
            buttonColor: '!tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]',
            onClick: props.onRequestCompletionApproval,
            loading: props.completionApprovalLoading,
          };
        }
        return {
          type: 'primary',
          icon: <SendOutlined />,
          label: '종료 승인이 필요합니다',
          description: '목표를 완료하려면 증거 자료와 함께 종료 승인을 요청하세요.',
          buttonLabel: '종료 승인 요청',
          buttonColor: '!tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]',
          onClick: props.onRequestCompletionApproval,
          loading: props.completionApprovalLoading,
        };
      }
      // 승인 불필요
      return {
        type: 'primary',
        icon: <CheckCircleOutlined />,
        label: '바로 완료할 수 있습니다',
        description: '이 목표는 종료 승인 없이 직접 완료 처리할 수 있어요.',
        buttonLabel: '바로 완료',
        buttonColor: '!tw-bg-emerald-600 hover:!tw-bg-emerald-700',
        onClick: props.onDirectComplete,
        loading: props.directCompleteLoading,
        needsConfirm: true,
        confirmTitle: '목표를 완료 처리할까요?',
        confirmDescription: '완료 후에는 진행률 업데이트를 할 수 없습니다.',
      };
    }

    // ── COMPLETED 상태 ──
    if (status === 'COMPLETED') {
      return {
        type: 'info',
        icon: <CheckCircleOutlined />,
        label: '완료된 목표',
        description: '이 목표는 정상적으로 완료되었습니다.',
        buttonLabel: '',
        buttonColor: '',
        onClick: () => {},
      };
    }

    // ── CANCELLED ──
    if (status === 'CANCELLED') {
      return {
        type: 'info',
        icon: <StopOutlined />,
        label: '취소된 목표',
        description: '이 목표는 취소되었습니다.',
        buttonLabel: '',
        buttonColor: '',
        onClick: () => {},
      };
    }

    return null;
  }

  const bgMap = {
    primary: 'tw-border-[#1e3a5f]/20 tw-bg-[#1e3a5f]/5',
    info: 'tw-border-amber-200 tw-bg-amber-50/60',
    warning: 'tw-border-rose-200 tw-bg-rose-50/60',
    default: 'tw-border-slate-200 tw-bg-slate-50/60',
  };

  const ActionButton = action.buttonLabel ? (
    action.needsConfirm ? (
      <Popconfirm
        title={action.confirmTitle}
        description={action.confirmDescription}
        onConfirm={action.onClick}
        okText="확인"
        cancelText="취소"
        okButtonProps={{ loading: action.loading }}
      >
        <Button
          type="primary"
          icon={action.icon}
          loading={action.loading}
          className={`!tw-rounded-lg !tw-font-semibold ${action.buttonColor}`}
        >
          {action.buttonLabel}
        </Button>
      </Popconfirm>
    ) : (
      <Button
        type="primary"
        icon={action.icon}
        loading={action.loading}
        onClick={action.onClick}
        className={`!tw-rounded-lg !tw-font-semibold ${action.buttonColor}`}
      >
        {action.buttonLabel}
      </Button>
    )
  ) : null;

  return (
    <div className={`tw-flex tw-items-center tw-justify-between tw-gap-4 tw-rounded-xl tw-border tw-px-4 tw-py-3 ${bgMap[action.type]}`}>
      <div className="tw-min-w-0 tw-flex-1">
        <div className="tw-flex tw-items-center tw-gap-2">
          <span className="tw-text-sm tw-font-bold tw-text-slate-800">{action.label}</span>
          {action.type === 'warning' ? <Tag color="red" className="!tw-m-0 !tw-text-[10px]">반려</Tag> : null}
          {action.type === 'info' && approval === 'PENDING' ? <Tag color="orange" className="!tw-m-0 !tw-text-[10px]">대기 중</Tag> : null}
        </div>
        <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">{action.description}</div>
      </div>
      {ActionButton}
    </div>
  );
}
