import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar } from 'antd';
import clsx from 'clsx';
import { useState } from 'react';
import type { OrgChartOrgNode } from '@/features/organization/api/organizationApi';
import { orgMemberCount, visibleOrgMembers } from '@/widgets/organization/orgChartCounts';
import type { OrgChartMemberCountMode } from '@/widgets/organization/OrgChartViewSettingsPopover';

const WIRE = '#cbd5e1';
const WIRE_STROKE = 1.5;

/** 카드 본문 너비(px) — 아래 `ORG_CARD_WIDTH_CLASS`의 288과 동일 */
const ORG_CARD_PX = 288;
/** 자식 열 사이 간격 — 아래 자식 행 `tw-gap-10`과 반드시 동일(px) */
const ORG_CHILD_GAP_PX = 40;

/** 모든 깊이에서 동일 카드 너비; 열(서브트리) 래퍼는 `subtreeLayoutWidth`로 별도 지정 */
const ORG_CARD_WIDTH_CLASS = 'tw-w-[288px] tw-min-w-[288px] tw-max-w-[288px] tw-shrink-0';

/** 서브트리가 차지하는 최소 가로 너비(형제 간 gap 포함). 카드보다 좁아지지 않음 */
function subtreeLayoutWidth(org: OrgChartOrgNode): number {
  if (org.children.length === 0) return ORG_CARD_PX;
  const childW = org.children.map(subtreeLayoutWidth);
  const row =
    childW.reduce((a, b) => a + b, 0) + (org.children.length - 1) * ORG_CHILD_GAP_PX;
  return Math.max(ORG_CARD_PX, row);
}

/** 자식 열 중심 x(px), 부모 자식 행 기준 왼쪽 0 */
function childColumnCentersPx(org: OrgChartOrgNode): number[] {
  const centers: number[] = [];
  let x = 0;
  for (let i = 0; i < org.children.length; i++) {
    const w = subtreeLayoutWidth(org.children[i]);
    centers.push(x + w / 2);
    x += w + (i < org.children.length - 1 ? ORG_CHILD_GAP_PX : 0);
  }
  return centers;
}

function branchPathDPixel(totalWidth: number, childCenters: number[]): string {
  if (childCenters.length === 0) return '';
  const parentCx = totalWidth / 2;
  const yBar = 10;
  const yBottom = 36;
  if (childCenters.length === 1) {
    return `M ${parentCx} 0 L ${parentCx} ${yBottom}`;
  }
  const minX = Math.min(parentCx, ...childCenters);
  const maxX = Math.max(parentCx, ...childCenters);
  let d = `M ${parentCx} 0 L ${parentCx} ${yBar} L ${minX} ${yBar} L ${maxX} ${yBar}`;
  for (const cx of childCenters) {
    d += ` M ${cx} ${yBar} L ${cx} ${yBottom}`;
  }
  return d;
}

function StemSegment() {
  return (
    <svg width="3" height="12" viewBox="0 0 3 12" className="tw-shrink-0 tw-text-slate-300" aria-hidden>
      <line x1="1.5" y1="0" x2="1.5" y2="12" stroke="currentColor" strokeWidth={WIRE_STROKE} strokeLinecap="round"/>
    </svg>
  );
}

type OrgChartVerticalTreeProps = {
  roots: OrgChartOrgNode[];
  memberCountMode: OrgChartMemberCountMode;
  onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
  selectedMemberId?: string | null;
};

