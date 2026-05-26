import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  LineChartOutlined,
  PlusOutlined,
  } from '@ant-design/icons';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Space,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import type { ApiError } from '@/shared/api/types';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import type { EsgActivity, EsgShopItem, EsgShopOrder, EsgSubject, EsgSubjectCategory } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  esgCardLinkButtonClass,
  esgMetricCardStyles,
  esgModalContentClass,
  esgPrimaryButtonClass,
  esgSurfaceCardClass,
  esgSurfaceCardStyles,
} from '@/features/esg/esgUiTokens';
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
  resolveMemberName,
  resolveVerificationContent,
} from '@/features/esg/esgActivityDisplay';
import type { EsgScoreHistoryRow } from '@/features/esg/esgScoreDisplay';
import { AppDataTable } from '@/shared/ui/AppDataTable';

import {
  pickEsgScoreRowId,
  pickGrade,
  pickGradeDescription,
  pickTotalScore,
  pickYearMonth,
} from '@/features/esg/esgScoreDisplay';

/** 401·403·404는 재시도하지 않음 (콘솔 스팸·불필요한 부하 방지) */
function retryUnlessAuthDenied(failureCount: number, error: unknown): boolean {
  const status = (error as Partial<ApiError> | undefined)?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 2;
}

const CAT_OPTS: { value: EsgSubjectCategory; label: string }[] = [
  { value: 'E', label: 'E · 환경' },
  { value: 'S', label: 'S · 사회' },
  { value: 'G', label: 'G · 지배구조' },
];

const SUBJECT_CAT_KO: Record<string, string> = { E: '환경(E)', S: '사회(S)', G: '지배구조(G)' };
const PREVIEW_ROWS = 5;

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

function sortScoreHistNewestFirst(rows: EsgScoreHistoryRow[]): EsgScoreHistoryRow[] {
  return [...rows].sort((a, b) =>
    String(pickYearMonth(b) ?? '').localeCompare(String(pickYearMonth(a) ?? '')),
  );
}

type DashboardModal = 'config' | 'subjects' | 'approve' | 'shop' | 'shopRegister' | 'orders' | 'scores' | null;

