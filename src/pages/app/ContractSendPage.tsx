import { useEffect } from 'react';
import { ContractAdminStatusPanel } from '@/features/contracts/ui/ContractAdminStatusPanel';
import { ContractTemplatesAdminPanel } from '@/features/contracts/ui/ContractTemplatesAdminPanel';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const WF_DEV_CONTRACT_SEND_MARK = '__WF_DEV_CONTRACT_SEND_PAGE__';

export function ContractSendPage() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, boolean>)[WF_DEV_CONTRACT_SEND_MARK] = true;
    // eslint-disable-next-line no-console -- 개발 시 올바른 탭/번들인지 확인용
    console.info(
      `[wf-dev] ContractSendPage 마운트됨. 브라우저 콘솔(이 탭)에서 확인하세요. window.${WF_DEV_CONTRACT_SEND_MARK} === true`,
    );
    return () => {
      Reflect.deleteProperty(window as unknown as Record<string, boolean>, WF_DEV_CONTRACT_SEND_MARK);
    };
  }, []);

  return (
    <div className="tw-box-border tw-w-full tw-space-y-4">
      <AppWorkspacePageTitle
        className="!tw-mb-0"
        eyebrow="Contracts"
        title="계약 발송"
        subtitle="전자계약 발송과 전체 계약/배치 현황을 함께 관리합니다."
      />
      {/* sendLayout="split": 발송 버튼은 모달 푸터 → AppDoubleActionModal onConfirm → submitSingleSend / submitBatchSend */}
      <ContractTemplatesAdminPanel showTemplateSection={false} sendLayout="split" />
      <ContractAdminStatusPanel hubLayout />
    </div>
  );
}
