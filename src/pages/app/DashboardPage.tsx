import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, Modal, Space, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import {
  ALL_DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_LABELS,
  loadDashboardWidgets,
  saveDashboardWidgets,
  widgetsForColumn,
  type DashboardWidgetId,
} from '@/features/dashboard/dashboardWidgetsModel';
import { renderDashboardWidget } from '@/features/dashboard/DashboardWidgetPanels';
import { AppButton } from '@/shared/ui/AppButton';

export function DashboardPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [enabledSet, setEnabledSet] = useState<Set<DashboardWidgetId>>(() => new Set(loadDashboardWidgets()));
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DashboardWidgetId[]>(() => loadDashboardWidgets());

  const openCustomize = useCallback(() => {
    setDraft(Array.from(enabledSet).sort((a, b) => ALL_DASHBOARD_WIDGET_IDS.indexOf(a) - ALL_DASHBOARD_WIDGET_IDS.indexOf(b)));
    setCustomOpen(true);
  }, [enabledSet]);

  const saveCustomize = useCallback(() => {
    if (draft.length === 0) {
      message.warning('최소 1개 이상의 블럭을 선택해 주세요.');
      return;
    }
    saveDashboardWidgets(draft);
    setEnabledSet(new Set(draft));
    setCustomOpen(false);
    message.success('대시보드 설정을 저장했습니다.');
  }, [draft, message]);

  const leftIds = useMemo(() => widgetsForColumn('left', enabledSet), [enabledSet]);
  const midIds = useMemo(() => widgetsForColumn('mid', enabledSet), [enabledSet]);
  const rightIds = useMemo(() => widgetsForColumn('right', enabledSet), [enabledSet]);

  const hasAny = leftIds.length + midIds.length + rightIds.length > 0;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
            <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
              대시보드
            </Typography.Title>
            <Button
              type="text"
              shape="circle"
              icon={<PlusOutlined />}
              aria-label="대시보드 블럭 설정"
              className="!tw-flex !tw-h-9 !tw-w-9 !tw-items-center !tw-justify-center !tw-text-blue-600 hover:!tw-bg-blue-50"
              onClick={openCustomize}
            />
          </div>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            주요 현황과 바로가기를 한곡에서 확인합니다. + 버튼으로 표시할 블럭을 선택할 수 있습니다.
          </Typography.Paragraph>
        </div>
      </div>

      {!hasAny ? (
        <Typography.Text type="secondary">
          표시된 블럭이 없습니다. + 를 눌러 블럭을 추가하세요.
        </Typography.Text>
      ) : (
        <div className="tw-flex tw-flex-col tw-gap-4 xl:tw-flex-row xl:tw-items-start">
          {leftIds.length > 0 ? (
            <div className="tw-flex tw-w-full tw-flex-col tw-gap-4 xl:tw-w-[300px] xl:tw-shrink-0">
              {leftIds.map((id) => renderDashboardWidget(id, user))}
            </div>
          ) : null}
          {midIds.length > 0 ? (
            <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-4">{midIds.map((id) => renderDashboardWidget(id, user))}</div>
          ) : null}
          {rightIds.length > 0 ? (
            <div className="tw-flex tw-w-full tw-flex-col tw-gap-4 xl:tw-w-[320px] xl:tw-shrink-0">
              {rightIds.map((id) => renderDashboardWidget(id, user))}
            </div>
          ) : null}
        </div>
      )}

      <Modal
        title="대시보드 블럭 설정"
        open={customOpen}
        onCancel={() => setCustomOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCustomOpen(false)}>
            취소
          </Button>,
          <AppButton key="save" type="primary" onClick={saveCustomize}>
            저장
          </AppButton>,
        ]}
        width={440}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-sm">
          표시할 위짯을 선택하세요. 설정은 이 기기에서만 저장됩니다.
        </Typography.Paragraph>
        <Checkbox.Group
          className="tw-flex tw-w-full tw-flex-col tw-gap-2"
          value={draft}
          onChange={(v) => setDraft(v as DashboardWidgetId[])}
        >
          {ALL_DASHBOARD_WIDGET_IDS.map((id) => (
            <Checkbox key={id} value={id} className="tw-ml-0">
              {DASHBOARD_WIDGET_LABELS[id]}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Modal>
    </Space>
  );
}
