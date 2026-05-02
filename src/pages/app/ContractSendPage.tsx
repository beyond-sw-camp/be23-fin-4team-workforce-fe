import { ContractAdminStatusPanel } from '@/features/contracts/ui/ContractAdminStatusPanel';
import { ContractTemplatesAdminPanel } from '@/features/contracts/ui/ContractTemplatesAdminPanel';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

export function ContractSendPage() {
  return (
    <div className="tw-box-border tw-flex tw-h-full tw-min-h-0 tw-w-full tw-flex-1 tw-flex-col tw-gap-3 tw-overflow-hidden">
      <div className="tw-shrink-0">
        <AppWorkspacePageTitle
          className="!tw-mb-0"
          eyebrow="Contracts"
          title="계약 발송"
          subtitle="전자계약 발송과 전체 계약/배치 현황을 함께 관리합니다."
        />
      </div>
      <div className="tw-min-h-0 tw-max-h-[min(28rem,46vh)] tw-shrink-0 tw-overflow-y-auto wf-scrollbar tw-pr-0.5">
        <ContractTemplatesAdminPanel showTemplateSection={false} sendLayout="split" />
      </div>
      <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden">
        <ContractAdminStatusPanel hubLayout />
      </div>
    </div>
  );
}
