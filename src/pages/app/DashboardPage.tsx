import { DeleteOutlined, HolderOutlined, SettingOutlined } from '@ant-design/icons';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { App, Button, Space, Typography } from 'antd';
import { useCallback, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import {
  ALL_DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_LABELS,
  createDefaultDashboardLayout,
  createDashboardInstanceId,
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardColumnKey,
  type DashboardGridPreset,
  type DashboardLayout,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from '@/features/dashboard/dashboardWidgetsModel';
import { renderDashboardWidget } from '@/features/dashboard/DashboardWidgetPanels';
import { AppButton } from '@/shared/ui/AppButton';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const COLUMN_KEYS: DashboardColumnKey[] = ['left', 'mid', 'right'];
type DropContainerId = DashboardColumnKey | 'pool';

function itemsToColumns(items: DashboardLayoutItem[]): Record<DashboardColumnKey, DashboardLayoutItem[]> {
  return { left: items.filter((x) => x.column === 'left'), mid: items.filter((x) => x.column === 'mid'), right: items.filter((x) => x.column === 'right') };
}
function columnsToItems(columns: Record<DashboardColumnKey, DashboardLayoutItem[]>): DashboardLayoutItem[] {
  return COLUMN_KEYS.flatMap((col) => columns[col].map((item) => ({ ...item, column: col })));
}
function gridClassOf(preset: DashboardGridPreset): string {
  return preset === 'equal-3' ? 'xl:tw-grid-cols-3' : 'xl:tw-grid-cols-[1fr_2fr_1fr]';
}
function findContainer(columns: Record<DashboardColumnKey, DashboardLayoutItem[]>, id: string): DropContainerId | null {
  for (const col of COLUMN_KEYS) if (columns[col].some((x) => x.instanceId === id)) return col;
  if (id.startsWith('pool-')) return 'pool';
  return null;
}

/** DnD `over.id`가 컬럼 droppable이면 컬럼 키, 아니면 해당 카드가 속한 컨테이너 */
function dropTargetFromOverId(
  columns: Record<DashboardColumnKey, DashboardLayoutItem[]>,
  overId: string,
): DropContainerId | null {
  if ((COLUMN_KEYS as readonly string[]).includes(overId)) return overId as DashboardColumnKey;
  return findContainer(columns, overId);
}

function findWidgetIdByInstanceId(
  columns: Record<DashboardColumnKey, DashboardLayoutItem[]>,
  instanceId: string,
): DashboardWidgetId | null {
  for (const col of COLUMN_KEYS) {
    const found = columns[col].find((x) => x.instanceId === instanceId);
    if (found) return found.id;
  }
  return null;
}

function ViewWidgetCard({ item, user }: { item: DashboardLayoutItem; user: ReturnType<typeof useAuth>['user'] }) {
  return <div>{renderDashboardWidget(item.id, user)}</div>;
}

function SortablePoolCard({ id }: { id: DashboardWidgetId }) {
  const poolDragId = `pool-${id}`;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: poolDragId, data: { container: 'pool' } });
  const skeleton = (() => {
    if (id === 'profile') {
      return (
        <div className="tw-animate-pulse tw-space-y-2">
          <div className="tw-flex tw-items-center tw-gap-2">
            <div className="tw-h-7 tw-w-7 tw-rounded-full tw-bg-violet-200" />
            <div className="tw-space-y-1">
              <div className="tw-h-2 tw-w-14 tw-rounded tw-bg-violet-200" />
              <div className="tw-h-2 tw-w-10 tw-rounded tw-bg-violet-100" />
            </div>
          </div>
          <div className="tw-h-10 tw-rounded-md tw-bg-violet-100" />
        </div>
      );
    }
    if (id === 'calendar') {
      return (
        <div className="tw-animate-pulse tw-space-y-2">
          <div className="tw-h-2 tw-w-14 tw-rounded tw-bg-blue-200" />
          <div className="tw-grid tw-grid-cols-7 tw-gap-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={`cal-skeleton-${i}`} className="tw-h-3 tw-rounded tw-bg-blue-100" />
            ))}
          </div>
        </div>
      );
    }
    if (id === 'approvalInbox' || id === 'notifications') {
      return (
        <div className="tw-animate-pulse tw-space-y-2">
          <div className="tw-h-2 tw-w-20 tw-rounded tw-bg-violet-200" />
          <div className="tw-h-2 tw-w-full tw-rounded tw-bg-violet-100" />
          <div className="tw-h-2 tw-w-5/6 tw-rounded tw-bg-violet-100" />
          <div className="tw-h-2 tw-w-4/6 tw-rounded tw-bg-violet-100" />
        </div>
      );
    }
    if (id === 'attendance') {
      return (
        <div className="tw-animate-pulse tw-space-y-2">
          <div className="tw-h-3 tw-w-16 tw-rounded tw-bg-blue-200" />
          <div className="tw-h-6 tw-w-24 tw-rounded tw-bg-blue-100" />
          <div className="tw-h-2 tw-w-full tw-rounded tw-bg-blue-100" />
          <div className="tw-h-2 tw-w-2/3 tw-rounded tw-bg-blue-100" />
        </div>
      );
    }
    return (
      <div className="tw-animate-pulse tw-space-y-2">
        <div className="tw-grid tw-grid-cols-3 tw-gap-1.5">
          <div className="tw-h-8 tw-rounded-md tw-bg-violet-100" />
          <div className="tw-h-8 tw-rounded-md tw-bg-violet-100" />
          <div className="tw-h-8 tw-rounded-md tw-bg-violet-100" />
        </div>
        <div className="tw-h-2 tw-w-full tw-rounded tw-bg-violet-100" />
        <div className="tw-h-2 tw-w-3/4 tw-rounded tw-bg-violet-100" />
      </div>
    );
  })();
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className="tw-flex tw-w-56 tw-shrink-0 tw-flex-col tw-gap-2 tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-gradient-to-b tw-from-slate-50 tw-to-white tw-p-3 tw-transition hover:tw-border-blue-200 hover:tw-shadow-sm"
    >
      <div className="tw-flex tw-items-center tw-justify-between">
        <Typography.Text className="tw-text-xs tw-font-semibold">{DASHBOARD_WIDGET_LABELS[id]}</Typography.Text>
        <button type="button" className="tw-flex tw-cursor-grab tw-items-center tw-rounded-md tw-border-0 tw-bg-white tw-p-1 tw-text-slate-500 active:tw-cursor-grabbing" {...attributes} {...listeners}>
          <HolderOutlined />
        </button>
      </div>
      <div className="tw-h-24 tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-white tw-p-2">
        {skeleton}
      </div>
    </div>
  );
}

