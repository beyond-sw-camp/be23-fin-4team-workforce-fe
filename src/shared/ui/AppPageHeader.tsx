import { Space, Typography } from 'antd';

type Props = {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
};

export function AppPageHeader({ title, subtitle, extra }: Props) {
  return (
    <div className="tw-mb-4 tw-flex tw-items-start tw-justify-between">
      <Space direction="vertical" size={0}>
        <Typography.Title level={4} className="!tw-mb-0">
          {title}
        </Typography.Title>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </Space>
      {extra}
    </div>
  );
}
