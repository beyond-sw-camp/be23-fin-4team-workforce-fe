import { Tag } from 'antd';

type Props = { status: string };

export function AppStatusTag({ status }: Props) {
  const color = status === 'ACTIVE' ? 'green' : status === 'PENDING' ? 'gold' : 'default';
  return <Tag color={color}>{status}</Tag>;
}
