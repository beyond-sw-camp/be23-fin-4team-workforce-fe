/** 근태 상태 enum → 짧은 한글 태그 */
import { Tag } from 'antd';
import type { AttendanceStatusCode } from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  NORMAL: '정상',
  ABSENT: '결근',
  LEAVE: '휴가',
  HALF: '반차',
};

const STATUS_COLOR: Record<string, string> = {
  NORMAL: 'green',
  ABSENT: 'red',
  LEAVE: 'blue',
  HALF: 'gold',
};

type Props = {
  status?: AttendanceStatusCode | null;
};

export function AttendanceStatusTag({ status }: Props) {
  if (!status) return <span className="tw-text-slate-400">—</span>;
  const label = STATUS_KO[status] ?? status;
  const color = STATUS_COLOR[status] ?? 'default';
  return <Tag color={color}>{label}</Tag>;
}
