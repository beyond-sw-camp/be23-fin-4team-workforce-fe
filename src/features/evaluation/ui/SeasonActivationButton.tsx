import { App, Card, Tag, Tooltip } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { evaluationRedesignApi } from '../api/evaluationRedesignApi';
import { AppButton } from '@/shared/ui/AppButton';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { parseApiError } from '@/shared/api/error-parser';

type BlockedPayload = {
  inactiveMembers?: string[];
  weightShortageMembers?: string[];
  pendingBundleMembers?: string[];
  missingGoalsMembers?: string[];
};

type Props = {
  seasonId: string;
  disabled?: boolean;
  disabledTooltip?: string;
};

function parseLeadFailureMemberId(msg: string): string | null {
  const m = msg.match(/memberId\s*=\s*([0-9a-fA-F-]{36})/i);
  return m?.[1] ?? null;
}

export function SeasonActivationButton({ seasonId, disabled, disabledTooltip }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [blocked, setBlocked] = useState<BlockedPayload | null>(null);
  const [leadBlockMessage, setLeadBlockMessage] = useState<string | null>(null);

  const activateMut = useMutation({
    mutationFn: () => evaluationRedesignApi.activateSeason(seasonId),
    onSuccess: () => {
      message.success('평가를 시작했습니다.');
      queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['season-goal-readiness', seasonId] });
    },
    onError: (err: any) => {
      const status = err?.response?.status as number | undefined;
      const res = err?.response?.data;
      const payload = res?.data;
      const apiMsg = typeof res?.message === 'string' ? res.message : parseApiError(err).message;

      const isSeasonBlockedPayload =
        payload != null &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        ('inactiveMembers' in payload ||
          'weightShortageMembers' in payload ||
          'pendingBundleMembers' in payload ||
          'missingGoalsMembers' in payload);

      if (status === 422 && isSeasonBlockedPayload) {
        setBlocked({
          inactiveMembers: (payload as BlockedPayload).inactiveMembers ?? [],
          weightShortageMembers: (payload as BlockedPayload).weightShortageMembers ?? [],
          pendingBundleMembers: (payload as BlockedPayload).pendingBundleMembers ?? [],
          missingGoalsMembers: (payload as BlockedPayload).missingGoalsMembers ?? [],
        });
        return;
      }

      if (status === 422 && typeof apiMsg === 'string' && apiMsg.includes('Lead')) {
        setLeadBlockMessage(apiMsg);
        return;
      }

      message.error(apiMsg || '평가 시작에 실패했습니다.');
    },
  });

  const excludedCount = blocked?.inactiveMembers?.length ?? 0;
  const blockedCount =
    (blocked?.weightShortageMembers?.length ?? 0) +
    (blocked?.pendingBundleMembers?.length ?? 0) +
    (blocked?.missingGoalsMembers?.length ?? 0);

  const button = (
    <AppButton
      variant="primary"
      disabled={disabled}
      loading={activateMut.isPending}
      onClick={() => activateMut.mutate()}
    >
      평가 시작
    </AppButton>
  );

  return (
    <>
      {disabled && disabledTooltip ? (
        <Tooltip title={disabledTooltip}>
          <span className="tw-inline-flex tw-max-w-full">{button}</span>
        </Tooltip>
      ) : (
        button
      )}

      <Modal
        open={!!leadBlockMessage}
        onCancel={() => setLeadBlockMessage(null)}
        title="최종 검토자가 필요합니다"
        width={520}
        destroyOnHidden
        footer={
          <div className="tw-flex tw-justify-end">
            <AppButton variant="primary" onClick={() => setLeadBlockMessage(null)}>
              확인
            </AppButton>
          </div>
        }
      >
        {leadBlockMessage ? <LeadFailureBody message={leadBlockMessage} /> : null}
      </Modal>

      <Modal
        open={!!blocked}
        onCancel={() => setBlocked(null)}
        title="평가 시작 전 확인이 필요합니다"
        width={700}
        destroyOnHidden
        footer={
          <div className="tw-flex tw-justify-end">
            <AppButton variant="primary" onClick={() => setBlocked(null)}>
              확인
            </AppButton>
          </div>
        }
      >
        {blocked ? (
          <div className="tw-space-y-4">
            <div className="tw-grid tw-grid-cols-1 tw-gap-3 md:tw-grid-cols-2">
              <SummaryCard
                tone="slate"
                eyebrow="AUTO EXCLUDED"
                value={excludedCount}
                label="자동 제외 대상"
                description="퇴사, 휴직 등 이번 평가 대상에서 제외되는 구성원입니다."
              />
              <SummaryCard
                tone="rose"
                eyebrow="BLOCKERS"
                value={blockedCount}
                label="활성화 차단 대상"
                description="아래 이슈가 해결되어야 평가를 시작할 수 있습니다."
              />
            </div>

            <MemberSection label="자동 제외 대상" members={blocked.inactiveMembers} variant="slate" />
            <MemberSection label="가중치 100% 미충족" members={blocked.weightShortageMembers} variant="rose" />
            <MemberSection label="승인 대기 bundle 존재" members={blocked.pendingBundleMembers} variant="amber" />
            <MemberSection label="개인 목표 없음" members={blocked.missingGoalsMembers} variant="slate" />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function LeadFailureBody({ message }: { message: string }) {
  const memberId = parseLeadFailureMemberId(message);
  const { labelFor } = useMemberDisplayNames(memberId ? [memberId] : []);

  return (
    <div className="tw-space-y-3 tw-text-sm tw-text-slate-700">
      <p>
        평가를 시작하려면 최종 등급을 확정할 <strong>최종 검토자</strong>가 필요합니다. 해당 구성원의
        상급자 평가자를 지정한 뒤 다시 시작해 주세요.
      </p>
      {memberId ? (
        <div className="tw-rounded-xl tw-border tw-border-amber-100 tw-bg-amber-50 tw-px-3 tw-py-2 tw-text-xs">
          확인 대상: <span className="tw-font-medium tw-text-slate-800">{labelFor(memberId)}</span>
          <code className="tw-ml-2 tw-text-[10px] tw-text-slate-400">{memberId}</code>
        </div>
      ) : null}
      <details className="tw-text-xs tw-text-slate-400">
        <summary className="tw-cursor-pointer">원본 메시지</summary>
        <pre className="tw-mt-1 tw-whitespace-pre-wrap tw-break-all">{toUserFriendlyActivationMessage(message)}</pre>
      </details>
    </div>
  );
}

function toUserFriendlyActivationMessage(message: string) {
  return message
    .replaceAll('Lead evaluator', '최종 검토자')
    .replaceAll('Lead 평가자', '최종 검토자')
    .replaceAll('Lead', '최종 검토자')
    .replaceAll('DOWNWARD', '상급자 평가');
}

function SummaryCard({
  tone,
  eyebrow,
  value,
  label,
  description,
}: {
  tone: 'slate' | 'rose';
  eyebrow: string;
  value: number;
  label: string;
  description: string;
}) {
  const toneClass =
    tone === 'rose'
      ? 'tw-border-rose-200 tw-bg-rose-50/40 tw-text-rose-600'
      : 'tw-border-slate-200 tw-bg-slate-50 tw-text-slate-700';

  return (
    <Card className={`tw-rounded-2xl tw-border ${toneClass}`} styles={{ body: { padding: 16 } }}>
      <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide">{eyebrow}</div>
      <div className="tw-mt-1 tw-text-[28px] tw-font-bold tw-leading-none">{value}</div>
      <div className="tw-mt-2 tw-text-sm tw-font-semibold">{label}</div>
      <div className="tw-mt-1 tw-text-xs tw-text-slate-500">{description}</div>
    </Card>
  );
}

function MemberSection({
  label,
  members,
  variant,
}: {
  label: string;
  members?: string[];
  variant: 'rose' | 'amber' | 'slate';
}) {
  const ids = members ?? [];
  const { labelFor } = useMemberDisplayNames(ids);

  if (!members || members.length === 0) return null;

  const variantClass = {
    rose: 'tw-bg-rose-50 tw-text-rose-700 tw-border-rose-200',
    amber: 'tw-bg-amber-50 tw-text-amber-700 tw-border-amber-200',
    slate: 'tw-bg-slate-100 tw-text-slate-600 tw-border-slate-200',
  } as const;

  return (
    <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90" styles={{ body: { padding: 16 } }}>
      <div className="tw-mb-3 tw-flex tw-items-center tw-gap-2">
        <Tag bordered className={`!tw-m-0 !tw-rounded-full !tw-px-3 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold ${variantClass[variant]}`}>
          {label}
        </Tag>
        <span className="tw-text-sm tw-text-slate-500">{members.length}명</span>
      </div>
      <ul className="wf-scrollbar-modal tw-max-h-40 tw-space-y-1 tw-overflow-auto">
        {members.map((id) => (
          <li
            key={id}
            className="tw-flex tw-items-center tw-justify-between tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-sm"
          >
            <span className="tw-font-medium tw-text-slate-800">{labelFor(id)}</span>
            <code className="tw-text-[10px] tw-text-slate-400">{id.slice(0, 8)}..</code>
          </li>
        ))}
      </ul>
    </Card>
  );
}
