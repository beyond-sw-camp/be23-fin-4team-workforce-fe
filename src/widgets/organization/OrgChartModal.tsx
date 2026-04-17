import { useQuery } from '@tanstack/react-query';
import { Modal } from 'antd';
import { useEffect, useState } from 'react';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { useMemberChatOpener } from '@/widgets/app-shell/MemberChatOpener';
import { OrgChartMemberSidePanel } from '@/widgets/organization/OrgChartMemberSidePanel';
import { OrgChartPanel } from '@/widgets/organization/OrgChartPanel';

type MemberSelection = { id: string; chartMemberStatus?: string };

export function OrgChartModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openMemberChat } = useMemberChatOpener();
  const [memberSelection, setMemberSelection] = useState<MemberSelection | null>(null);

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
    <Modal
      title="조직도"
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(1120px, 98vw)"
      destroyOnHidden
      centered
      styles={{ body: { paddingTop: 12, paddingBottom: 16 } }}
    >
      <div className="tw-flex tw-max-h-[min(78vh,720px)] tw-min-h-[min(52vh,420px)] tw-gap-0 tw-overflow-hidden">
        <div className="tw-min-h-0 tw-min-w-0 tw-flex-1 tw-overflow-y-auto tw-pr-3">
          <OrgChartPanel
            data={data}
            loading={isLoading}
            fetchError={isError}
            onMemberSelect={(id, opts) => setMemberSelection({ id, chartMemberStatus: opts?.chartMemberStatus })}
            selectedMemberId={memberSelection?.id ?? null}
          />
        </div>
        <aside className="tw-flex tw-w-[min(100%,300px)] tw-shrink-0 tw-flex-col tw-overflow-y-auto tw-border-l tw-border-slate-200 tw-pl-4">
          <OrgChartMemberSidePanel
            memberId={memberSelection?.id ?? null}
            chartMemberStatus={memberSelection?.chartMemberStatus}
            onOpenMessenger={(targetMemberId) => openMemberChat({ directMemberId: targetMemberId })}
          />
        </aside>
      </div>
    </Modal>
  );
}