function OrgCard({
  org,
  memberCountMode,
  onMemberSelect,
  selectedMemberId,
}: {
  org: OrgChartOrgNode;
  memberCountMode: OrgChartMemberCountMode;
  onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
  selectedMemberId?: string | null;
}) {
  const members = visibleOrgMembers(org.members);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const memberCount = orgMemberCount(org, memberCountMode);

  const hasSelectionInCard = members.some((m) => m.memberId === selectedMemberId);

  return (
    <div
      className={clsx(
        ORG_CARD_WIDTH_CLASS,
        'tw-rounded-xl tw-border tw-bg-white tw-p-4 tw-text-left tw-shadow-sm tw-transition-[border-color,box-shadow] hover:tw-border-slate-300',
        hasSelectionInCard ? 'tw-border-slate-400 tw-ring-1 tw-ring-slate-200/80' : 'tw-border-slate-200',
      )}
    >
      <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-truncate tw-text-lg tw-font-bold tw-leading-snug tw-tracking-tight tw-text-slate-900">
            {org.name}
          </div>
        </div>
        {members.length > 0 ? (
          <button
            type="button"
            className="tw-shrink-0 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-2.5 tw-py-1 tw-text-xs tw-font-semibold tw-text-slate-700 tw-shadow-sm tw-transition-colors hover:tw-border-slate-300 hover:tw-bg-white"
            onClick={() => setMembersExpanded((v) => !v)}
            aria-expanded={membersExpanded}
          >
            {membersExpanded ? '구성원 접기' : '구성원 보기'}
          </button>
        ) : null}
      </div>

      <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
        <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-rounded-md tw-bg-slate-100 tw-px-2 tw-py-1 tw-text-xs tw-font-medium tw-tabular-nums tw-text-slate-700">
          <UserOutlined className="tw-text-[13px] tw-text-slate-500" aria-hidden />
          <span className="tw-text-slate-500">표시 인원</span>
          <span className="tw-font-semibold tw-text-slate-900">{memberCount}</span>
        </span>
        <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-rounded-md tw-bg-slate-100 tw-px-2 tw-py-1 tw-text-xs tw-font-medium tw-tabular-nums tw-text-slate-700">
          <TeamOutlined className="tw-text-[13px] tw-text-slate-500" aria-hidden />
          <span className="tw-text-slate-500">직속</span>
          <span className="tw-font-semibold tw-text-slate-900">{members.length}</span>
        </span>
      </div>

      {members.length > 0 && membersExpanded ? (
        <div className="tw-mt-3 tw-space-y-1 tw-border-t tw-border-slate-100 tw-pt-2">
          {members.map((m) => {
            const selected = selectedMemberId === m.memberId;
            const content = (
              <>
                <Avatar
                  size={20}
                  src={m.profileUrl?.trim() || undefined}
                  className="tw-shrink-0 tw-bg-slate-200 tw-text-[10px] tw-font-semibold tw-text-slate-700"
                >
                  {(m.name[0] ?? '?').toUpperCase()}
                </Avatar>
                <span className="tw-min-w-0 tw-truncate tw-text-[12px] tw-font-medium tw-text-slate-700">{m.name}</span>
                <span className="tw-shrink-0 tw-text-[11px] tw-text-slate-500">{m.jobGradeName}</span>
              </>
            );
            if (onMemberSelect) {
              return (
                <button
                  key={m.memberId}
                  type="button"
                  className={clsx(
                    'tw-flex tw-w-full tw-items-center tw-gap-1.5 tw-rounded-md tw-border-0 tw-px-1.5 tw-py-1 tw-text-left tw-transition-colors',
                    selected ? 'tw-bg-[#eff6ff]' : 'hover:tw-bg-slate-50',
                  )}
                  onClick={() => onMemberSelect(m.memberId, { chartMemberStatus: m.memberStatus })}
                >
                  {content}
                </button>
              );
            }
            return (
              <div key={m.memberId} className="tw-flex tw-w-full tw-items-center tw-gap-1.5 tw-rounded-md tw-px-1.5 tw-py-1">
                {content}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function VerticalOrgNode({
  org,
  memberCountMode,
  onMemberSelect,
  selectedMemberId,
}: {
  org: OrgChartOrgNode;
  memberCountMode: OrgChartMemberCountMode;
  onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
  selectedMemberId?: string | null;
}) {
  const childCount = org.children.length;
  const hasChildren = childCount > 0;
  const layoutW = subtreeLayoutWidth(org);
  const childCenters = hasChildren ? childColumnCentersPx(org) : [];
  const branchD = hasChildren ? branchPathDPixel(layoutW, childCenters) : '';

  return (
    <div
      className="tw-flex tw-min-w-[288px] tw-flex-col tw-items-center tw-shrink-0"
      style={{ width: layoutW }}
    >
      <OrgCard
        org={org}
        memberCountMode={memberCountMode}
        onMemberSelect={onMemberSelect}
        selectedMemberId={selectedMemberId}
      />

      {hasChildren ? (
        <>
          <div className="tw-mt-1 tw-flex tw-flex-col tw-items-center">
            <StemSegment />
            <div className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-full tw-bg-emerald-500 tw-px-3 tw-py-0.5 tw-text-[11px] tw-font-semibold tw-text-white">
              <span>{childCount}</span>
              <span className="tw-text-[9px]">▼</span>
            </div>
            <StemSegment />
          </div>

          <div
            className="tw-relative tw-mt-2 tw-flex tw-flex-nowrap tw-justify-center tw-gap-10 tw-pt-9"
            style={{ width: layoutW }}
          >
            <svg
              className="tw-pointer-events-none tw-absolute tw-left-0 tw-top-0 tw-overflow-visible"
              width={layoutW}
              height={40}
              viewBox={`0 0 ${layoutW} 40`}
              aria-hidden
            >
              <path
                d={branchD}
                fill="none"
                stroke={WIRE}
                strokeWidth={WIRE_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {org.children.map((child) => (
              <div
                key={child.organizationId}
                className="tw-relative tw-z-[1] tw-flex tw-shrink-0 tw-flex-col tw-items-center tw-pt-1"
                style={{ width: subtreeLayoutWidth(child) }}
              >
                <VerticalOrgNode
                  org={child}
                  memberCountMode={memberCountMode}
                  onMemberSelect={onMemberSelect}
                  selectedMemberId={selectedMemberId}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function OrgChartVerticalTree({
  roots,
  memberCountMode,
  onMemberSelect,
  selectedMemberId,
}: OrgChartVerticalTreeProps) {
  if (!roots.length) return null;

  return (
    <div className="tw-flex tw-min-w-max tw-items-start tw-justify-center tw-gap-14 tw-px-4 tw-py-4">
      {roots.map((root) => (
        <VerticalOrgNode
          key={root.organizationId}
          org={root}
          memberCountMode={memberCountMode}
          onMemberSelect={onMemberSelect}
          selectedMemberId={selectedMemberId}
        />
      ))}
    </div>
  );
}
