import {
  Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert,
  Button,
  Card,
  Space,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import type { EsgActivity, EsgShopOrder, EsgSubject } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  esgCardLinkButtonClass,
  esgLinkTextClass,
  esgMetricCardStyles,
  esgModalContentClass,
  esgSurfaceCardClass,
  esgSurfaceCardStyles,
  esgTableLinkClass,
} from '@/features/esg/esgUiTokens';
import { EsgActivitySubmitModal } from '@/features/esg/ui/EsgActivitySubmitModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { AppDataTable } from '@/shared/ui/AppDataTable';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

import {
  formatActivityDateTime,
  formatActivityStatusKo,
  pickActivityId,
  resolveActivityApprovedAt,
  resolveActivityCategoryDisplay,
  resolveActivityCreatedAt,
  resolveActivityFileUrl,
  resolveActivitySubjectTitle,
  resolveEarnedPointsDisplay,
  resolveRejectReasonDisplay,
  resolveVerificationContent,
} from '@/features/esg/esgActivityDisplay';

const SUBJECT_CAT_KO: Record<string, string> = { E: '환경(E)', S: '사회(S)', G: '지배구조(G)' };
const PREVIEW_ROWS = 5;

type EsgHomeModal = 'subjects' | 'activities' | 'orders' | null;

function sortActivitiesNewestFirst(rows: EsgActivity[]): EsgActivity[] {
  return [...rows].sort((a, b) => {
    const ta = dayjs(String(resolveActivityCreatedAt(a) ?? '')).valueOf();
    const tb = dayjs(String(resolveActivityCreatedAt(b) ?? '')).valueOf();
    return tb - ta;
  });
}

function sortOrdersNewestFirst(rows: EsgShopOrder[]): EsgShopOrder[] {
  return [...rows].sort((a, b) => {
    const ta = dayjs(String(a.createdAt ?? '')).valueOf();
    const tb = dayjs(String(b.createdAt ?? '')).valueOf();
    return tb - ta;
  });
}