function SortableEditWidgetCard({
  item,
  onRemove,
  user,
}: {
  item: DashboardLayoutItem;
  onRemove: (instanceId: string) => void;
  user: ReturnType<typeof useAuth>['user'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.instanceId });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-white">
      <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-slate-100 tw-px-3 tw-py-2">
        <Typography.Text className="tw-text-xs tw-font-medium tw-text-slate-600">{DASHBOARD_WIDGET_LABELS[item.id]}</Typography.Text>
        <div className="tw-flex tw-items-center tw-gap-1">
          <button
            type="button"
            aria-label="위젯 제거"
            className="tw-flex tw-items-center tw-rounded-md tw-border-0 tw-bg-rose-50 tw-p-1 tw-text-rose-500 hover:tw-bg-rose-100"
            onClick={() => onRemove(item.instanceId)}
          >
            <DeleteOutlined />
          </button>
          <button type="button" aria-label="위젯 이동" className="tw-flex tw-cursor-grab tw-items-center tw-rounded-md tw-border-0 tw-bg-slate-100 tw-p-1 tw-text-slate-500 active:tw-cursor-grabbing" {...attributes} {...listeners}>
            <HolderOutlined />
          </button>
        </div>
      </div>
      <div className="tw-p-1 [&_.ant-card]:!m-0">{renderDashboardWidget(item.id, user)}</div>
    </div>
  );
}

function DroppableColumn({
  column,
  highlighted,
  children,
}: {
  column: DashboardColumnKey;
  highlighted?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <div
      ref={setNodeRef}
      className={`tw-min-h-56 tw-rounded-2xl tw-border tw-bg-white/70 tw-p-3 tw-transition ${
        highlighted || isOver ? 'tw-border-blue-400 tw-ring-2 tw-ring-blue-200 tw-shadow-sm' : 'tw-border-slate-200'
      }`}
    >
      {children}
    </div>
  );
}

