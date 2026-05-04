/** 근태 상태 enum → 짧은 한글 태그
 *  AttendanceStatus 외에 workTripType (BUSINESS_TRIP / OUTSIDE_WORK) 도 함께 표시.
 *  status=NORMAL 이면 트립 우선, 그 외 휴가/반차/결근 라벨이 우선.
 */
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

type WorkTripTypeCode = 'BUSINESS_TRIP' | 'OUTSIDE_WORK';

type Props = {
  status?: AttendanceStatusCode | null;
  workTripType?: WorkTripTypeCode | null;
};

export function AttendanceStatusTag({ status, workTripType }: Props) {
  // 휴가/결근/반차가 우선 (status != NORMAL)
  if (status && status !== 'NORMAL') {
    const label = STATUS_KO[status] ?? status;
    const color = STATUS_COLOR[status] ?? 'default';
    return <Tag color={color}>{label}</Tag>;
  }
  // 정상 출근 + 출장/외근 동시 표시
  if (workTripType === 'BUSINESS_TRIP') {
    return (
      <span>
        <Tag color="green">정상</Tag>
        <Tag color="cyan">출장</Tag>
      </span>
    );
  }
  if (workTripType === 'OUTSIDE_WORK') {
    return (
      <span>
        <Tag color="green">정상</Tag>
        <Tag color="cyan">외근</Tag>
      </span>
    );
  }
  // 정상만
  if (status === 'NORMAL') {
    return <Tag color="green">정상</Tag>;
  }
  return <span className="tw-text-slate-400">—</span>;
}
