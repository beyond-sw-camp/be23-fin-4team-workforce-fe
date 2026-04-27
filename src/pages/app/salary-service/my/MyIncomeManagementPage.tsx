/** /app/income — 소득관리 (직원 본인)
 *
 *  Phase 1 컨테이너 — 두 탭 자리만 잡아두고 준비 중 안내 표시
 *  - 은행 계좌 (Phase 3 예정)
 *  - 원천징수 세액 조정 (Phase 2 예정)
 */
import { Empty, Space, Tabs, Typography } from 'antd';
import { BankOutlined, PercentageOutlined } from '@ant-design/icons';

function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="tw-py-12">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Typography.Text strong>{title}</Typography.Text>
            <br />
            <Typography.Text type="secondary" className="tw-text-xs">
              {description}
            </Typography.Text>
          </div>
        }
      />
    </div>
  );
}

export function MyIncomeManagementPage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          소득관리
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          본인 급여 입금 계좌와 원천징수 세액 조정을 관리합니다
        </Typography.Paragraph>
      </div>

      <Tabs
        defaultActiveKey="bank-account"
        items={[
          {
            key: 'bank-account',
            label: (
              <span>
                <BankOutlined /> 은행 계좌
              </span>
            ),
            children: (
              <ComingSoon
                title="은행 계좌 관리는 준비 중입니다"
                description="다음 단계에서 급여 계좌 등록 / 변경 / 해지 기능이 추가됩니다"
              />
            ),
          },
          {
            key: 'withholding-tax',
            label: (
              <span>
                <PercentageOutlined /> 원천징수 세액 조정
              </span>
            ),
            children: (
              <ComingSoon
                title="원천징수 세액 조정은 준비 중입니다"
                description="다음 단계에서 80% / 100% / 120% 비율 신청 기능이 추가됩니다"
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
