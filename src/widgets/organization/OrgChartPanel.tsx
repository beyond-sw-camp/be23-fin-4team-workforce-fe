import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { Button, Input, Space, Spin, Tooltip, Typography } from 'antd';
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { PERFORMANCE_PAGE_KO } from '@/app/locale/app-ko';
import {
  type OrgChartData,
  type OrgChartOrgNode,
  ORG_CHART_HIDDEN_JOB_GRADE,
} from '@/features/organization/api/organizationApi';
import { OrgChartTreeHierarchy } from '@/widgets/organization/OrgChartTreeHierarchy';
import { OrgChartVerticalTree } from '@/widgets/organization/OrgChartVerticalTree';
import type {
  OrgChartLayoutDirection,
  OrgChartMemberCountMode,
} from '@/widgets/organization/OrgChartViewSettingsPopover';

function orgSubtreeMatchesQuery(node: OrgChartOrgNode, q: string): boolean {
  if (!q) return true;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  for (const m of node.members) {
    if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
    if (
      m.name.toLowerCase().includes(low) ||
      m.jobGradeName.toLowerCase().includes(low) ||
      (m.memberStatus ?? '').toLowerCase().includes(low)
    ) {
      return true;
    }
  }
  return node.children.some((c) => orgSubtreeMatchesQuery(c, q));
}