export function EsgHomePage() {
  const { user } = useAuth();
  const [modal, setModal] = useState<EsgHomeModal>(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitModalSubjectId, setSubmitModalSubjectId] = useState<string | undefined>(undefined);

  const openActivitySubmitModal = useCallback((subjectId?: string) => {
    setSubmitModalSubjectId(subjectId);
    setSubmitModalOpen(true);
    setModal(null);
  }, []);

  const closeActivitySubmitModal = useCallback(() => {
    setSubmitModalOpen(false);
    setSubmitModalSubjectId(undefined);
  }, []);

  const { data: cfg } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
  });

  const esgOn = cfg?.esgEnabledYn === 'YES';

  const { data: balance } = useQuery({
    queryKey: ['esg', 'points', 'balance'],
    queryFn: () => esgApi.getPointBalance(),
    enabled: esgOn,
  });

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ['esg', 'subjects'],
    queryFn: () => esgApi.listSubjects(),
    enabled: esgOn,
  });

  const { data: mine = [], isLoading: mineLoading } = useQuery({
    queryKey: ['esg', 'activities', 'my'],
    queryFn: () => esgApi.listMyActivities(),
    enabled: esgOn,
  });

  const { data: myOrders = [], isLoading: myOrdersLoading } = useQuery({
    queryKey: ['esg', 'shop', 'orders', 'my'],
    queryFn: () => esgApi.listMyOrders(),
    enabled: esgOn,
  });

  const pts = balance ?? undefined;

  const subjectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjects) {
      if (s.subjectId.trim() !== '') {
        m.set(s.subjectId, s.title || '(제목 없음)');
      }
    }
    return m;
  }, [subjects]);

  const activitiesSorted = useMemo(() => sortActivitiesNewestFirst(mine), [mine]);
  const ordersSorted = useMemo(() => sortOrdersNewestFirst(myOrders), [myOrders]);

  const recentSubjects = useMemo(() => subjects.slice(0, PREVIEW_ROWS), [subjects]);
  const recentActivities = useMemo(() => activitiesSorted.slice(0, PREVIEW_ROWS), [activitiesSorted]);
  const recentOrders = useMemo(() => ordersSorted.slice(0, PREVIEW_ROWS), [ordersSorted]);

  const subjectColumns: ColumnsType<EsgSubject> = useMemo(
    () => [
      {
        title: '제목',
        dataIndex: 'title',
        ellipsis: true,
        render: (text: unknown, row) => (
          <Typography.Link className={esgTableLinkClass} onClick={() => openActivitySubmitModal(row.subjectId)}>
            {typeof text === 'string' && text.trim() ? text.trim() : '(제목 없음)'}
          </Typography.Link>
        ),
      },
      {
        title: '분류',
        dataIndex: 'category',
        width: 120,
        render: (c: string) => SUBJECT_CAT_KO[c] ?? c,
      },
      {
        title: '기본 점수',
        dataIndex: 'defaultPoints',
        width: 96,
        render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
      },
      {
        title: '설명',
        dataIndex: 'description',
        ellipsis: true,
        render: (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '—'),
      },
    ],
    [openActivitySubmitModal],
  );

  const subjectColumnsPreview: ColumnsType<EsgSubject> = useMemo(
    () => [
      {
        title: '제목',
        dataIndex: 'title',
        ellipsis: true,
        render: (text: unknown, row) => (
          <Typography.Link className={esgTableLinkClass} onClick={() => openActivitySubmitModal(row.subjectId)}>
            {typeof text === 'string' && text.trim() ? text.trim() : '(제목 없음)'}
          </Typography.Link>
        ),
      },
      {
        title: '분류',
        dataIndex: 'category',
        width: 100,
        render: (c: string) => SUBJECT_CAT_KO[c] ?? c,
      },
      {
        title: '점수',
        dataIndex: 'defaultPoints',
        width: 72,
        render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
      },
    ],
    [openActivitySubmitModal],
  );

  const activityColumnsFull: ColumnsType<EsgActivity> = useMemo(
    () => [
      {
        title: '상태',
        dataIndex: 'status',
        width: 88,
        render: (_: unknown, row) => formatActivityStatusKo((row as EsgActivity).status),
      },
      {
        title: 'ESG 분류',
        key: 'category',
        width: 180,
        ellipsis: true,
        render: (_, row) => resolveActivityCategoryDisplay(row),
      },
      {
        title: '활동 양식',
        key: 'subject',
        width: 140,
        ellipsis: true,
        render: (_, row) => resolveActivitySubjectTitle(row, subjectTitleById),
      },
      {
        title: '증빙',
        key: 'verification',
        width: 200,
        ellipsis: true,
        render: (_, row) => resolveVerificationContent(row),
      },
      {
        title: '첨부',
        key: 'file',
        width: 64,
        render: (_, row) => {
          const url = resolveActivityFileUrl(row);
          if (!url) return <Typography.Text type="secondary">—</Typography.Text>;
          return (
            <Typography.Link href={url} target="_blank" rel="noopener noreferrer">
              열기
            </Typography.Link>
          );
        },
      },
      {
        title: '적립',
        key: 'points',
        width: 64,
        render: (_, row) => resolveEarnedPointsDisplay(row),
      },
      {
        title: '반려 사유',
        key: 'reject',
        width: 140,
        ellipsis: true,
        render: (_, row) => resolveRejectReasonDisplay(row),
      },
      {
        title: '제출일',
        key: 'createdAt',
        width: 128,
        render: (_, row) => formatActivityDateTime(resolveActivityCreatedAt(row as EsgActivity)),
      },
      {
        title: '승인일',
        key: 'approvedAt',
        width: 128,
        render: (_, row) => formatActivityDateTime(resolveActivityApprovedAt(row as EsgActivity)),
      },
    ],
    [subjectTitleById],
  );

  const activityColumnsPreview: ColumnsType<EsgActivity> = useMemo(
    () => [
      {
        title: '상태',
        dataIndex: 'status',
        width: 80,
        render: (_: unknown, row) => formatActivityStatusKo((row as EsgActivity).status),
      },
      {
        title: '활동 양식',
        key: 'subject',
        ellipsis: true,
        render: (_, row) => resolveActivitySubjectTitle(row, subjectTitleById),
      },
      {
        title: '제출일',
        key: 'createdAt',
        width: 120,
        render: (_, row) => formatActivityDateTime(resolveActivityCreatedAt(row as EsgActivity)),
      },
      {
        title: '적립',
        key: 'points',
        width: 64,
        render: (_, row) => resolveEarnedPointsDisplay(row),
      },
    ],
    [subjectTitleById],
  );

  const orderColumns: ColumnsType<EsgShopOrder> = useMemo(
    () => [
      { title: '물품', dataIndex: 'itemTitle', ellipsis: true },
      {
        title: '사용 포인트',
        dataIndex: 'usedPoints',
        width: 96,
        render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
      },
      {
        title: '구매일시',
        key: 'createdAt',
        width: 140,
        render: (_, row) => formatActivityDateTime(row.createdAt),
      },
    ],
    [],
  );

  const cardTableCls = 'tw-text-[12px] [&_.ant-table-thead>tr>th]:!tw-py-2 [&_.ant-table-tbody>tr>td]:!tw-py-1.5';
  const submittedCount = mine.length;
  const approvedCount = mine.filter((row) => String(row.status ?? '').toUpperCase() === 'APPROVED').length;
  const pendingCount = mine.filter((row) => String(row.status ?? '').toUpperCase() === 'PENDING').length;

  if (cfg?.esgEnabledYn !== 'YES') {
    if (user?.isSystemAdmin) {
      return (
        <Alert
          type="info"
          showIcon
          className="tw-rounded-xl"
          message="ESG가 비활성화되어 있습니다."
          description={
            <span>
              <Link to="/app/esg/admin" className={esgLinkTextClass}>
                ESG 관리
              </Link>
              에서 기능을 켤 수 있습니다.
            </span>
          }
        />
      );
    }
    return (
      <Alert
        type="warning"
        showIcon
        className="tw-rounded-xl"
        message="ESG가 비활성화되어 있습니다."
      />
    );
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={20}>
      <AppWorkspacePageTitle
        className="!tw-mb-0"
        eyebrow="MY ESG"
        title="나의 ESG 활동"
        subtitle="참여 가능한 활동과 제출 이력, 포인트 사용 내역을 한곳에서 확인합니다."
        extra={
          <Link to="/app/esg/shop" className={`${esgCardLinkButtonClass} tw-leading-6`}>
            ESG 샵으로 이동
          </Link>
        }
      />

      <div className="tw-grid tw-grid-cols-1 tw-gap-5 md:tw-grid-cols-3">
        <Card size="small" className={esgSurfaceCardClass} styles={esgMetricCardStyles}>
          <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">보유 포인트</div>
          <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
            <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
              {pts != null && Number.isFinite(pts) ? pts.toLocaleString() : '—'}
            </span>
            <span className="tw-text-sm tw-font-bold tw-text-slate-400">P</span>
          </div>
        </Card>
        <Card size="small" className={esgSurfaceCardClass} styles={esgMetricCardStyles}>
          <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">내 활동</div>
          <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
            <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">{submittedCount.toLocaleString()}</span>
            <span className="tw-text-sm tw-font-bold tw-text-slate-400">건</span>
          </div>
          <div className="tw-mt-2 tw-text-xs tw-text-slate-500">승인 {approvedCount} · 대기 {pendingCount}</div>
        </Card>
        <Card size="small" className={esgSurfaceCardClass} styles={esgMetricCardStyles}>
          <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">구매 내역</div>
          <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
            <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">{myOrders.length.toLocaleString()}</span>
            <span className="tw-text-sm tw-font-bold tw-text-slate-400">건</span>
          </div>
          <div className="tw-mt-2 tw-text-xs tw-text-slate-500">ESG 샵 사용 이력</div>
        </Card>
      </div>

      <Card
        size="small"
        className={esgSurfaceCardClass}
        styles={esgSurfaceCardStyles}
        title={<span className="tw-text-sm tw-font-semibold tw-text-slate-900">활동 양식</span>}
        extra={
          <Space size={8} className="tw-flex-nowrap">
            <Button type="link" size="small" className={esgCardLinkButtonClass} onClick={() => openActivitySubmitModal()}>
              활동 제출
            </Button>
            <Button type="link" size="small" className={esgCardLinkButtonClass} onClick={() => setModal('subjects')}>
              더보기
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph className="!tw-mb-3 !tw-text-xs !tw-text-slate-500">
          제출할 수 있는 ESG 활동 양식입니다. 제목을 누르면 바로 활동을 제출할 수 있습니다.
        </Typography.Paragraph>
        <AppDataTable<EsgSubject>
          className={cardTableCls}
          rowKey={(r) => r.subjectId || JSON.stringify(r)}
          loading={subjectsLoading}
          dataSource={recentSubjects}
          pagination={false}
          size="small"
          scroll={{ x: 560 }}
          columns={subjectColumnsPreview}
        />
      </Card>

      <Card
        size="small"
        className={esgSurfaceCardClass}
        styles={esgSurfaceCardStyles}
        title={<span className="tw-text-sm tw-font-semibold tw-text-slate-900">내 활동</span>}
        extra={
          <Button type="link" size="small" className={esgCardLinkButtonClass} onClick={() => setModal('activities')}>
            더보기
          </Button>
        }
      >
        <Typography.Paragraph className="!tw-mb-3 !tw-text-xs !tw-text-slate-500">
          최근 제출한 ESG 활동과 승인 상태입니다.
        </Typography.Paragraph>
        <AppDataTable<EsgActivity>
          className={cardTableCls}
          rowKey={(r) => pickActivityId(r) || JSON.stringify(r)}
          loading={mineLoading}
          dataSource={recentActivities}
          pagination={false}
          size="small"
          scroll={{ x: 640 }}
          columns={activityColumnsPreview}
        />
      </Card>

      <Card
        size="small"
        className={esgSurfaceCardClass}
        styles={esgSurfaceCardStyles}
        title={<span className="tw-text-sm tw-font-semibold tw-text-slate-900">내 구매 내역</span>}
        extra={
          <Button type="link" size="small" className={esgCardLinkButtonClass} onClick={() => setModal('orders')}>
            더보기
          </Button>
        }
      >
        <Typography.Paragraph className="!tw-mb-3 !tw-text-xs !tw-text-slate-500">
          ESG 샵에서 사용한 포인트 내역입니다.
        </Typography.Paragraph>
        <AppDataTable<EsgShopOrder>
          className={cardTableCls}
          rowKey={(row) => row.esgShopOrderId || JSON.stringify(row)}
          loading={myOrdersLoading}
          dataSource={recentOrders}
          pagination={false}
          size="small"
          scroll={{ x: 520 }}
          columns={orderColumns}
        />
      </Card>

      <EsgActivitySubmitModal open={submitModalOpen} initialSubjectId={submitModalSubjectId} onClose={closeActivitySubmitModal} />

      <AppSingleActionModal
        title={modal === 'subjects' ? '활동 양식 전체' : modal === 'activities' ? '내 활동 전체' : '내 구매 내역 전체'}
        open={modal !== null}
        onClose={() => setModal(null)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        width={modal === 'activities' ? 1100 : 880}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
        destroyOnHidden
      >
        <div className={`${esgModalContentClass} tw-space-y-4`}>
          {modal === 'subjects' && (
            <AppDataTable<EsgSubject>
              rowKey={(r) => r.subjectId || JSON.stringify(r)}
              loading={subjectsLoading}
              dataSource={subjects}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              scroll={{ x: 720 }}
              columns={subjectColumns}
            />
          )}
          {modal === 'activities' && (
            <AppDataTable<EsgActivity>
              rowKey={(r) => pickActivityId(r) || JSON.stringify(r)}
              loading={mineLoading}
              dataSource={activitiesSorted}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              scroll={{ x: 1280 }}
              columns={activityColumnsFull}
            />
          )}
          {modal === 'orders' && (
            <AppDataTable<EsgShopOrder>
              rowKey={(row) => row.esgShopOrderId || JSON.stringify(row)}
              loading={myOrdersLoading}
              dataSource={ordersSorted}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              scroll={{ x: 640 }}
              columns={orderColumns}
            />
          )}
        </div>
      </AppSingleActionModal>
    </Space>
  );
}
