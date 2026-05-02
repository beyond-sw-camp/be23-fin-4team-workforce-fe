import { Space } from 'antd';
import { MyContractsPanel } from '@/features/contracts/ui/MyContractsPanel';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

export function ContractsPage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        className="!tw-mb-0"
        eyebrow="Contracts"
        title="내 계약"
        subtitle="내가 받은 전자계약 목록을 확인하고 상세 내용을 조회합니다."
      />
      <MyContractsPanel />
    </Space>
  );
}
