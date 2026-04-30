import { App, Card, Modal, Space, Tag, Tooltip } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { evaluationRedesignApi } from '../api/evaluationRedesignApi';
import { AppButton } from '@/shared/ui/AppButton';
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
      message.success('시즌이 활성화되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
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

      message.error(apiMsg || '시즌 활성화에 실패했습니다.');
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
      시즌 활성화
    </AppButton>
  );

  const trigger =
    disabled && disabledTooltip ? (
      <Tooltip title={disabledTooltip}>
        <span className="tw-inline-flex tw-max-w-full">{button}</span>
      </Tooltip>
    ) : (
      button
    );

  return (
    <>
      {trigger}

      <Modal
        open={!!leadBlockMessage}
        onCancel={() => setLeadBlockMessage(null)}
        title={
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-amber-600">Lead</span>
            <span>평가 책임자를 확정할 수 없습니다</span>
          </div>
        }
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
        title={
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-rose-600">시즌 활성화 점검</span>
          </div>
        }
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
                description="휴직, 비활성, 중도 입사 등 정책상 이번 시즌 평가 대상에 포함되지 않는 구성원입니다."
              />
              <SummaryCard
                tone="rose"
                eyebrow="BLOCKERS"
                value={blockedCount}
                label="활성화 차단 대상"
                description="아래 사유가 해결되어야 시즌 활성화를 진행할 수 있습니다."
              />
            </div>

            <ExcludedSection
              label="자동 제외 대상"
              description="재직 상태 또는 입사일 기준으로 이번 시즌 평가 대상에서 제외됩니다."
              members={blocked.inactiveMembers}
            />

            <BlockedSection
              label="가중치 100% 미충족"
              members={blocked.weightShortageMembers}
              variant="rose"
            />
            <BlockedSection
              label="승인 대기 bundle 존재"
              members={blocked.pendingBundleMembers}
              variant="amber"
            />
            <BlockedSection
              label="KR 없음 또는 정렬/목표 누락"
              members={blocked.missingGoalsMembers}
              variant="slate"
            />
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
        응답을 생성하거나 확정하려면 최종 책임자인 <strong>Lead evaluator</strong> 가 필요합니다. 현재
        그룹 매핑이나 직속 상사 정보만으로는 Lead 를 확정할 수 없습니다.
      </p>
      <p className="tw-rounded-xl tw-border tw-border-amber-100 tw-bg-amber-50 tw-px-3 tw-py-2 tw-text-xs">
        해결 방법: 시즌 상세에서 그룹의 평가자 매핑을 열고, 해당 구성원에게 상급자(Downward) 평가자를 직접
        지정한 뒤 다시 활성화해 주세요.
      </p>
      {memberId ? (
        <div className="tw-text-xs tw-text-slate-500">
          확인이 필요한 대상: <span className="tw-font-medium tw-text-slate-800">{labelFor(memberId)}</span>
          <code className="tw-ml-2 tw-text-[10px] tw-text-slate-400">{memberId}</code>
        </div>
      ) : null}
      <details className="tw-text-xs tw-text-slate-400">
        <summary className="tw-cursor-pointer">원본 메시지</summary>
        <pre className="tw-mt-1 tw-whitespace-pre-wrap tw-break-all">{message}</pre>
      </details>
    </div>
  );
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

function ExcludedSection({
  label,
  description,
  members,
}: {
  label: string;
  description: string;
  members?: string[];
}) {
  const ids = useMemo(() => members ?? [], [members]);
  const { labelFor } = useMemberDisplayNames(ids);

  if (!members || members.length === 0) return null;

  return (
    <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90" styles={{ body: { padding: 16 } }}>
      <div className="tw-flex tw-items-center tw-gap-2 tw-mb-1">
        <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-3 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold !tw-text-slate-600">
          {label}
        </Tag>
        <span className="tw-text-sm tw-text-slate-500">{members.length}명</span>
      </div>
      <div className="tw-mb-3 tw-text-xs tw-text-slate-500">{description}</div>
      <ul className="tw-space-y-1 tw-max-h-40 tw-overflow-auto wf-scrollbar-modal">
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

function BlockedSection({
  label,
  members,
  variant,
}: {
  label: string;
  members?: string[];
  variant: 'rose' | 'amber' | 'slate';
}) {
  const ids = useMemo(() => members ?? [], [members]);
  const { labelFor } = useMemberDisplayNames(ids);

  if (!members || members.length === 0) return null;

  const variantClass = {
    rose: 'tw-bg-rose-50 tw-text-rose-700 tw-border-rose-200',
    amber: 'tw-bg-amber-50 tw-text-amber-700 tw-border-amber-200',
    slate: 'tw-bg-slate-100 tw-text-slate-600 tw-border-slate-200',
  } as const;

  return (
    <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90" styles={{ body: { padding: 16 } }}>
      <div className="tw-flex tw-items-center tw-gap-2 tw-mb-3">
        <Tag
          bordered
          className={
            '!tw-m-0 !tw-rounded-full !tw-px-3 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold ' +
            variantClass[variant]
          }
        >
          {label}
        </Tag>
        <span className="tw-text-sm tw-text-slate-500">{members.length}명</span>
      </div>
      <ul className="tw-space-y-1 tw-max-h-40 tw-overflow-auto wf-scrollbar-modal">
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
