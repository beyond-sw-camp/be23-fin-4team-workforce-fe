/** 근태 상태 enum → 짧은 한글 태그
 *  AttendanceStatus 외에 workTripType (BUSINESS_TRIP / OUTSIDE_WORK) 도 함께 표시.
 *  status=NORMAL 이면 트립 우선, 그 외 휴가/반차/결근 라벨이 우선.
 */
import type { ReactNode } from 'react';
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
  /** 정규 출근 시각보다 늦게 출근한 경우 - 호출부에서 계산 */
  tardy?: boolean;
  /** 조퇴계 결재 승인된 경우 - DA.earlyLeaveExcusedYn === 'Y' */
  earlyLeave?: boolean;
};

export function AttendanceStatusTag({ status, workTripType, tardy, earlyLeave }: Props) {
  // 휴가/결근/반차가 우선 (status != NORMAL)
  if (status && status !== 'NORMAL') {
    const label = STATUS_KO[status] ?? status;
    const color = STATUS_COLOR[status] ?? 'default';
    return <Tag color={color}>{label}</Tag>;
  }
  // status === NORMAL or undefined - 지각/조퇴/출장/외근 태그 조합
  const tags: ReactNode[] = [];
  if (tardy) tags.push(<Tag key="tardy" color="orange">지각</Tag>);
  if (earlyLeave) tags.push(<Tag key="early" color="orange">조퇴</Tag>);
  if (workTripType === 'BUSINESS_TRIP') tags.push(<Tag key="trip" color="cyan">출장</Tag>);
  if (workTripType === 'OUTSIDE_WORK') tags.push(<Tag key="out" color="cyan">외근</Tag>);

  if (tags.length === 0) {
    if (status === 'NORMAL') return <Tag color="green">정상</Tag>;
    return <span className="tw-text-slate-400">—</span>;
  }
  // 지각/조퇴 있으면 정상 태그는 표시하지 않음
  return <span>{tags}</span>;
}
