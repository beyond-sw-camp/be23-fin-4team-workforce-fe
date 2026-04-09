import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import type { ApiError } from '@/shared/api/types';
import type { EsgActivity, EsgCampaign, EsgSubject, EsgSubjectCategory } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  formatActivityDateTime,
  formatActivityStatusKo,
  pickActivityId,
  resolveActivityCategoryDisplay,
  resolveActivityFileUrl,
  resolveActivitySubjectTitle,
  resolveMemberName,
  resolveVerificationContent,
} from '@/features/esg/esgActivityDisplay';
import {
  formatCampaignCreatedAt,
  formatCampaignDateRange,
  formatCampaignStatusKo,
  pickCampaignId,
  resolveCampaignCategoryDisplay,
} from '@/features/esg/esgCampaignDisplay';
import type { EsgScoreHistoryRow } from '@/features/esg/esgScoreDisplay';
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

function pickId(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

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
  const [campForm] = Form.useForm();
  const [shopForm] = Form.useForm();
  const [shopFile, setShopFile] = useState<File | null>(null);
  const [scoreMonth, setScoreMonth] = useState('');
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
  /** ESG OFF면 서버가 주제·활동·캠페인·샵 등 READ API를 403으로 막는 경우가 있어, 호출하지 않음 */
  const esgModuleOn = cfgQuery.isSuccess && cfg?.esgEnabledYn === 'YES';

  useEffect(() => {
    if (!cfg) return;
    cfgForm.setFieldsValue({
      esgEnabledYn: cfg.esgEnabledYn,
      rewardEnabledYn: cfg.rewardEnabledYn ?? 'YES',
      campaignEnabledYn: cfg.campaignEnabledYn ?? 'YES',
      shopEnabledYn: cfg.shopEnabledYn ?? 'YES',
      monthlyPointLimit: cfg.monthlyPointLimit ?? 1000,
    });
  }, [cfg, cfgForm]);

  const saveCfg = useMutation({
    mutationFn: () => {
      const v = cfgForm.getFieldsValue();
      return esgApi.updateConfig({
        esgEnabledYn: v.esgEnabledYn,
        rewardEnabledYn: v.rewardEnabledYn,
        campaignEnabledYn: v.campaignEnabledYn,
        shopEnabledYn: v.shopEnabledYn,
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

  const campaignsQuery = useQuery({
    queryKey: ['esg', 'campaigns', 'admin'],
    queryFn: () => esgApi.listCampaigns(),
    enabled: esgModuleOn,
    retry: retryUnlessAuthDenied,
  });
  const { data: campaigns = [], isLoading: campLoad } = campaignsQuery;

  const createCamp = useMutation({
    mutationFn: async () => {
      const v = await campForm.validateFields();
      const [sd, ed] = v.range as [dayjs.Dayjs, dayjs.Dayjs];
      await esgApi.createCampaign({
        title: v.title.trim(),
        description: (v.description ?? '').trim(),
        category: v.category,
        startDate: sd.format('YYYY-MM-DD'),
        endDate: ed.format('YYYY-MM-DD'),
        rewardPoints: Number(v.rewardPoints),
        maxParticipants: Number(v.maxParticipants),
      });
    },
    onSuccess: () => {
      message.success('캠페인을 등록했습니다.');
      campForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['esg', 'campaigns'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const closeCamp = useMutation({
    mutationFn: (id: string) => esgApi.closeCampaign(id),
    onSuccess: () => {
      message.success('캠페인을 종료했습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'campaigns'] });
    },
    onError: (e: Error) => message.error(e.message || '종료에 실패했습니다.'),
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
      campaignsQuery,
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
    campaignsQuery.isError,
    campaignsQuery.error,
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

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
        ESG 관리
      </Typography.Title>

      {cfgQuery.isSuccess && cfg?.esgEnabledYn === 'NO' ? (
        <Alert
          type="info"
          showIcon
          className="tw-w-full"
          message="ESG 기능이 OFF입니다"
          description="이 상태에서는 주제·활동 승인·캠페인·샵 등 데이터를 불러오지 않습니다. 설정 탭에서 ON으로 바꾼 뒤 저장하면 목록 API가 호출됩니다."
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

      <Tabs
        items={[
          {
            key: 'cfg',
            label: '설정',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Form form={cfgForm} layout="vertical" className="tw-max-w-md">
                  <Form.Item name="esgEnabledYn" label="ESG 기능 사용">
                    <Radio.Group>
                      <Radio value="YES">ON</Radio>
                      <Radio value="NO">OFF</Radio>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="rewardEnabledYn" label="포인트·보상">
                    <Radio.Group>
                      <Radio value="YES">ON</Radio>
                      <Radio value="NO">OFF</Radio>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="campaignEnabledYn" label="캠페인">
                    <Radio.Group>
                      <Radio value="YES">ON</Radio>
                      <Radio value="NO">OFF</Radio>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="shopEnabledYn" label="사내 샵">
                    <Radio.Group>
                      <Radio value="YES">ON</Radio>
                      <Radio value="NO">OFF</Radio>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="monthlyPointLimit" label="월간 포인트 상한">
                    <InputNumber min={0} className="tw-w-full" />
                  </Form.Item>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saveCfg.isPending}
                    onClick={() => {
                      void cfgForm.validateFields().then(() => saveCfg.mutate());
                    }}
                  >
                    저장
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'subjects',
            label: '활동 양식',
            children: (
              <Card
                className="tw-border-slate-200/80 tw-shadow-sm"
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openSubjectModal(null)}>
                    추가
                  </Button>
                }
              >
                <Table<EsgSubject>
                  rowKey="subjectId"
                  loading={subLoad}
                  dataSource={subjects}
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
                          <Popconfirm title="삭제할까요?" onConfirm={() => delSubject.mutate(row.subjectId)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'approve',
            label: '활동 승인',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table<EsgActivity>
                  rowKey={(r) => pickActivityId(r) || JSON.stringify(r)}
                  loading={pendLoad}
                  dataSource={pendingActs}
                  scroll={{ x: 1280 }}
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
                      render: (_, row) => formatActivityDateTime(row.createdAt),
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
                              onConfirm={() => approveM.mutate(id)}
                            >
                              <Button size="small" type="primary" loading={approveM.isPending}>
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
            ),
          },
          {
            key: 'campaigns',
            label: '캠페인',
            children: (
              <Space direction="vertical" className="tw-w-full" size={16}>
                <Card className="tw-border-slate-200/80 tw-shadow-sm" title="캠페인 등록">
                  <Form form={campForm} layout="vertical" className="tw-max-w-xl">
                    <Form.Item name="title" label="제목" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="description" label="설명">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name="category" label="분류" rules={[{ required: true }]}>
                      <Select options={CAT_OPTS} />
                    </Form.Item>
                    <Form.Item name="range" label="기간" rules={[{ required: true }]}>
                      <DatePicker.RangePicker className="tw-w-full" />
                    </Form.Item>
                    <Form.Item name="rewardPoints" label="보상 포인트" rules={[{ required: true }]}>
                      <InputNumber min={0} className="tw-w-full" />
                    </Form.Item>
                    <Form.Item name="maxParticipants" label="최대 인원" rules={[{ required: true }]}>
                      <InputNumber min={1} className="tw-w-full" />
                    </Form.Item>
                    <Button type="primary" loading={createCamp.isPending} onClick={() => void createCamp.mutateAsync()}>
                      등록
                    </Button>
                  </Form>
                </Card>
                <Card className="tw-border-slate-200/80 tw-shadow-sm" title="캠페인 목록">
                  <Table<EsgCampaign>
                    rowKey={(r) => pickCampaignId(r) || JSON.stringify(r)}
                    loading={campLoad}
                    dataSource={campaigns}
                    scroll={{ x: 1320 }}
                    columns={[
                      { title: '제목', dataIndex: 'title', width: 160, ellipsis: true },
                      {
                        title: '설명',
                        dataIndex: 'description',
                        ellipsis: true,
                        render: (v: unknown) =>
                          typeof v === 'string' && v.trim() ? (
                            v.trim()
                          ) : (
                            <Typography.Text type="secondary">—</Typography.Text>
                          ),
                      },
                      {
                        title: 'ESG 분류',
                        key: 'category',
                        width: 200,
                        ellipsis: true,
                        render: (_, row) => resolveCampaignCategoryDisplay(row),
                      },
                      {
                        title: '상태',
                        key: 'status',
                        width: 88,
                        render: (_, row) => formatCampaignStatusKo(row.status),
                      },
                      {
                        title: '기간',
                        key: 'range',
                        width: 200,
                        render: (_, row) => formatCampaignDateRange(row),
                      },
                      {
                        title: '보상',
                        dataIndex: 'rewardPoints',
                        width: 80,
                        render: (v: unknown) => {
                          if (v == null || v === '') return '—';
                          const n = Number(v);
                          return Number.isFinite(n) ? `${n}P` : '—';
                        },
                      },
                      {
                        title: '최대 인원',
                        dataIndex: 'maxParticipants',
                        width: 96,
                        render: (v: unknown) => {
                          if (v == null || v === '') return '—';
                          const n = Number(v);
                          return Number.isFinite(n) ? n : '—';
                        },
                      },
                      {
                        title: '등록일',
                        key: 'createdAt',
                        width: 140,
                        render: (_, row) => formatCampaignCreatedAt(row),
                      },
                      {
                        title: '',
                        key: 'c',
                        width: 100,
                        render: (_, row) => {
                          const id = pickCampaignId(row);
                          if (!id) return null;
                          const st = String(row.status ?? '').toUpperCase();
                          if (st !== 'ACTIVE') {
                            return <Typography.Text type="secondary">—</Typography.Text>;
                          }
                          return (
                            <Button
                              size="small"
                              icon={<StopOutlined />}
                              loading={closeCamp.isPending}
                              onClick={() => closeCamp.mutate(id)}
                            >
                              종료
                            </Button>
                          );
                        },
                      },
                    ]}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'shop',
            label: '샵 물품',
            children: (
              <Space direction="vertical" className="tw-w-full" size={16}>
                <Card className="tw-border-slate-200/80 tw-shadow-sm" title="물품 등록">
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
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setShopFile(e.target.files?.[0] ?? null)}
                      />
                    </Form.Item>
                    <Button type="primary" loading={createShop.isPending} onClick={() => void createShop.mutateAsync()}>
                      등록
                    </Button>
                  </Form>
                </Card>
                <Card className="tw-border-slate-200/80 tw-shadow-sm" title="등록 물품">
                  <Table
                    rowKey={(r) => r.itemId || JSON.stringify(r)}
                    loading={shopLoad}
                    dataSource={shopItems}
                    columns={[
                      { title: '제목', dataIndex: 'title' },
                      { title: '포인트', dataIndex: 'requiredPoints' },
                      { title: '재고', dataIndex: 'stock' },
                    ]}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'orders',
            label: '주문(전체)',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table
                  rowKey={(row) => JSON.stringify(row)}
                  loading={ordLoad}
                  dataSource={allOrders as Record<string, unknown>[]}
                  columns={[
                    {
                      title: '주문',
                      render: (_, row) => JSON.stringify(row).slice(0, 80),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'scores',
            label: '점수',
            children: (
              <Space direction="vertical" className="tw-w-full" size={16}>
                <Card className="tw-border-slate-200/80 tw-shadow-sm" title="월별 집계">
                  <Space wrap>
                    <Input
                      placeholder="YYYY-MM (예: 2026-04)"
                      value={scoreMonth}
                      onChange={(e) => setScoreMonth(e.target.value)}
                      className="tw-w-48"
                    />
                    <Button type="primary" loading={aggScore.isPending} onClick={() => aggScore.mutate()}>
                      집계 실행
                    </Button>
                  </Space>
                </Card>
                <Card className="tw-border-slate-200/80 tw-shadow-sm" title="점수 이력">
                  <Table<EsgScoreHistoryRow>
                    rowKey={(row) => pickEsgScoreRowId(row) || JSON.stringify(row)}
                    loading={scoreLoad}
                    dataSource={scoreHist as EsgScoreHistoryRow[]}
                    scroll={{ x: 720 }}
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
            ),
          },
        ]}
      />

      <Modal
        title={editingSubject ? '활동 양식 수정' : '활동 양식 추가'}
        open={subModalOpen}
        onCancel={() => {
          setSubModalOpen(false);
          setEditingSubject(null);
        }}
        onOk={() => void saveSubject.mutateAsync()}
        confirmLoading={saveSubject.isPending}
        destroyOnClose
      >
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
      </Modal>

      <Modal
        title="거절 사유"
        open={rejectOpen}
        onCancel={() => {
          setRejectOpen(false);
          setRejectId(null);
          rejectForm.resetFields();
        }}
        onOk={() =>
          rejectForm.validateFields().then((v) => {
            if (!rejectId) return Promise.reject(new Error('missing id'));
            return rejectM.mutateAsync({ id: rejectId, reason: v.reason.trim() });
          })
        }
        confirmLoading={rejectM.isPending}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical" className="tw-pt-1">
          <Form.Item
            name="reason"
            label="사유"
            rules={[{ required: true, message: '거절 사유를 입력해 주세요.' }]}
          >
            <Input.TextArea rows={4} placeholder="거절 사유를 입력해 주세요." />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