function GridPresetSelector({
  value,
  onChange,
}: {
  value: DashboardGridPreset;
  onChange: (v: DashboardGridPreset) => void;
}) {
  const common =
    'tw-flex tw-h-10 tw-flex-1 tw-items-center tw-justify-center tw-gap-2 tw-rounded-lg tw-border-0 tw-transition';
  const active = 'tw-bg-blue-50 tw-text-blue-700 tw-shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]';
  const normal = 'tw-bg-white tw-text-slate-500 hover:tw-bg-slate-50';
  return (
    <div className="tw-flex tw-w-full tw-items-center tw-gap-1 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50/70 tw-p-1">
      <button
        type="button"
        aria-label="균등 3분할"
        className={`${common} ${value === 'equal-3' ? active : normal}`}
        onClick={() => onChange('equal-3')}
      >
        <svg width="32" height="16" viewBox="0 0 34 16" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="10.3" height="15" rx="2" stroke="currentColor" fill="currentColor" fillOpacity="0.18" />
          <rect x="11.9" y="0.5" width="10.3" height="15" rx="2" stroke="currentColor" fill="currentColor" fillOpacity="0.18" />
          <rect x="23.2" y="0.5" width="10.3" height="15" rx="2" stroke="currentColor" fill="currentColor" fillOpacity="0.18" />
        </svg>
        <span className="tw-text-[11px] tw-font-semibold">1:1:1</span>
      </button>
      <button
        type="button"
        aria-label="1:2:1 분할"
        className={`${common} ${value === 'ratio-121' ? active : normal}`}
        onClick={() => onChange('ratio-121')}
      >
        <svg width="32" height="16" viewBox="0 0 34 16" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="7.1" height="15" rx="2" stroke="currentColor" fill="currentColor" fillOpacity="0.18" />
          <rect x="8.7" y="0.5" width="16.6" height="15" rx="2" stroke="currentColor" fill="currentColor" fillOpacity="0.18" />
          <rect x="26.4" y="0.5" width="7.1" height="15" rx="2" stroke="currentColor" fill="currentColor" fillOpacity="0.18" />
        </svg>
        <span className="tw-text-[11px] tw-font-semibold">1:2:1</span>
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [layout, setLayout] = useState<DashboardLayout>(() => loadDashboardLayout());
  const [editing, setEditing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDropColumn, setActiveDropColumn] = useState<DashboardColumnKey | null>(null);
  const [draftPreset, setDraftPreset] = useState<DashboardGridPreset>(layout.preset);
  const [draftCols, setDraftCols] = useState<Record<DashboardColumnKey, DashboardLayoutItem[]>>(
    itemsToColumns(layout.items),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const startEdit = useCallback(() => {
    setDraftPreset(layout.preset);
    setDraftCols(itemsToColumns(layout.items));
    setEditing(true);
  }, [layout]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const clearAllDraft = useCallback(() => {
    setDraftCols({ left: [], mid: [], right: [] });
  }, []);

  const resetDraft = useCallback(() => {
    const base = createDefaultDashboardLayout();
    setDraftPreset(base.preset);
    setDraftCols(itemsToColumns(base.items));
    message.success('기본 대시보드 구성으로 초기화했습니다.');
  }, [message]);

  const saveEdit = useCallback(() => {
    const items = columnsToItems(draftCols);
    const next: DashboardLayout = { preset: draftPreset, items };
    saveDashboardLayout(next);
    setLayout(next);
    setEditing(false);
    message.success('대시보드 설정을 저장했습니다.');
  }, [draftCols, draftPreset, message]);

  const poolIds = ALL_DASHBOARD_WIDGET_IDS;
  const { setNodeRef: setPoolDropRef } = useDroppable({ id: 'pool' });

  const removeDraftWidget = useCallback((instanceId: string) => {
    setDraftCols((prev) => {
      const next = { ...prev };
      for (const col of COLUMN_KEYS) {
        next[col] = prev[col].filter((item) => item.instanceId !== instanceId);
      }
      return next;
    });
  }, []);

  const hasAny = layout.items.length > 0;
  const activeDragWidgetId =
    activeDragId == null
      ? null
      : activeDragId.startsWith('pool-')
        ? (activeDragId.replace(/^pool-/, '') as DashboardWidgetId)
        : findWidgetIdByInstanceId(draftCols, activeDragId);

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="My Workspace"
        title="대시보드"
        subtitle="주요 현황과 바로가기를 한곳에서 확인합니다. 우측 설정 버튼으로 위젯 편집 화면을 열 수 있습니다."
        rowClassName="tw-items-center"
        extra={
          editing ? (
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-1.5">
              <Button danger onClick={clearAllDraft}>
                전체 제거
              </Button>
              <Button onClick={resetDraft}>초기화</Button>
              <Button onClick={cancelEdit}>취소</Button>
              <AppButton type="primary" onClick={saveEdit}>
                저장
              </AppButton>
            </div>
          ) : (
            <Button
              type="text"
              icon={<SettingOutlined />}
              aria-label="대시보드 편집 열기"
              className="!tw-flex !tw-h-10 !tw-w-10 !tw-min-h-10 !tw-min-w-10 !tw-items-center !tw-justify-center !tw-rounded-xl !tw-border !tw-border-slate-200 !tw-bg-white !tw-text-slate-600 !tw-shadow-sm !tw-transition-all !tw-duration-200 hover:!tw-border-slate-300 hover:!tw-bg-slate-50 hover:!tw-text-slate-900 active:!tw-scale-95"
              onClick={startEdit}
            />
          )
        }
      />

      {!editing &&
        (!hasAny ? (
          <div className="tw-flex tw-min-h-[42vh] tw-flex-col tw-items-center tw-justify-center tw-gap-4">
            <Typography.Text type="secondary" className="tw-text-center tw-text-sm tw-leading-6">
              다양한 위젯을 추가하여 내 대시보드를 만들어 보세요!
            </Typography.Text>
            <Button
              icon={<SettingOutlined />}
              className="!tw-h-10 !tw-rounded-full !tw-border !tw-border-slate-300 !tw-bg-white !tw-px-5 !tw-text-[13px] !tw-font-medium !tw-text-slate-700 tw-shadow-sm hover:!tw-border-blue-300 hover:!tw-bg-blue-50 hover:!tw-text-blue-700"
              onClick={startEdit}
            >
              위젯 추가하기
            </Button>
          </div>
        ) : (
          <div className={`tw-grid tw-grid-cols-1 tw-items-start tw-gap-4 ${gridClassOf(layout.preset)}`}>
            {COLUMN_KEYS.map((col) => (
              <div key={col} className="tw-flex tw-min-h-10 tw-flex-col tw-gap-4">
                {layout.items.filter((x) => x.column === col).map((item) => (
                  <ViewWidgetCard key={item.instanceId} item={item} user={user} />
                ))}
              </div>
            ))}
          </div>
        ))}

      {editing ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => {
            setActiveDragId(String(active.id));
            setActiveDropColumn(null);
          }}
          onDragOver={({ active, over }) => {
            if (!over) {
              setActiveDropColumn(null);
              return;
            }
            const activeId = String(active.id);
            const overId = String(over.id);
            if (!activeId.startsWith('pool-')) {
              setActiveDropColumn(null);
              return;
            }
            const dropColumn = COLUMN_KEYS.includes(overId as DashboardColumnKey)
              ? (overId as DashboardColumnKey)
              : findContainer(draftCols, overId);
            setActiveDropColumn(dropColumn && dropColumn !== 'pool' ? dropColumn : null);
          }}
          onDragCancel={() => {
            setActiveDragId(null);
            setActiveDropColumn(null);
          }}
          onDragEnd={({ active, over }) => {
            setActiveDragId(null);
            setActiveDropColumn(null);
            if (!over) return;
            const activeId = String(active.id);
            const overId = String(over.id);
            setDraftCols((prev) => {
              const from = findContainer(prev, activeId);
              const to = dropTargetFromOverId(prev, overId);
              if (!from || !to) return prev;

              if (from === 'pool' && to === 'pool') return prev;

              if (from === 'pool' && to !== 'pool') {
                const target = [...prev[to]];
                const widgetId = activeId.replace(/^pool-/, '') as DashboardWidgetId;
                if (!(ALL_DASHBOARD_WIDGET_IDS as readonly string[]).includes(widgetId)) return prev;
                const overIndex = target.findIndex((x) => x.instanceId === overId);
                const insertIndex = overIndex >= 0 ? overIndex : target.length;
                target.splice(insertIndex, 0, {
                  instanceId: createDashboardInstanceId(widgetId),
                  id: widgetId,
                  column: to,
                });
                return { ...prev, [to]: target };
              }

              if (from !== 'pool' && to === 'pool') {
                return { ...prev, [from]: prev[from].filter((x) => x.instanceId !== activeId) };
              }

              if (from && to && from !== 'pool' && to !== 'pool') {
                if (from === to) {
                  const list = [...prev[from]];
                  const oldIndex = list.findIndex((x) => x.instanceId === activeId);
                  const newIndex = list.findIndex((x) => x.instanceId === overId);
                  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
                  return { ...prev, [from]: arrayMove(list, oldIndex, newIndex) };
                }
                const source = [...prev[from]];
                const target = [...prev[to]];
                const moving = source.find((x) => x.instanceId === activeId);
                if (!moving) return prev;
                const overIndex = target.findIndex((x) => x.instanceId === overId);
                source.splice(source.findIndex((x) => x.instanceId === activeId), 1);
                target.splice(overIndex >= 0 ? overIndex : target.length, 0, { ...moving, column: to });
                return { ...prev, [from]: source, [to]: target };
              }
              return prev;
            });
          }}
        >
          <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-3">
            <div className="tw-mb-3">
              <GridPresetSelector value={draftPreset} onChange={setDraftPreset} />
            </div>
            <div ref={setPoolDropRef} className="wf-scrollbar tw-flex tw-gap-3 tw-overflow-x-auto tw-pb-1">
              {poolIds.map((id) => <SortablePoolCard key={id} id={id} />)}
            </div>
          </div>
            <div className="tw-space-y-4 tw-rounded-2xl tw-border tw-border-dashed tw-border-blue-200 tw-bg-blue-50/30 tw-p-4">
              <Typography.Text className="tw-text-sm tw-text-slate-600">
                편집 모드: 상단 캐러셀에서 위젯을 끌어와 배치하고, 카드 삭제/순서 변경을 직접 조작할 수 있습니다.
              </Typography.Text>
              <div className={`tw-grid tw-grid-cols-1 tw-gap-4 ${gridClassOf(draftPreset)}`}>
                {COLUMN_KEYS.map((col) => (
                  <DroppableColumn key={col} column={col} highlighted={activeDropColumn === col}>
                    <SortableContext items={draftCols[col].map((x) => x.instanceId)} strategy={verticalListSortingStrategy}>
                      <div className="tw-flex tw-min-h-36 tw-flex-col tw-gap-3">
                        {draftCols[col].length === 0 ? (
                          <div className="tw-flex tw-h-32 tw-flex-col tw-items-center tw-justify-center tw-rounded-xl tw-border tw-border-dashed tw-border-slate-300 tw-bg-slate-50/80 tw-text-xs tw-text-slate-400">
                            <div className="tw-mb-1 tw-h-7 tw-w-7 tw-rounded-full tw-bg-white tw-text-center tw-text-base tw-leading-7 tw-text-blue-500">
                              +
                            </div>
                            여기로 위젯을 드래그하세요
                          </div>
                        ) : (
                          draftCols[col].map((item) => (
                            <SortableEditWidgetCard
                              key={item.instanceId}
                              item={item}
                              onRemove={removeDraftWidget}
                              user={user}
                            />
                          ))
                        )}
                      </div>
                    </SortableContext>
                  </DroppableColumn>
                ))}
              </div>

            </div>
            <DragOverlay dropAnimation={null}>
              {activeDragWidgetId ? (
                <div className="tw-w-56 tw-rounded-2xl tw-border tw-border-blue-200 tw-bg-white tw-p-3 tw-shadow-lg">
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-800">
                      {DASHBOARD_WIDGET_LABELS[activeDragWidgetId]}
                    </Typography.Text>
                    <HolderOutlined className="tw-text-slate-400" />
                  </div>
                  <div className="tw-mt-2 tw-h-16 tw-rounded-lg tw-border tw-border-dashed tw-border-blue-200 tw-bg-blue-50/60 tw-p-2 tw-text-[11px] tw-text-slate-500">
                    드래그 중...
                  </div>
                </div>
              ) : null}
            </DragOverlay>
        </DndContext>
      ) : null}
    </Space>
  );
}