/** 이 노드 자체(조직명·직속 구성원)만 매칭 — 하위 조직 이름은 보지 않음 */
function orgNodeMatchesSelf(node: OrgChartOrgNode, q: string): boolean {
  if (!q) return true;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  for (const m of node.members) {
    if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
    if (
      m.name.toLowerCase().includes(low) ||
      m.jobGradeName.toLowerCase().includes(low) ||
      (m.memberStatus ?? '').toLowerCase().includes(low)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 검색 트리: 매칭된 경로만 남기되,
 * 조직명/직속 구성원이 직접 매칭된 노드 아래는 하위 조직을 잘라내지 않고 그대로 둔다.
 * (이전: 부모만 매칭돼도 자식을 재귀 필터해 ‘검색이 안 되는 것처럼’ 보이는 문제)
 */
function filterOrganizationsByQuery(nodes: OrgChartOrgNode[], q: string): OrgChartOrgNode[] {
  if (!q.trim()) return nodes;
  return nodes
    .filter((n) => orgSubtreeMatchesQuery(n, q))
    .map((n) => {
      const qTrim = q.trim();
      const nextChildren = orgNodeMatchesSelf(n, qTrim)
        ? n.children
        : filterOrganizationsByQuery(n.children, qTrim);
      return { ...n, children: nextChildren };
    });
}


const ORG_CHART_CANVAS_BG = 'tw-bg-slate-50';

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return Boolean(t.closest('button, a, input, textarea, select, [role="button"], [data-no-pan="true"]'));
}

export function OrgChartPanel({
  data,
  loading,
  fetchError,
  onMemberSelect,
  selectedMemberId,
  layoutDirection = 'horizontal',
  memberCountMode = 'subtree',
}: {
  data: OrgChartData | undefined;
  loading: boolean;
  fetchError: boolean;
  onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
  selectedMemberId?: string | null;
  layoutDirection?: OrgChartLayoutDirection;
  memberCountMode?: OrgChartMemberCountMode;
}) {
  const [orgSearch, setOrgSearch] = useState('');
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [verticalZoom, setVerticalZoom] = useState(1);
  const verticalViewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const prevLayoutDirectionRef = useRef(layoutDirection);

  const display = data ?? null;

  const organizationRoots = useMemo(() => display?.organizations ?? [], [display]);

  /** 옆으로(트리) 전용: 검색어로 필터 */
  const filteredRootsForTree = useMemo(
    () => filterOrganizationsByQuery(organizationRoots, orgSearch.trim()),
    [organizationRoots, orgSearch],
  );

  useEffect(() => {
    const onFullScreenChange = () => {
      setIsFullscreen(document.fullscreenElement === verticalViewportRef.current);
    };
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  useEffect(() => {
    if (prevLayoutDirectionRef.current === 'horizontal' && layoutDirection === 'vertical') {
      setVerticalZoom(1);
    }
    if (layoutDirection === 'vertical') {
      setOrgSearch('');
    }
    prevLayoutDirectionRef.current = layoutDirection;
  }, [layoutDirection]);

  useEffect(() => {
    if (layoutDirection !== 'vertical') return;
    const el = verticalViewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.08 : 1 / 1.08;
      setVerticalZoom((prev) => {
        const next = prev * factor;
        return Math.min(2.5, Math.max(0.35, next));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layoutDirection, organizationRoots.length]);

  useEffect(() => {
    if (!isPanning) return;
    const onMouseMove = (e: MouseEvent) => {
      const el = verticalViewportRef.current;
      const pan = panRef.current;
      if (!el || !pan) return;
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      el.scrollLeft = pan.scrollLeft - dx;
      el.scrollTop = pan.scrollTop - dy;
    };
    const onMouseUp = () => {
      setIsPanning(false);
      panRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isPanning]);

  const handleVerticalPanStart = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    const el = verticalViewportRef.current;
    if (!el) return;
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setIsPanning(true);
  };

  const toggleFullscreen = async () => {
    const el = verticalViewportRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  };

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" className="tw-w-full" size={12}>
        {fetchError && !loading ? (
          <Typography.Text type="danger">조직도를 불러오지 못했습니다.</Typography.Text>
        ) : !display ? (
          <Typography.Text type="secondary">{loading ? '' : '조직도 데이터가 없습니다.'}</Typography.Text>
        ) : (
          <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            {layoutDirection === 'horizontal' ? (
              <Input
                allowClear
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                placeholder={PERFORMANCE_PAGE_KO.orgSearchPlaceholder}
                className="!tw-mb-3 [&_.ant-input]:tw-rounded-lg"
              />
            ) : null}
            {organizationRoots.length === 0 ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                등록된 최상위 조직이 없습니다.
              </Typography.Text>
            ) : layoutDirection === 'horizontal' && filteredRootsForTree.length === 0 ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                검색 조건에 맞는 조직·구성원이 없습니다.
              </Typography.Text>
            ) : layoutDirection === 'horizontal' ? (
              <div
                className={`wf-scrollbar tw-overscroll-contain tw-max-h-[min(62vh,560px)] tw-min-h-[280px] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-100 ${ORG_CHART_CANVAS_BG}`}
              >
                <OrgChartTreeHierarchy
                  roots={filteredRootsForTree}
                  memberCountMode={memberCountMode ?? 'subtree'}
                  onMemberSelect={onMemberSelect}
                  selectedMemberId={selectedMemberId ?? null}
                />
              </div>
            ) : (
              <div className="tw-relative">
                <Tooltip title={isFullscreen ? '기본 보기' : '크게 보기'}>
                  <Button
                    type="text"
                    size="small"
                    className="!tw-absolute !tw-left-2 !tw-top-2 !tw-z-10 !tw-inline-flex !tw-h-8 !tw-w-8 !tw-items-center !tw-justify-center !tw-rounded-md !tw-border !tw-border-slate-200 !tw-bg-white/95 !tw-text-slate-600 hover:!tw-bg-white hover:!tw-text-slate-900"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? '기본 보기' : '크게 보기'}
                    data-no-pan="true"
                  >
                    {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  </Button>
                </Tooltip>
                <div
                  ref={verticalViewportRef}
                  onMouseDown={handleVerticalPanStart}
                  title="빈 곳을 드래그해 이동합니다. Ctrl 또는 Cmd + 마우스 휠로 확대·축소합니다."
                  className={`wf-scrollbar tw-overscroll-contain tw-max-h-[min(62vh,560px)] tw-min-h-[280px] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-100 tw-p-4 ${ORG_CHART_CANVAS_BG} ${isPanning ? 'tw-cursor-grabbing tw-select-none' : 'tw-cursor-grab'}`}
                >
                  <div
                    className="tw-inline-block tw-origin-top-left tw-will-change-transform"
                    style={{ transform: `scale(${verticalZoom})` }}
                  >
                    <OrgChartVerticalTree
                      roots={organizationRoots}
                      memberCountMode={memberCountMode ?? 'subtree'}
                      onMemberSelect={onMemberSelect}
                      selectedMemberId={selectedMemberId ?? null}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Space>
    </Spin>
  );
}
