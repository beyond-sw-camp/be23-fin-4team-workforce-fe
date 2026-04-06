import { InboxOutlined } from '@ant-design/icons';
import { Card, Typography } from 'antd';

type Props = {
  title: string;
  description: string;
};

export function GenericPage({ title, description }: Props) {
  return (
    <Card className="tw-mx-auto tw-max-w-lg tw-border-dashed tw-border-slate-200 tw-bg-slate-50/40">
      <div className="tw-flex tw-flex-col tw-items-center tw-gap-4 tw-py-6 tw-text-center md:tw-py-10">
        <span className="tw-flex tw-size-14 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-white tw-shadow-sm">
          <InboxOutlined className="tw-text-3xl tw-text-slate-300" aria-hidden />
        </span>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          {title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-m-0 tw-max-w-md !tw-text-base">
          {description}
        </Typography.Paragraph>
      </div>
    </Card>
  );
}
