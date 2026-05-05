import { useQuery } from '@tanstack/react-query';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { useCallback, useEffect, useState } from 'react';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { useMemberChatOpener } from '@/widgets/app-shell/MemberChatOpener';
import { OrgChartMemberSidePanel } from '@/widgets/organization/OrgChartMemberSidePanel';
import { OrgChartPanel } from '@/widgets/organization/OrgChartPanel';
import {
  type OrgChartViewSettings,
  OrgChartViewSettingsPopover,
} from '@/widgets/organization/OrgChartViewSettingsPopover';

type MemberSelection = { id: string; chartMemberStatus?: string };

/** v2: 제품 기본 뷰(트리=horizontal)가 예전 sessionStorage에 덮이지 않도록 키 분리 */
const STORAGE_LAYOUT = 'wf-org-chart-layout-v2';
const STORAGE_COUNT = 'wf-org-chart-member-count-v2';
const LEGACY_COUNT = 'wf-org-chart-member-count';
const LEGACY_LAYOUT = 'wf-org-chart-layout';

function readStoredViewSettings(): OrgChartViewSettings {
  let layoutDirection: OrgChartViewSettings['layoutDirection'] = 'horizontal';
  let memberCountMode: OrgChartViewSettings['memberCountMode'] = 'subtree';
  try {
    const l = sessionStorage.getItem(STORAGE_LAYOUT);
    if (l === 'horizontal' || l === 'vertical') layoutDirection = l;
    let c = sessionStorage.getItem(STORAGE_COUNT);
    if (c !== 'direct' && c !== 'subtree') {
      c = sessionStorage.getItem(LEGACY_COUNT);
    }
    if (c === 'direct' || c === 'subtree') memberCountMode = c;
  } catch {
    /* ignore */
  }
  return { layoutDirection, memberCountMode };
}

export function OrgChartModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openMemberChat } = useMemberChatOpener();
  const [memberSelection, setMemberSelection] = useState<MemberSelection | null>(null);
  const [viewSettings, setViewSettings] = useState<OrgChartViewSettings>(() => readStoredViewSettings());

  const persistViewSettings = useCallback((next: OrgChartViewSettings) => {
    setViewSettings(next);
    try {
      sessionStorage.setItem(STORAGE_LAYOUT, next.layoutDirection);
      sessionStorage.setItem(STORAGE_COUNT, next.memberCountMode);
      sessionStorage.removeItem(LEGACY_COUNT);
      sessionStorage.removeItem(LEGACY_LAYOUT);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) setMemberSelection(null);
  }, [open]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
    enabled: open,
  });

  return (
    <AppSingleActionModal
      title={
        <div className="tw-flex tw-w-full tw-min-w-0 tw-items-center tw-gap-2 tw-pr-2">
          <span className="tw-shrink-0 tw-text-base tw-font-semibold tw-text-slate-900">조직도</span>
          <div className="tw-flex tw-shrink-0 tw-items-center">
            <OrgChartViewSettingsPopover value={viewSettings} onChange={persistViewSettings} />
          </div>
        </div>
      }
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitText="닫기"
      width="min(1120px, 98vw)"
      customFooter={null}
      destroyOnHidden
    >
      <div className="tw-flex tw-max-h-[min(78vh,720px)] tw-min-h-[min(52vh,420px)] tw-gap-0 tw-overflow-hidden tw-px-5 tw-pb-4 tw-pt-3">
        <div className="tw-min-h-0 tw-min-w-0 tw-flex-1 tw-overflow-y-auto tw-pr-3">
          <OrgChartPanel
            data={data}
            loading={isLoading}
            fetchError={isError}
            layoutDirection={viewSettings.layoutDirection}
            memberCountMode={viewSettings.memberCountMode}
            onMemberSelect={(id, opts) => setMemberSelection({ id, chartMemberStatus: opts?.chartMemberStatus })}
            selectedMemberId={memberSelection?.id ?? null}
          />
        </div>
        <aside className="tw-flex tw-w-[min(100%,320px)] tw-shrink-0 tw-flex-col tw-overflow-y-auto tw-border-l tw-border-slate-200 tw-bg-slate-50/40 tw-pl-5 tw-pr-4 tw-pt-1">
          <OrgChartMemberSidePanel
            memberId={memberSelection?.id ?? null}
            chartMemberStatus={memberSelection?.chartMemberStatus}
            onOpenMessenger={(targetMemberId) => openMemberChat({ directMemberId: targetMemberId })}
            onClose={onClose}
          />
        </aside>
      </div>
    </AppSingleActionModal>
  );
}