export function EsgAdminPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [cfgForm] = Form.useForm();
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<EsgSubject | null>(null);
  const [subForm] = Form.useForm();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectForm] = Form.useForm<{ reason: string }>();
  const [shopForm] = Form.useForm();
  const [shopFile, setShopFile] = useState<File | null>(null);
  const [editingShopItem, setEditingShopItem] = useState<EsgShopItem | null>(null);
  const [editShopForm] = Form.useForm();
  const [editShopFile, setEditShopFile] = useState<File | null>(null);
  const [scoreMonth, setScoreMonth] = useState('');
  const [dashboardModal, setDashboardModal] = useState<DashboardModal>(null);
  const [esg403BannerDismissed, setEsg403BannerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('esgAdmin403BannerDismissed') === '1';
  });

  const cfgQuery = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
    retry: retryUnlessAuthDenied,
  });
  const { data: cfg } = cfgQuery;
  /** ESG OFF면 서버가 주제·활동·샵 등 READ API를 403으로 막는 경우가 있어, 호출하지 않음 */
  const esgModuleOn = cfgQuery.isSuccess && cfg?.esgEnabledYn === 'YES';

  useEffect(() => {
    if (!cfg) return;
    cfgForm.setFieldsValue({
      esgEnabledYn: cfg.esgEnabledYn,
      monthlyPointLimit: cfg.monthlyPointLimit ?? 1000,
    });
  }, [cfg, cfgForm]);

  const saveCfg = useMutation({
    mutationFn: () => {
      const v = cfgForm.getFieldsValue();
      return esgApi.updateConfig({
        esgEnabledYn: v.esgEnabledYn,
        monthlyPointLimit: Number(v.monthlyPointLimit) || 0,
      });
    },
    onSuccess: () => {
      message.success('ESG 설정을 저장했습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'config'] });
    },
    onError: (e: Error) => message.error(e.message || '저장에 실패했습니다.'),
  });

  const subjectsQuery = useQuery({
    queryKey: ['esg', 'subjects'],
    queryFn: () => esgApi.listSubjects(),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: subjects = [], isLoading: subLoad } = subjectsQuery;

  const subjectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjects) {
      if (s.subjectId.trim() !== '') {
        m.set(s.subjectId, s.title || '(제목 없음)');
      }
    }
    return m;
  }, [subjects]);

  const saveSubject = useMutation({
    mutationFn: async () => {
      const v = await subForm.validateFields();
      const payload = {
        title: v.title.trim(),
        description: (v.description ?? '').trim(),
        category: v.category as EsgSubjectCategory,
        defaultPoints: Number(v.defaultPoints),
      };
      if (editingSubject) {
        await esgApi.updateSubject(editingSubject.subjectId, payload);
      } else {
        await esgApi.createSubject(payload);
      }
    },
    onSuccess: () => {
      message.success(editingSubject ? '수정했습니다.' : '등록했습니다.');
      setSubModalOpen(false);
      setEditingSubject(null);
      subForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['esg', 'subjects'] });
    },
    onError: (e: Error) => message.error(e.message || '저장에 실패했습니다.'),
  });

  const delSubject = useMutation({
    mutationFn: (id: string) => esgApi.deleteSubject(id),
    onSuccess: () => {
      message.success('삭제했습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'subjects'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const pendingActsQuery = useQuery({
    queryKey: ['esg', 'activities', 'admin', 'PENDING'],
    queryFn: () => esgApi.listActivitiesAdmin('PENDING'),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: pendingActs = [], isLoading: pendLoad } = pendingActsQuery;

  const approvedActsQuery = useQuery({
    queryKey: ['esg', 'activities', 'admin', 'APPROVED'],
    queryFn: () => esgApi.listActivitiesAdmin('APPROVED'),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: approvedActs = [], isLoading: approvedLoad } = approvedActsQuery;

  const approveM = useMutation({
    mutationFn: (id: string) => esgApi.approveActivity(id),
    onSuccess: () => {
      message.success('승인했습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'activities'] });
    },
    onError: (e: Error) => message.error(e.message || '승인에 실패했습니다.'),
  });

  const rejectM = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => esgApi.rejectActivity(id, reason),
    onSuccess: () => {
      message.success('반려했습니다.');
      setRejectOpen(false);
      setRejectId(null);
      rejectForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['esg', 'activities'] });
    },
    onError: (e: Error) => message.error(e.message || '반려에 실패했습니다.'),
  });

  const shopItemsQuery = useQuery({
    queryKey: ['esg', 'shop', 'items'],
    queryFn: () => esgApi.listShopItems(),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: shopItems = [], isLoading: shopLoad } = shopItemsQuery;

  const createShop = useMutation({
    mutationFn: async () => {
      const v = await shopForm.validateFields();
      await esgApi.createShopItem({
        title: v.title.trim(),
        description: (v.description ?? '').trim(),
        requiredPoints: Number(v.requiredPoints),
        stock: Number(v.stock),
        image: shopFile,
      });
    },
    onSuccess: () => {
      message.success('물품을 등록했습니다.');
      shopForm.resetFields();
      setShopFile(null);
      void qc.invalidateQueries({ queryKey: ['esg', 'shop'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const openShopItemEdit = (item: EsgShopItem) => {
    const id = item.itemId?.trim();
    if (!id) return;
    setEditingShopItem(item);
  };

  useEffect(() => {
    if (!editingShopItem) return;
    editShopForm.setFieldsValue({
      title: editingShopItem.title,
      description: editingShopItem.description ?? '',
      requiredPoints: editingShopItem.requiredPoints,
      stock: editingShopItem.stock,
    });
    setEditShopFile(null);
  }, [editingShopItem, editShopForm]);

  const updateShop = useMutation({
    mutationFn: async () => {
      if (!editingShopItem?.itemId?.trim()) {
        throw new Error('물품을 찾을 수 없습니다.');
      }
      const v = await editShopForm.validateFields();
      await esgApi.updateShopItem(editingShopItem.itemId, {
        title: String(v.title).trim(),
        description: String(v.description ?? '').trim(),
        requiredPoints: Number(v.requiredPoints),
        stock: Number(v.stock),
        image: editShopFile,
      });
    },
    onSuccess: () => {
      message.success('물품을 수정했습니다.');
      setEditingShopItem(null);
      editShopForm.resetFields();
      setEditShopFile(null);
      void qc.invalidateQueries({ queryKey: ['esg', 'shop'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const allOrdersQuery = useQuery({
    queryKey: ['esg', 'shop', 'orders', 'all'],
    queryFn: () => esgApi.listAllOrders(),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: allOrders = [], isLoading: ordLoad } = allOrdersQuery;

  const scoreHistQuery = useQuery({
    queryKey: ['esg', 'scores', 'history'],
    queryFn: () => esgApi.getScoreHistory(),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: scoreHist = [], isLoading: scoreLoad } = scoreHistQuery;

  const esgAdminApi403 = useMemo(() => {
    if (!esgModuleOn) return false;
    const queries = [
      cfgQuery,
      subjectsQuery,
      pendingActsQuery,
      approvedActsQuery,
      shopItemsQuery,
      allOrdersQuery,
      scoreHistQuery,
    ];
    return queries.some((q) => q.isError && (q.error as ApiError | undefined)?.status === 403);
  }, [
    esgModuleOn,
    cfgQuery.isError,
    cfgQuery.error,
    subjectsQuery.isError,
    subjectsQuery.error,
    pendingActsQuery.isError,
    pendingActsQuery.error,
    approvedActsQuery.isError,
    approvedActsQuery.error,
    shopItemsQuery.isError,
    shopItemsQuery.error,
    allOrdersQuery.isError,
    allOrdersQuery.error,
    scoreHistQuery.isError,
    scoreHistQuery.error,
  ]);

  const aggScore = useMutation({
    mutationFn: () => {
      const ym = scoreMonth.trim();
      if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('YYYY-MM 형식으로 입력해 주세요.');
      return esgApi.aggregateScores(ym);
    },
    onSuccess: () => {
      message.success('집계를 요청했습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'scores'] });
    },
    onError: (e: Error) => message.error(e.message || '집계에 실패했습니다.'),
  });

  const openSubjectModal = (s: EsgSubject | null) => {
    setEditingSubject(s);
    if (s) {
      subForm.setFieldsValue({
        title: s.title,
        description: s.description ?? '',
        category: s.category,
        defaultPoints: s.defaultPoints,
      });
    } else {
      subForm.resetFields();
      subForm.setFieldsValue({ category: 'E', defaultPoints: 100 });
    }
    setSubModalOpen(true);
  };

  const modalScrollableBody = { maxHeight: '78vh', overflowY: 'auto' as const };
  const wideTableScroll = { x: 1280 as const };
  const cardTableCls =
    'tw-text-[12px] [&_.ant-table-thead>tr>th]:!tw-py-1.5 [&_.ant-table-tbody>tr>td]:!tw-py-1';
  const esgSoftRowButtonClass =
    'tw-flex tw-w-full tw-items-center tw-justify-between tw-gap-4 tw-rounded-xl tw-bg-slate-50/70 tw-px-4 tw-py-3 tw-text-left';
  const esgEmptyStateClass =
    'tw-flex tw-items-center tw-justify-center tw-rounded-2xl tw-bg-slate-50/70 tw-text-xs tw-font-semibold tw-text-slate-400';
  const esgCardActionGroupClass = 'tw-flex tw-items-center tw-gap-3';
  const modalPanelCardClass = '!tw-border-0 tw-shadow-sm';
  const modalPanelCardStyles = { header: { borderBottom: 0 } };

  const pendingSorted = useMemo(() => sortActivitiesNewestFirst(pendingActs), [pendingActs]);
  const ordersSorted = useMemo(() => sortOrdersNewestFirst(allOrders), [allOrders]);
  const scoreHistSorted = useMemo(
    () => sortScoreHistNewestFirst(scoreHist as EsgScoreHistoryRow[]),
    [scoreHist],
  );

  const previewSubjects = useMemo(() => subjects.slice(0, PREVIEW_ROWS), [subjects]);
  const previewPendingActs = useMemo(() => pendingSorted.slice(0, PREVIEW_ROWS), [pendingSorted]);
  const previewShopItems = useMemo(() => shopItems.slice(0, PREVIEW_ROWS), [shopItems]);
  const previewOrders = useMemo(() => ordersSorted.slice(0, PREVIEW_ROWS), [ordersSorted]);
  const previewScores = useMemo(() => scoreHistSorted.slice(0, PREVIEW_ROWS), [scoreHistSorted]);

  const configPreviewRows = useMemo(() => {
    if (!cfg) return [];
    const on = cfg.esgEnabledYn === 'YES';
    return [
      { key: '1', label: 'ESG 그린장터', value: on ? 'ON' : 'OFF' },
      { key: '2', label: '월간 포인트 상한', value: `${cfg.monthlyPointLimit ?? 0}P` },
      { key: '3', label: '활동 제출·승인', value: on ? '사용' : '중지' },
      { key: '4', label: '포인트 적립·샵', value: on ? '사용' : '중지' },
      { key: '5', label: '상세 편집', value: '관리 버튼에서 저장' },
    ];
  }, [cfg]);

  const adminSummary = useMemo(() => {
    const totalApprovedPoints = approvedActs.reduce((sum, row) => {
      const n = Number(resolveEarnedPointsDisplay(row).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    const participants = new Set(
      approvedActs
        .map((row) => resolveMemberName(row))
        .filter((name) => name && name !== '—' && name !== '알 수 없음'),
    ).size;
    const lowStock = shopItems.filter((item) => Number(item.stock ?? 0) <= 0).length;
    const latestScore = scoreHistSorted[0];
    return {
      totalApprovedPoints,
      participants,
      lowStock,
      latestGrade: latestScore ? pickGrade(latestScore) : '—',
      latestScore: latestScore ? pickTotalScore(latestScore) : '—',
    };
  }, [approvedActs, shopItems, scoreHistSorted]);

  const previewSubjectColumns: ColumnsType<EsgSubject> = useMemo(
    () => [
      { title: '제목', dataIndex: 'title', ellipsis: true },
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
    [],
  );

  const previewPendingColumns: ColumnsType<EsgActivity> = useMemo(
    () => [
      {
        title: '직원',
        key: 'member',
        width: 88,
        ellipsis: true,
        render: (_, row) => resolveMemberName(row),
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
        render: (_, row) => formatActivityDateTime(resolveActivityCreatedAt(row)),
      },
    ],
    [subjectTitleById],
  );

  const previewShopColumns: ColumnsType<EsgShopItem> = useMemo(
    () => [
      { title: '물품명', dataIndex: 'title', ellipsis: true },
      {
        title: '포인트',
        dataIndex: 'requiredPoints',
        width: 72,
        render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
      },
      { title: '재고', dataIndex: 'stock', width: 56 },
    ],
    [],
  );

  const previewOrderColumns: ColumnsType<EsgShopOrder> = useMemo(
    () => [
      {
        title: '구매일시',
        key: 'createdAt',
        width: 128,
        render: (_, row) => formatActivityDateTime(row.createdAt),
      },
      { title: '직원', dataIndex: 'memberName', width: 88, ellipsis: true },
      { title: '물품', dataIndex: 'itemTitle', ellipsis: true },
      {
        title: '사용',
        dataIndex: 'usedPoints',
        width: 64,
        render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
      },
    ],
    [],
  );

  const previewScoreColumns: ColumnsType<EsgScoreHistoryRow> = useMemo(
    () => [
      { title: '연월', width: 88, render: (_, row) => pickYearMonth(row) },
      { title: '총점', width: 72, render: (_, row) => pickTotalScore(row) },
      { title: '등급', width: 72, render: (_, row) => pickGrade(row) },
      {
        title: '설명',
        ellipsis: true,
        render: (_, row) => pickGradeDescription(row),
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={20}>
      <AppWorkspacePageTitle
        className="!tw-mb-0"
        eyebrow="ESG OPERATIONS"
        title="ESG 운영 관리"
        subtitle="활동 승인, 포인트 정책, 샵 운영을 한 화면에서 관리합니다."
        subtitleClassName="!tw-mt-1 !tw-max-w-none"
      />

      {cfgQuery.isSuccess && cfg?.esgEnabledYn === 'NO' ? (
        <Alert
          type="info"
          showIcon
          className="tw-w-full"
          message="ESG 기능이 OFF입니다"
          description="이 상태에서는 주제·활동 승인·샵 등 데이터를 불러오지 않습니다. 기능 설정에서 ON으로 바꾼 뒤 저장하면 목록 API가 호출됩니다."
        />
      ) : null}

      {esgAdminApi403 && !esg403BannerDismissed ? (
        <Alert
          type="warning"
          showIcon
          closable
          className="tw-w-full"
          message="ESG 관리 API 접근이 거부되었습니다 (HTTP 403)"
          description="권한 헤더·Redis 권한 캐시·백엔드 PermissionAspect 규칙을 확인하세요. (닫기는 이 브라우저 세션 동안만 유지됩니다.)"
          onClose={() => {
            try {
              window.sessionStorage.setItem('esgAdmin403BannerDismissed', '1');
            } catch {
              /* ignore */
            }
            setEsg403BannerDismissed(true);
          }}
        />
      ) : null}

      <div className="tw-grid tw-grid-cols-1 tw-gap-5 sm:tw-grid-cols-2 xl:tw-grid-cols-4">
        <EsgMetricCard
          label="승인 적립 포인트"
          value={esgModuleOn ? adminSummary.totalApprovedPoints.toLocaleString() : '—'}
          unit="P"
        />
        <EsgMetricCard
          label="승인 대기"
          value={esgModuleOn ? pendingActs.length.toLocaleString() : '—'}
          unit="건"
        />
        <EsgMetricCard
          label="재고 확인 필요"
          value={esgModuleOn ? adminSummary.lowStock.toLocaleString() : '—'}
          unit="품목"
        />
        <EsgMetricCard
          label="최근 등급 / 참여자"
          value={esgModuleOn ? String(adminSummary.latestGrade) : '—'}
          unit={esgModuleOn ? `${adminSummary.participants.toLocaleString()}명` : ''}
          subValue={esgModuleOn ? `최근 점수 ${adminSummary.latestScore}` : undefined}
        />
      </div>

      <div className="tw-grid tw-w-full tw-grid-cols-1 tw-gap-5 xl:tw-grid-cols-12">
        <div className="tw-min-w-0 tw-space-y-5 xl:tw-col-span-4">
          <Card
            size="small"
            className={`tw-overflow-hidden ${esgSurfaceCardClass}`}
            styles={esgSurfaceCardStyles}
            title={
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                기능 설정
              </span>
            }
            extra={
              <Button type="link" size="small" className={esgCardLinkButtonClass} onClick={() => setDashboardModal('config')}>
                관리
              </Button>
            }
          >
            <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-xs tw-leading-relaxed">
              운영 중인 ESG 기능과 포인트 한도를 확인합니다. 변경은 관리에서 저장합니다.
            </Typography.Paragraph>
            {cfg ? (
              <div className="tw-space-y-3">
                {configPreviewRows.slice(0, 4).map((row) => (
                  <div
                    key={row.key}
                    className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-rounded-xl tw-bg-slate-50 tw-px-4 tw-py-3"
                  >
                    <span className="tw-text-sm tw-font-medium tw-text-slate-600">{row.label}</span>
                    <span className="tw-text-sm tw-font-bold tw-text-[#1e3a5f]">{row.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary" className="tw-text-xs">
                불러오는 중…
              </Typography.Text>
            )}
          </Card>

          <Card
            size="small"
            className={`tw-overflow-hidden !tw-bg-[#1e3a5f] ${esgSurfaceCardClass}`}
            styles={esgSurfaceCardStyles}
            title={
              <span className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-semibold tw-text-white">
                <LineChartOutlined className="tw-text-white/80" />
                월별 ESG 성과 집계
              </span>
            }
            extra={
              <Button
                type="link"
                size="small"
                className="!tw-px-0 !tw-text-xs !tw-font-bold !tw-text-white/80 hover:!tw-text-white"
                disabled={!esgModuleOn}
                onClick={() => setDashboardModal('scores')}
              >
                더보기
              </Button>
            }
          >
            <div className="tw-space-y-6 tw-text-white">
              <Typography.Paragraph className="!tw-mb-0 !tw-text-xs !tw-leading-relaxed !tw-text-white/60">
                월별 활동 점수를 집계하고 최근 등급 산정 결과를 확인합니다.
              </Typography.Paragraph>
              <div>
                <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-white/45">
                  Latest Monthly Result
                </div>
                <div className="tw-mt-2 tw-flex tw-items-end tw-justify-between tw-gap-4">
                  <div className="tw-text-4xl tw-font-bold tw-leading-none">
                    {esgModuleOn ? adminSummary.latestGrade : '—'}
                  </div>
                  <div className="tw-text-right">
                    <div className="tw-text-[11px] tw-font-semibold tw-text-white/45">최근 점수</div>
                    <div className="tw-text-xl tw-font-bold">{esgModuleOn ? adminSummary.latestScore : '—'}</div>
                  </div>
                </div>
              </div>
              <div className="tw-space-y-3">
                {previewScores.length > 0 ? (
                  previewScores.slice(0, 2).map((row) => (
                    <div
                      key={pickEsgScoreRowId(row) || JSON.stringify(row)}
                      className="tw-flex tw-w-full tw-appearance-none tw-items-center tw-justify-between tw-gap-3 tw-rounded-xl !tw-border-0 tw-bg-white/10 tw-px-4 tw-py-3 tw-text-left tw-shadow-none tw-transition hover:tw-bg-white/15 focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-white/20"
                    >
                      <span>
                        <span className="tw-block tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-white/45">
                          {pickYearMonth(row)}
                        </span>
                        <span className="tw-mt-1 tw-block tw-text-sm tw-font-semibold tw-text-white">
                          {pickGradeDescription(row) || '등급 설명 없음'}
                        </span>
                      </span>
                      <span className="tw-shrink-0 tw-text-lg tw-font-bold tw-text-white">{pickGrade(row)}</span>
                    </div>
                  ))
                ) : (
                  <div className="tw-rounded-xl tw-bg-white/10 tw-px-4 tw-py-6 tw-text-center tw-text-sm tw-font-semibold tw-text-white/60">
                    점수 이력이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="tw-min-w-0 tw-space-y-5 xl:tw-col-span-8">
          <Card
            size="small"
            className={`tw-overflow-hidden ${esgSurfaceCardClass}`}
            styles={esgSurfaceCardStyles}
            title={
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                활동 승인
              </span>
            }
            extra={
              <Button
                type="link"
                size="small"
                className={esgCardLinkButtonClass}
                disabled={!esgModuleOn}
                onClick={() => setDashboardModal('approve')}
              >
                더보기
              </Button>
            }
          >
            <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-xs tw-leading-relaxed">
              임직원이 제출한 활동 중 검토가 필요한 항목입니다. 승인 후 포인트 적립과 이력에 반영됩니다.
            </Typography.Paragraph>
            {esgModuleOn ? (
              pendingSorted.length > 0 ? (
                <div className="tw-space-y-3">
                  {previewPendingActs.map((row) => (
                    <div
                      key={pickActivityId(row) || JSON.stringify(row)}
                      className={esgSoftRowButtonClass}
                    >
                      <span className="tw-min-w-0">
                        <span className="tw-block tw-truncate tw-text-sm tw-font-bold tw-text-slate-900">
                          {resolveActivitySubjectTitle(row, subjectTitleById)}
                        </span>
                        <span className="tw-mt-1 tw-block tw-truncate tw-text-xs tw-text-slate-500">
                          {resolveMemberName(row)} · {resolveActivityCategoryDisplay(row)}
                        </span>
                      </span>
                      <span className="tw-shrink-0 tw-text-xs tw-font-semibold tw-text-blue-700">
                        {formatActivityDateTime(resolveActivityCreatedAt(row))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${esgEmptyStateClass} tw-min-h-48 tw-flex-col tw-text-center`}>
                  <CheckCircleOutlined className="tw-text-3xl tw-text-slate-300" />
                  <div className="tw-mt-4 tw-text-base tw-font-bold tw-text-slate-800">모든 검토가 끝났습니다</div>
                  <div className="tw-mt-1 tw-text-sm tw-text-slate-400">새로 등록된 임직원 활동이 없습니다.</div>
                </div>
              )
            ) : null}
          </Card>

          <div className="tw-grid tw-grid-cols-1 tw-gap-5 md:tw-grid-cols-2">
            <Card
              size="small"
              className={`tw-h-full tw-overflow-hidden ${esgSurfaceCardClass}`}
              styles={esgSurfaceCardStyles}
              title={
                <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                  샵 물품
                </span>
              }
              extra={
                <div className={esgCardActionGroupClass}>
                  <Button
                    type="link"
                    size="small"
                    className={esgCardLinkButtonClass}
                    disabled={!esgModuleOn}
                    onClick={() => setDashboardModal('shop')}
                  >
                    더보기
                  </Button>
                  <span className="tw-h-3 tw-w-px tw-bg-slate-200" />
                  <Button
                    type="link"
                    size="small"
                    className={esgCardLinkButtonClass}
                    disabled={!esgModuleOn}
                    onClick={() => setDashboardModal('shopRegister')}
                  >
                    등록
                  </Button>
                </div>
              }
            >
              <div className="tw-mb-4 tw-text-xs tw-text-slate-500">
                등록 {esgModuleOn ? shopItems.length : '—'}건 · 재고 확인 {esgModuleOn ? adminSummary.lowStock : '—'}건
              </div>
              {esgModuleOn ? (
                previewShopItems.length > 0 ? (
                  <div className="tw-space-y-3">
                    {previewShopItems.slice(0, 3).map((item) => (
                      <div
                        key={item.itemId || JSON.stringify(item)}
                        onClick={() => item.itemId && openShopItemEdit(item)}
                        className={`${esgSoftRowButtonClass}${
                          item.itemId ? ' tw-cursor-pointer hover:tw-bg-slate-100/80' : ''
                        }`}
                      >
                        <span className="tw-min-w-0">
                          <span className="tw-block tw-truncate tw-text-sm tw-font-bold tw-text-slate-900">{item.title}</span>
                          <span className="tw-mt-1 tw-block tw-text-xs tw-text-slate-500">재고 {item.stock ?? 0}개</span>
                        </span>
                        <span className="tw-flex tw-shrink-0 tw-items-center tw-gap-2">
                          <span className="tw-text-sm tw-font-bold tw-text-[#1e3a5f]">{item.requiredPoints}P</span>
                          {item.itemId ? (
                            <button
                              type="button"
                              className="tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-xs tw-font-semibold tw-text-blue-600 hover:tw-text-blue-800 hover:tw-underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShopItemEdit(item);
                              }}
                            >
                              수정
                            </button>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`${esgEmptyStateClass} tw-h-32`}>
                    등록된 물품이 없습니다.
                  </div>
                )
              ) : null}
            </Card>

            <Card
              size="small"
              className={`tw-h-full tw-overflow-hidden ${esgSurfaceCardClass}`}
              styles={esgSurfaceCardStyles}
              title={
                <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                  최근 주문
                </span>
              }
              extra={
                <Button
                  type="link"
                  size="small"
                  className={esgCardLinkButtonClass}
                  disabled={!esgModuleOn}
                  onClick={() => setDashboardModal('orders')}
                >
                  더보기
                </Button>
              }
            >
              <div className="tw-mb-4 tw-text-xs tw-text-slate-500">
                누적 {esgModuleOn ? allOrders.length : '—'}건 · 최신순
              </div>
              {esgModuleOn ? (
                previewOrders.length > 0 ? (
                  <div className="tw-space-y-3">
                    {previewOrders.slice(0, 3).map((order) => (
                      <div
                        key={order.esgShopOrderId || JSON.stringify(order)}
                        className={esgSoftRowButtonClass}
                      >
                        <span className="tw-min-w-0">
                          <span className="tw-block tw-truncate tw-text-sm tw-font-bold tw-text-slate-900">{order.itemTitle}</span>
                          <span className="tw-mt-1 tw-block tw-truncate tw-text-xs tw-text-slate-500">
                            {order.memberName} · {formatActivityDateTime(order.createdAt)}
                          </span>
                        </span>
                        <span className="tw-shrink-0 tw-text-sm tw-font-bold tw-text-[#1e3a5f]">{order.usedPoints}P</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`${esgEmptyStateClass} tw-h-32`}>
                    주문 이력이 없습니다.
                  </div>
                )
              ) : null}
            </Card>
          </div>

          <Card
            size="small"
            className={`tw-overflow-hidden ${esgSurfaceCardClass}`}
            styles={esgSurfaceCardStyles}
            title={
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                활동 양식 리스트
              </span>
            }
            extra={
              <div className={esgCardActionGroupClass}>
                <Button
                  type="link"
                  size="small"
                  className={esgCardLinkButtonClass}
                  disabled={!esgModuleOn}
                  onClick={() => setDashboardModal('subjects')}
                >
                  더보기
                </Button>
                <span className="tw-h-3 tw-w-px tw-bg-slate-200" />
                <Button
                  type="link"
                  size="small"
                  className={esgCardLinkButtonClass}
                  disabled={!esgModuleOn}
                  onClick={() => openSubjectModal(null)}
                >
                  추가
                </Button>
              </div>
            }
          >
            <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-xs tw-leading-relaxed">
              임직원이 선택해 인증하는 활동 양식입니다. 등록 {esgModuleOn ? subjects.length : '—'}건
              {!esgModuleOn ? ' (ESG OFF 시 목록 미조회)' : ''}
            </Typography.Paragraph>
            {esgModuleOn ? (
              <AppDataTable<EsgSubject>
                className={cardTableCls}
                rowKey={(r) => r.subjectId || JSON.stringify(r)}
                loading={subLoad}
                dataSource={previewSubjects}
                pagination={false}
                size="small"
                scroll={{ x: 520 }}
                columns={previewSubjectColumns}
              />
            ) : null}
          </Card>
        </div>
      </div>

      <AppSingleActionModal
        title="기능 설정"
        open={dashboardModal === 'config'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => {
          void cfgForm.validateFields().then(() => saveCfg.mutate());
        }}
        submitText="저장"
        submitLoading={saveCfg.isPending}
        submitButtonClassName={esgPrimaryButtonClass}
        width={520}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Card className={modalPanelCardClass} size="small" styles={modalPanelCardStyles}>
          <Form form={cfgForm} layout="vertical" className="tw-max-w-md">
            <Form.Item
              name="esgEnabledYn"
              label="ESG 그린장터"
              extra="ON이면 활동 인증, 포인트, 포인트샵이 모두 활성화되고, OFF면 비활성화됩니다."
            >
              <Radio.Group>
                <Radio value="YES">ON</Radio>
                <Radio value="NO">OFF</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="monthlyPointLimit" label="월간 포인트 상한">
              <InputNumber min={0} className="tw-w-full" />
            </Form.Item>
          </Form>
        </Card>
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="활동 양식"
        open={dashboardModal === 'subjects'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        width={960}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Card
          className={modalPanelCardClass}
          styles={modalPanelCardStyles}
          size="small"
          extra={
            <Button
              type="primary"
              size="small"
              className={esgPrimaryButtonClass}
              icon={<PlusOutlined />}
              onClick={() => openSubjectModal(null)}
            >
              추가
            </Button>
          }
        >
          <AppDataTable<EsgSubject>
            rowKey="subjectId"
            loading={subLoad}
            dataSource={subjects}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="small"
            scroll={{ x: 640 }}
            columns={[
              { title: '제목', dataIndex: 'title' },
              { title: '분류', dataIndex: 'category', width: 80 },
              { title: '기본점수', dataIndex: 'defaultPoints', width: 100 },
              {
                title: '',
                key: 'act',
                width: 120,
                render: (_, row) => (
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openSubjectModal(row)} />
                    <Popconfirm
                      title="삭제할까요?"
                      okButtonProps={{ className: esgPrimaryButtonClass }}
                      onConfirm={() => delSubject.mutate(row.subjectId)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="활동 승인"
        open={dashboardModal === 'approve'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        width={1120}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Space direction="vertical" className="tw-w-full" size={20}>
          <Card className={modalPanelCardClass} size="small" title="승인 대기" styles={modalPanelCardStyles}>
            <AppDataTable<EsgActivity>
              rowKey={(r) => pickActivityId(r) || JSON.stringify(r)}
              loading={pendLoad}
              dataSource={pendingActs}
              size="small"
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={wideTableScroll}
              columns={[
                {
                  title: '상태',
                  dataIndex: 'status',
                  width: 100,
                  render: (_: unknown, row) => formatActivityStatusKo(row.status),
                },
                {
                  title: '직원',
                  key: 'member',
                  width: 100,
                  ellipsis: true,
                  render: (_, row) => resolveMemberName(row),
                },
                {
                  title: 'ESG 분류',
                  key: 'category',
                  width: 200,
                  ellipsis: true,
                  render: (_, row) => resolveActivityCategoryDisplay(row),
                },
                {
                  title: '활동 양식',
                  key: 'subject',
                  width: 160,
                  ellipsis: true,
                  render: (_, row) => resolveActivitySubjectTitle(row, subjectTitleById),
                },
                {
                  title: '증빙',
                  key: 'verification',
                  width: 220,
                  ellipsis: true,
                  render: (_, row) => resolveVerificationContent(row),
                },
                {
                  title: '첨부',
                  key: 'file',
                  width: 72,
                  render: (_, row) => {
                    const url = resolveActivityFileUrl(row);
                    if (!url) {
                      return <Typography.Text type="secondary">—</Typography.Text>;
                    }
                    return (
                      <Typography.Link href={url} target="_blank" rel="noopener noreferrer">
                        열기
                      </Typography.Link>
                    );
                  },
                },
                {
                  title: '제출일',
                  key: 'createdAt',
                  width: 140,
                  render: (_, row) => formatActivityDateTime(resolveActivityCreatedAt(row)),
                },
                {
                  title: '처리',
                  key: 'a',
                  width: 200,
                  render: (_, row) => {
                    const id = pickActivityId(row);
                    if (!id) {
                      return (
                        <Typography.Text type="secondary" className="tw-text-xs">
                          활동 ID를 찾을 수 없습니다
                        </Typography.Text>
                      );
                    }
                    return (
                      <Space wrap>
                        <Popconfirm
                          title="이 활동을 승인할까요?"
                          okText="승인"
                          cancelText="취소"
                          okButtonProps={{ className: esgPrimaryButtonClass }}
                          onConfirm={() => approveM.mutate(id)}
                        >
                          <Button size="small" type="primary" className={esgPrimaryButtonClass} loading={approveM.isPending}>
                            승인
                          </Button>
                        </Popconfirm>
                        <Button
                          size="small"
                          danger
                          loading={rejectM.isPending}
                          onClick={() => {
                            setRejectId(id);
                            rejectForm.resetFields();
                            setRejectOpen(true);
                          }}
                        >
                          거절
                        </Button>
                      </Space>
                    );
                  },
                },
              ]}
            />
          </Card>
          <Card className={modalPanelCardClass} size="small" title="승인된 활동" styles={modalPanelCardStyles}>
            <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
              회사 전체 직원 기준 승인 완료된 활동입니다.
            </Typography.Paragraph>
            <AppDataTable<EsgActivity>
              rowKey={(r) => pickActivityId(r) || JSON.stringify(r)}
              loading={approvedLoad}
              dataSource={approvedActs}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              size="small"
              scroll={{ x: 1480 }}
              columns={[
                {
                  title: '상태',
                  dataIndex: 'status',
                  width: 100,
                  render: (_: unknown, row) => formatActivityStatusKo(row.status),
                },
                {
                  title: '직원',
                  key: 'member',
                  width: 100,
                  ellipsis: true,
                  render: (_, row) => resolveMemberName(row),
                },
                {
                  title: 'ESG 분류',
                  key: 'category',
                  width: 200,
                  ellipsis: true,
                  render: (_, row) => resolveActivityCategoryDisplay(row),
                },
                {
                  title: '활동 양식',
                  key: 'subject',
                  width: 160,
                  ellipsis: true,
                  render: (_, row) => resolveActivitySubjectTitle(row, subjectTitleById),
                },
                {
                  title: '증빙',
                  key: 'verification',
                  width: 220,
                  ellipsis: true,
                  render: (_, row) => resolveVerificationContent(row),
                },
                {
                  title: '첨부',
                  key: 'file',
                  width: 72,
                  render: (_, row) => {
                    const url = resolveActivityFileUrl(row);
                    if (!url) {
                      return <Typography.Text type="secondary">—</Typography.Text>;
                    }
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
                  width: 80,
                  render: (_, row) => resolveEarnedPointsDisplay(row),
                },
                {
                  title: '제출일',
                  key: 'createdAt',
                  width: 140,
                  render: (_, row) => formatActivityDateTime(resolveActivityCreatedAt(row)),
                },
                {
                  title: '승인일',
                  key: 'approvedAt',
                  width: 140,
                  render: (_, row) => formatActivityDateTime(resolveActivityApprovedAt(row)),
                },
              ]}
            />
          </Card>
        </Space>
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="샵 물품 조회"
        open={dashboardModal === 'shop'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        width={920}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
          등록된 포인트샵 물품 목록입니다. 행의「수정」을 누르면 수정 모달이 열리고, 새 물품은「등록」에서 추가하세요.
        </Typography.Paragraph>
        <Card className={modalPanelCardClass} size="small" title="등록 물품" styles={modalPanelCardStyles}>
          <AppDataTable<EsgShopItem>
            rowKey={(r) => r.itemId || JSON.stringify(r)}
            loading={shopLoad}
            dataSource={shopItems}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="small"
            scroll={{ x: 640 }}
            columns={[
              { title: '제목', dataIndex: 'title', ellipsis: true },
              {
                title: '포인트',
                dataIndex: 'requiredPoints',
                width: 96,
                render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
              },
              { title: '재고', dataIndex: 'stock', width: 72 },
              {
                title: '',
                key: 'edit',
                width: 88,
                render: (_, row) =>
                  row.itemId ? (
                    <button
                      type="button"
                      className="tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-text-xs tw-font-semibold tw-text-blue-600 hover:tw-text-blue-800 hover:tw-underline"
                      onClick={() => openShopItemEdit(row)}
                    >
                      수정
                    </button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </Card>
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="물품 등록"
        open={dashboardModal === 'shopRegister'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => void createShop.mutateAsync()}
        submitText="등록"
        submitLoading={createShop.isPending}
        submitIcon={<PlusOutlined />}
        submitButtonClassName={esgPrimaryButtonClass}
        width={560}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
          새 물품을 등록합니다. 전체 목록은「더보기」에서 확인할 수 있습니다.
        </Typography.Paragraph>
        <Card className={modalPanelCardClass} size="small" styles={modalPanelCardStyles}>
          <Form form={shopForm} layout="vertical" className="tw-max-w-xl">
            <Form.Item name="title" label="물품명" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="설명">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="requiredPoints" label="필요 포인트" rules={[{ required: true }]}>
              <InputNumber min={0} className="tw-w-full" />
            </Form.Item>
            <Form.Item name="stock" label="재고" rules={[{ required: true }]}>
              <InputNumber min={0} className="tw-w-full" />
            </Form.Item>
            <Form.Item label="이미지">
              <input type="file" accept="image/*" onChange={(e) => setShopFile(e.target.files?.[0] ?? null)} />
            </Form.Item>
          </Form>
        </Card>
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title={editingShopItem ? `물품 수정 — ${editingShopItem.title}` : '물품 수정'}
        open={Boolean(editingShopItem)}
        onClose={() => {
          setEditingShopItem(null);
          editShopForm.resetFields();
          setEditShopFile(null);
        }}
        onSubmit={() => void updateShop.mutateAsync()}
        submitText="저장"
        submitLoading={updateShop.isPending}
        submitButtonClassName={esgPrimaryButtonClass}
        width={560}
        zIndex={1100}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
          <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
            물품명·설명·포인트·재고를 변경할 수 있습니다. 이미지는 새 파일을 선택할 때만 교체됩니다.
          </Typography.Paragraph>
          <Card className={modalPanelCardClass} size="small" styles={modalPanelCardStyles}>
            <Form form={editShopForm} layout="vertical" className="tw-max-w-xl">
              <Form.Item name="title" label="물품명" rules={[{ required: true, message: '물품명을 입력해 주세요.' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label="설명">
                <Input.TextArea rows={3} placeholder="선택 사항" />
              </Form.Item>
              <Form.Item
                name="requiredPoints"
                label="필요 포인트"
                rules={[
                  { required: true, message: '필요 포인트를 입력해 주세요.' },
                  {
                    validator: (_, v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n) || n <= 0) {
                        return Promise.reject(new Error('1 이상의 숫자를 입력해 주세요.'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <InputNumber min={1} className="tw-w-full" />
              </Form.Item>
              <Form.Item
                name="stock"
                label="재고 수량"
                rules={[
                  { required: true, message: '재고를 입력해 주세요.' },
                  {
                    validator: (_, v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n) || n <= 0) {
                        return Promise.reject(new Error('1 이상의 숫자를 입력해 주세요.'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <InputNumber min={1} className="tw-w-full" />
              </Form.Item>
              {editingShopItem?.imageUrl ? (
                <div className="tw-mb-3">
                  <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">현재 이미지</Typography.Text>
                  <img
                    src={editingShopItem.imageUrl}
                    alt=""
                    className="tw-max-h-40 tw-max-w-full tw-rounded-lg tw-border tw-border-slate-200 tw-object-contain"
                  />
                </div>
              ) : null}
              <Form.Item label="이미지 교체">
                <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-mt-0 !tw-text-xs">
                  파일을 선택하면 서버에서 기존 이미지를 삭제한 뒤 새로 업로드합니다. 변경하지 않으려면 비워 두세요.
                </Typography.Paragraph>
                <input type="file" accept="image/*" onChange={(e) => setEditShopFile(e.target.files?.[0] ?? null)} />
              </Form.Item>
            </Form>
          </Card>
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="주문(전체)"
        open={dashboardModal === 'orders'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        width={960}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
          회사 전체 직원 구매 이력입니다. 최신순으로 표시됩니다. (관리자·ESG READ 권한)
        </Typography.Paragraph>
        <AppDataTable<EsgShopOrder>
          rowKey={(row) => row.esgShopOrderId || JSON.stringify(row)}
          loading={ordLoad}
          dataSource={allOrders}
          scroll={{ x: 960 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          size="small"
          columns={[
            {
              title: '구매일시',
              key: 'createdAt',
              width: 160,
              render: (_, row) => formatActivityDateTime(row.createdAt),
            },
            { title: '직원', dataIndex: 'memberName', width: 120, ellipsis: true },
            { title: '물품', dataIndex: 'itemTitle', ellipsis: true },
            {
              title: '사용 포인트',
              dataIndex: 'usedPoints',
              width: 110,
              render: (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${v}P` : '—'),
            },
          ]}
        />
        </div>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="월별 ESG 성과 집계"
        open={dashboardModal === 'scores'}
        onClose={() => setDashboardModal(null)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        width={880}
        destroyOnHidden
        styles={{ body: modalScrollableBody }}
      >
        <div className={esgModalContentClass}>
        <Space direction="vertical" className="tw-w-full" size={20}>
          <Card className={modalPanelCardClass} size="small" title="월별 성과 집계 실행" styles={modalPanelCardStyles}>
            <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
              지정한 월의 ESG 활동 점수와 등급을 다시 산정합니다.
            </Typography.Paragraph>
            <Space wrap>
              <Input
                placeholder="YYYY-MM (예: 2026-04)"
                value={scoreMonth}
                onChange={(e) => setScoreMonth(e.target.value)}
                className="tw-w-48"
              />
              <Button
                type="primary"
                className={esgPrimaryButtonClass}
                loading={aggScore.isPending}
                onClick={() => aggScore.mutate()}
              >
                집계 실행
              </Button>
            </Space>
          </Card>
          <Card className={modalPanelCardClass} size="small" title="월별 점수·등급 이력" styles={modalPanelCardStyles}>
            <AppDataTable<EsgScoreHistoryRow>
              rowKey={(row) => pickEsgScoreRowId(row) || JSON.stringify(row)}
              loading={scoreLoad}
              dataSource={scoreHist as EsgScoreHistoryRow[]}
              scroll={{ x: 720 }}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              columns={[
                { title: '연월', width: 110, render: (_, row) => pickYearMonth(row) },
                { title: '총점', width: 100, render: (_, row) => pickTotalScore(row) },
                { title: '등급', width: 100, render: (_, row) => pickGrade(row) },
                {
                  title: '등급 설명',
                  ellipsis: true,
                  render: (_, row) => pickGradeDescription(row),
                },
              ]}
            />
          </Card>
        </Space>
        </div>
      </AppSingleActionModal>

      <AppDoubleActionModal
        title={editingSubject ? '활동 양식 수정' : '활동 양식 추가'}
        open={subModalOpen}
        onClose={() => {
          setSubModalOpen(false);
          setEditingSubject(null);
        }}
        onConfirm={() => void saveSubject.mutateAsync()}
        confirmLoading={saveSubject.isPending}
        confirmButtonClassName={esgPrimaryButtonClass}
        destroyOnHidden
        confirmText="확인"
      >
        <div className="tw-px-5 tw-py-4">
        <Form form={subForm} layout="vertical">
          <Form.Item name="title" label="제목" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="category" label="분류" rules={[{ required: true }]}>
            <Select options={CAT_OPTS} />
          </Form.Item>
          <Form.Item name="defaultPoints" label="기본 포인트" rules={[{ required: true }]}>
            <InputNumber min={0} className="tw-w-full" />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title="거절 사유"
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false);
          setRejectId(null);
          rejectForm.resetFields();
        }}
        onConfirm={() =>
          void rejectForm.validateFields().then((v) => {
            if (!rejectId) return Promise.reject(new Error('missing id'));
            return rejectM.mutateAsync({ id: rejectId, reason: v.reason.trim() });
          })
        }
        confirmLoading={rejectM.isPending}
        confirmButtonClassName={esgPrimaryButtonClass}
        destroyOnHidden
        confirmText="확인"
      >
        <div className="tw-px-5 tw-py-4">
        <Form form={rejectForm} layout="vertical" className="tw-pt-1">
          <Form.Item name="reason" label="사유" rules={[{ required: true, message: '거절 사유를 입력해 주세요.' }]}>
            <Input.TextArea rows={4} placeholder="거절 사유를 입력해 주세요." />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
    </Space>
  );
}

type EsgMetricCardProps = {
  label: string;
  value: string;
  unit?: string;
  subValue?: string;
};

function EsgMetricCard({ label, value, unit, subValue }: EsgMetricCardProps) {
  return (
    <Card
      className={`tw-h-full ${esgSurfaceCardClass}`}
      styles={esgMetricCardStyles}
    >
      <div className="tw-flex tw-h-full tw-flex-col tw-gap-4">
        <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">
          {label}
        </div>
        <div className="tw-mt-auto">
          <div className="tw-min-w-0">
            <div className="tw-flex tw-items-baseline tw-gap-1">
              <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
                {value}
              </span>
              {unit ? <span className="tw-text-xs tw-font-bold tw-text-slate-400">{unit}</span> : null}
            </div>
            {subValue ? <div className="tw-mt-2 tw-text-xs tw-font-medium tw-text-slate-500">{subValue}</div> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
