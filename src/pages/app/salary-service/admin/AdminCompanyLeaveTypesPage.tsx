/**
 * /app/leave/types — 회사 휴가 종류 관리 (시스템 관리자)
 * 시스템 기본 휴가(연차, 반차, 병가 등)는 이름/순서만 수정 가능, 삭제 불가.
 * 커스텀 휴가는 전 필드 수정/삭제 가능.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { memberApi } from '@/features/member/api/memberApi';
import { useAuth } from '@/features/auth/useAuth';
import { AdminLeaveGrantPage } from '@/pages/app/salary-service/admin/AdminLeaveGrantPage';
import type {
  BalanceTypeCode,
  CompanyLeaveType,
} from '@/features/salary-service/types';

type FormValues = {
  name: string;
  isPaidYn: 'Y' | 'N';
  maxDaysPerYear?: number | null;
  requireEvidenceYn: 'Y' | 'N';
  usageDeadlineDays?: number | null;
  displayOrder: number;
};

// 수정 불가 휴가 (연차/월차/반차) 잔고 차감 룰이 시스템에 박혀있어 변경 시 정합성 깨짐
// 삭제 불가 휴가 (연차) 회사 운영의 최소 기준이라 절대 삭제 X
//  그 외는 모두 자유롭게 수정 / 삭제 가능
const LOCKED_NAMES = new Set<string>(['연차', '월차']);
const UNDELETABLE_NAMES = new Set<string>(['연차']);

// 기본 휴가 카탈로그 백엔드 initializeDefaults spec 과 동기화
//  required: 무조건 시드 (체크박스 비활성)
//  recommended: 디폴트 체크
//  optional: 디폴트 미체크 (회사가 안 쓰는 경우가 많은 항목)
type DefaultSpecMeta = {
  code: string;
  name: string;
  required?: boolean;       // 체크 해제 불가
  defaultChecked: boolean;  // 모달 진입 시 기본 체크 여부
};

type DefaultSection = {
  key: string;
  title: string;
  description?: string;
  items: DefaultSpecMeta[];
};

const DEFAULT_CATALOG: DefaultSection[] = [
  {
    key: 'annual',
    title: '연차·반차',
    description: '연차는 필수입니다. 반차는 회사 정책에 따라 선택하세요.',
    items: [
      { code: 'ANNUAL',  name: '연차',         required: true,  defaultChecked: true  },
      { code: 'HALF_AM', name: '반차(오전)',    defaultChecked: false }, // 옵션 — 안 쓰는 회사도 많음
      { code: 'HALF_PM', name: '반차(오후)',    defaultChecked: false },
    ],
  },
  {
    key: 'bereavement',
    title: '경조사',
    description: '근로기준법상 의무는 아니지만 대부분 회사가 운영합니다.',
    items: [
      { code: 'BEREAVEMENT',    name: '경조휴가(일반)',     defaultChecked: true },
      { code: 'MARRIAGE_SELF',  name: '결혼(본인)',         defaultChecked: true },
      { code: 'MARRIAGE_CHILD', name: '결혼(자녀)',         defaultChecked: true },
      { code: 'BIRTH_SPOUSE',   name: '배우자 출산휴가',    defaultChecked: true },
      { code: 'DEATH_PARENT',   name: '부모 사망',          defaultChecked: true },
      { code: 'DEATH_SPOUSE',   name: '배우자 사망',        defaultChecked: true },
      { code: 'DEATH_CHILD',    name: '자녀 사망',          defaultChecked: true },
      { code: 'DEATH_SIBLING',  name: '형제자매 사망',      defaultChecked: true },
    ],
  },
  {
    key: 'statutory',
    title: '기타 법정 휴가',
    description: '국가가 인정하는 법정 휴가입니다.',
    items: [
      { code: 'PUBLIC',           name: '공가',     defaultChecked: true  },
      { code: 'SICK',             name: '병가',     defaultChecked: true  },
      { code: 'RESERVE_TRAINING', name: '예비군',   defaultChecked: true  },
      { code: 'CIVIL_DEFENSE',    name: '민방위',   defaultChecked: true  },
    ],
  },
  {
    key: 'female',
    title: '여성 보호',
    description: '회사 정책에 따라 선택하세요 (근로기준법 제73조).',
    items: [
      { code: 'MENSTRUATION', name: '생리휴가', defaultChecked: false },
    ],
  },
];
const isHalfDay = (name?: string | null) =>
  !!name && (name.startsWith('반차') || name === '오전반차' || name === '오후반차');
const isLocked = (record: CompanyLeaveType) =>
  LOCKED_NAMES.has(record.name ?? '') || isHalfDay(record.name);
// 반차만 삭제 가능 그 외 시스템 기본은 삭제 불가 커스텀은 항상 삭제 가능
// 연차만 삭제 불가 그 외 시스템 기본·커스텀 모두 삭제 가능
const canDelete = (record: CompanyLeaveType) =>
  !UNDELETABLE_NAMES.has(record.name ?? '');

const BALANCE_KO: Record<string, string> = {
  ANNUAL: '당해 연차',
  MONTHLY: '월차',
  CARRYOVER: '이월 연차',
};

const QK = ['salary', 'company-leave-types'] as const;

export function AdminCompanyLeaveTypesPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CompanyLeaveType | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  // 행 클릭 시 우측 Drawer 에 표시할 상세 대상
  const [detailTarget, setDetailTarget] = useState<CompanyLeaveType | null>(null);

  // [수동 휴가 부여] 모달 — 회사 직원에게 잔고를 직접 INSERT (배치 대기 없이 즉시 반영)
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm] = Form.useForm<{
    memberId: string;
    balanceType: BalanceTypeCode;
    totalGranted: number;
    expirationDate?: Dayjs | null;
  }>();
  const [memberKeyword, setMemberKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(memberKeyword), 320);
    return () => clearTimeout(t);
  }, [memberKeyword]);
  const memberSearchQ = useQuery({
    queryKey: ['member', 'search', 'leave-grant', debouncedKeyword],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debouncedKeyword.trim(), page: 0, size: 30 }),
    enabled: debouncedKeyword.trim().length >= 1,
  });

  const grantMut = useMutation({
    mutationFn: (v: {
      memberId: string;
      balanceType: BalanceTypeCode;
      totalGranted: number;
      expirationDate?: Dayjs | null;
    }) =>
      attendanceApi.memberBalance.grant({
        memberId: v.memberId,
        balanceType: v.balanceType,
        totalGranted: v.totalGranted,
        expirationDate: v.expirationDate ? v.expirationDate.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('휴가 잔고가 부여되었습니다.');
      setGrantOpen(false);
      grantForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'member-balance'] });
      void qc.invalidateQueries({ queryKey: ['attendance', 'member-balance'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      void message.error(e?.response?.data?.message ?? e?.message ?? '부여에 실패했습니다.');
    },
  });

  const onGrantOpen = () => {
    grantForm.resetFields();
    grantForm.setFieldsValue({
      balanceType: 'ANNUAL',
      totalGranted: 15,
      expirationDate: dayjs().add(1, 'year').endOf('year'),
    });
    setGrantOpen(true);
  };

  const onSubmitGrant = async () => {
    try {
      const v = await grantForm.validateFields();
      grantMut.mutate(v);
    } catch {
      // antd 가 자동 표시
    }
  };

  // [기본 휴가 불러오기] 선택 모달 — 패턴 D
  const [initOpen, setInitOpen] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => {
    const init = new Set<string>();
    DEFAULT_CATALOG.forEach((sec) =>
      sec.items.forEach((it) => {
        if (it.defaultChecked) init.add(it.code);
      }),
    );
    return init;
  });

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSection = (section: DefaultSection, checked: boolean) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      section.items.forEach((it) => {
        if (it.required) {
          // 필수 항목은 항상 켜져 있음
          next.add(it.code);
          return;
        }
        if (checked) next.add(it.code);
        else next.delete(it.code);
      });
      return next;
    });
  };

  const openInitModal = () => {
    // 모달 열 때 기본 체크 = (default + 이미 등록된 것) 새로 추가될 것만 다루므로 등록된 건 이미 SKIP 됨
    const init = new Set<string>();
    DEFAULT_CATALOG.forEach((sec) =>
      sec.items.forEach((it) => {
        if (it.required || it.defaultChecked) init.add(it.code);
      }),
    );
    setSelectedCodes(init);
    setInitOpen(true);
  };

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.companyLeaveType.list(),
  });

  // 이미 등록된 코드 — 모달에서 회색 처리 (이미 있음 표시)
  const existingCodes = useMemo(() => {
    const set = new Set<string>();
    (listQ.data ?? []).forEach((r) => {
      if (r.code) set.add(r.code);
    });
    return set;
  }, [listQ.data]);

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.companyLeaveType.create({
        name: v.name.trim(),
        // 잔고 차감 휴가 (연차/월차/반차) 는 시스템 기본만 존재 추가 휴가는 항상 차감 없음
        balanceType: null,
        daysPerUse: 1,
        isPaidYn: v.isPaidYn,
        maxDaysPerYear: v.maxDaysPerYear ?? null,
        requireEvidenceYn: v.requireEvidenceYn,
        usageDeadlineDays: v.usageDeadlineDays ?? null,
        displayOrder: v.displayOrder,
      }),
    onSuccess: () => {
      message.success('휴가 종류가 생성되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '생성에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: {
      id: string;
      v: FormValues;
      daysPerUse: number;
      // 시스템 기본 휴가의 기존 balanceType 보존
      keepBalanceType: BalanceTypeCode | null;
    }) =>
      attendanceApi.companyLeaveType.update(input.id, {
        name: input.v.name.trim(),
        balanceType: input.keepBalanceType,
        daysPerUse: input.daysPerUse,
        isPaidYn: input.v.isPaidYn,
        maxDaysPerYear: input.v.maxDaysPerYear ?? null,
        requireEvidenceYn: input.v.requireEvidenceYn,
        usageDeadlineDays: input.v.usageDeadlineDays ?? null,
        displayOrder: input.v.displayOrder,
      }),
    onSuccess: () => {
      message.success('휴가 종류가 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.companyLeaveType.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  // 두 휴가의 displayOrder 를 swap 하여 순서 위/아래 이동
  const swapM = useMutation({
    mutationFn: async (input: { a: CompanyLeaveType; b: CompanyLeaveType }) => {
      const { a, b } = input;
      const orderA = a.displayOrder ?? 0;
      const orderB = b.displayOrder ?? 0;
      await Promise.all([
        attendanceApi.companyLeaveType.update(a.companyLeaveTypeId!, {
          name: a.name ?? '',
          balanceType: a.balanceType ?? null,
          daysPerUse: a.daysPerUse ?? 1,
          isPaidYn: a.isPaidYn ?? 'Y',
          maxDaysPerYear: a.maxDaysPerYear ?? null,
          requireEvidenceYn: a.requireEvidenceYn ?? 'N',
          usageDeadlineDays: a.usageDeadlineDays ?? null,
          displayOrder: orderB,
        }),
        attendanceApi.companyLeaveType.update(b.companyLeaveTypeId!, {
          name: b.name ?? '',
          balanceType: b.balanceType ?? null,
          daysPerUse: b.daysPerUse ?? 1,
          isPaidYn: b.isPaidYn ?? 'Y',
          maxDaysPerYear: b.maxDaysPerYear ?? null,
          requireEvidenceYn: b.requireEvidenceYn ?? 'N',
          usageDeadlineDays: b.usageDeadlineDays ?? null,
          displayOrder: orderA,
        }),
      ]);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '순서 변경에 실패했습니다.'),
  });

  // displayOrder 오름차순 정렬된 행 ↑↓ 인접 swap 에 사용
  const sortedRows = useMemo(
    () =>
      [...(listQ.data ?? [])].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
      ),
    [listQ.data],
  );

  const moveUp = (record: CompanyLeaveType) => {
    const idx = sortedRows.findIndex(
      (r) => r.companyLeaveTypeId === record.companyLeaveTypeId,
    );
    if (idx <= 0) return;
    swapM.mutate({ a: record, b: sortedRows[idx - 1] });
  };

  const moveDown = (record: CompanyLeaveType) => {
    const idx = sortedRows.findIndex(
      (r) => r.companyLeaveTypeId === record.companyLeaveTypeId,
    );
    if (idx === -1 || idx >= sortedRows.length - 1) return;
    swapM.mutate({ a: record, b: sortedRows[idx + 1] });
  };

  const initDefaultsM = useMutation({
    mutationFn: async (codes: string[]) => {
      const companyId = user?.companyId?.trim();
      if (!companyId) {
        throw new Error('회사 정보가 없어 기본 휴가를 불러올 수 없습니다.');
      }
      await attendanceApi.companyLeaveType.initDefaults(companyId, codes);
    },
    onSuccess: async () => {
      message.success('선택한 기본 휴가가 등록되었습니다.');
      setInitOpen(false);
      await qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '기본 휴가 불러오기에 실패했습니다.'),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      isPaidYn: 'Y',
      requireEvidenceYn: 'N',
      displayOrder: (listQ.data ?? []).length + 1,
    });
    setOpen(true);
  };

  const openEdit = (record: CompanyLeaveType) => {
    // 연차 월차 반차 는 수정 불가 모달 자체 안 띄움
    if (isLocked(record)) {
      message.info('연차·월차·반차는 수정할 수 없습니다.');
      return;
    }
    setEditing(record);
    form.setFieldsValue({
      name: record.name ?? '',
      isPaidYn: (record.isPaidYn as 'Y' | 'N') ?? 'Y',
      maxDaysPerYear: record.maxDaysPerYear ?? undefined,
      requireEvidenceYn: (record.requireEvidenceYn as 'Y' | 'N') ?? 'N',
      usageDeadlineDays: record.usageDeadlineDays ?? undefined,
      displayOrder: record.displayOrder ?? 0,
    });
    setOpen(true);
  };

  const onSubmit = (v: FormValues) => {
    if (editing?.companyLeaveTypeId) {
      updateM.mutate({
        id: editing.companyLeaveTypeId,
        v,
        daysPerUse: editing.daysPerUse ?? 1,
        keepBalanceType: (editing.balanceType as BalanceTypeCode | null) ?? null,
      });
    } else {
      createM.mutate(v);
    }
  };

  const columns = useMemo<ColumnsType<CompanyLeaveType>>(
    () => [
      {
        // 좌측 drag handle 시각적 hint 실제 DnD 는 다음 단계 ↑↓ 버튼으로 정렬
        title: '',
        key: 'dragHandle',
        width: 32,
        align: 'center',
        render: () => (
          <span className="tw-text-slate-300 tw-cursor-grab">
            <HolderOutlined />
          </span>
        ),
      },
      {
        title: '이름',
        dataIndex: 'name',
        key: 'name',
        render: (v: string, r) => (
          <Space size={4}>
            <Typography.Text>{v ?? '—'}</Typography.Text>
            {r.isSystemDefault ? <Tag color="blue">기본</Tag> : null}
          </Space>
        ),
      },
      {
        title: '잔고 유형',
        dataIndex: 'balanceType',
        key: 'balanceType',
        width: 130,
        render: (v: string | null) =>
          v ? BALANCE_KO[v] ?? v : <Typography.Text type="secondary">차감 없음</Typography.Text>,
      },
      {
        title: '유급',
        dataIndex: 'isPaidYn',
        key: 'isPaidYn',
        width: 90,
        align: 'center',
        render: (v: string) => (v === 'Y' ? <Tag color="green">유급</Tag> : <Tag>무급</Tag>),
      },
      {
        title: '연 한도',
        dataIndex: 'maxDaysPerYear',
        key: 'maxDaysPerYear',
        width: 110,
        align: 'right',
        render: (v: number | null) =>
          v == null ? <Typography.Text type="secondary">—</Typography.Text> : `${v}일`,
      },
      {
        title: '작업',
        key: 'actions',
        width: 220,
        align: 'center',
        // 행 클릭 onClick 과 충돌 방지 위해 stopPropagation 처리
        render: (_, record) => {
          const idx = sortedRows.findIndex(
            (r) => r.companyLeaveTypeId === record.companyLeaveTypeId,
          );
          const isFirst = idx === 0;
          const isLast = idx === sortedRows.length - 1;
          const locked = isLocked(record);
          const deletable = canDelete(record);
          return (
            <Space size={4} onClick={(e) => e.stopPropagation()}>
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={isFirst}
                loading={swapM.isPending}
                onClick={() => moveUp(record)}
              />
              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                disabled={isLast}
                loading={swapM.isPending}
                onClick={() => moveDown(record)}
              />
              <Button
                size="small"
                disabled={locked}
                onClick={() => openEdit(record)}
              >
                수정
              </Button>
              {deletable ? (
                <Popconfirm
                  title="정말 삭제하시겠어요?"
                  description="이 휴가 종류를 선택해 사용 중인 기존 신청은 유지됩니다."
                  okText="삭제"
                  cancelText="취소"
                  onConfirm={() =>
                    record.companyLeaveTypeId && deleteM.mutate(record.companyLeaveTypeId)
                  }
                >
                  <Button size="small" danger>
                    삭제
                  </Button>
                </Popconfirm>
              ) : (
                <Typography.Text type="secondary" className="tw-text-xs">
                  삭제 불가
                </Typography.Text>
              )}
            </Space>
          );
        },
      },
    ],
    [deleteM, sortedRows, swapM],
  );

  return (
    <Tabs
      defaultActiveKey="types"
      items={[
        {
          key: 'types',
          label: '휴가 종류 관리',
          children: (
            <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            휴가 관리
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            직원이 휴가 신청 시 선택하는 휴가 종류를 관리합니다.
          </Typography.Text>
        </div>
        <Space>
          <Button onClick={onGrantOpen}>
            수동 휴가 부여
          </Button>
          <Button loading={initDefaultsM.isPending} onClick={openInitModal}>
            기본 휴가 불러오기
          </Button>
          <Button type="primary" onClick={openCreate}>
            휴가 종류 추가
          </Button>
        </Space>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<CompanyLeaveType>
          rowKey={(r) => r.companyLeaveTypeId ?? `${r.name}-${r.displayOrder}`}
          loading={listQ.isLoading}
          dataSource={sortedRows}
          columns={columns}
          pagination={false}
          size="small"
          locale={{ emptyText: '등록된 휴가 종류가 없습니다.' }}
          onRow={(record) => ({
            onClick: () => setDetailTarget(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* 우측 Drawer 행 클릭 시 증빙 사용기한 순서 등 상세 메타 표시 */}
      <Drawer
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        width={420}
        title={
          detailTarget ? (
            <Space size={4}>
              <span>{detailTarget.name ?? '—'}</span>
              {detailTarget.isSystemDefault ? <Tag color="blue">기본</Tag> : null}
            </Space>
          ) : (
            '휴가 상세'
          )
        }
        extra={
          detailTarget && (
            <Button
              type="primary"
              onClick={() => {
                openEdit(detailTarget);
                setDetailTarget(null);
              }}
            >
              수정
            </Button>
          )
        }
      >
        {detailTarget && (
          <Descriptions
            column={1}
            size="small"
            bordered
            labelStyle={{ width: '40%', backgroundColor: '#fafafa' }}
            items={[
              {
                key: 'balanceType',
                label: '잔고 유형',
                children: detailTarget.balanceType
                  ? BALANCE_KO[detailTarget.balanceType] ?? detailTarget.balanceType
                  : '차감 없음',
              },
              {
                key: 'isPaidYn',
                label: '유급 여부',
                children:
                  detailTarget.isPaidYn === 'Y' ? (
                    <Tag color="green">유급</Tag>
                  ) : (
                    <Tag>무급</Tag>
                  ),
              },
              {
                key: 'requireEvidenceYn',
                label: '증빙 첨부',
                children:
                  detailTarget.requireEvidenceYn === 'Y' ? (
                    <Tag color="orange">필수</Tag>
                  ) : (
                    <Tag>선택</Tag>
                  ),
              },
              {
                key: 'maxDaysPerYear',
                label: '연간 한도',
                children:
                  detailTarget.maxDaysPerYear == null
                    ? '제한 없음'
                    : `${detailTarget.maxDaysPerYear}일`,
              },
              {
                key: 'usageDeadlineDays',
                label: '사용 기한',
                children:
                  detailTarget.usageDeadlineDays == null ? (
                    <Typography.Text type="secondary">기한 없음</Typography.Text>
                  ) : (
                    <Tag color="purple">사유 발생일 +{detailTarget.usageDeadlineDays}일</Tag>
                  ),
              },
              {
                key: 'displayOrder',
                label: '정렬 순서',
                children: detailTarget.displayOrder ?? '—',
              },
              {
                key: 'isSystemDefault',
                label: '시스템 기본',
                children: detailTarget.isSystemDefault ? '예 (삭제 불가)' : '아니오',
              },
            ]}
          />
        )}
      </Drawer>

      {/* [수동 휴가 부여] — 시연용/누락 보정용 즉시 INSERT 모달 */}
      <AppDoubleActionModal
        open={grantOpen}
        title="수동 휴가 부여"
        onClose={() => setGrantOpen(false)}
        onConfirm={onSubmitGrant}
        confirmLoading={grantMut.isPending}
        confirmText="부여"
        cancelText="취소"
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="!tw-text-xs !tw-mb-3">
          매월 1일 휴가 자동 부여 배치를 기다리지 않고, 특정 직원에게 즉시 휴가 잔고를 부여합니다.
          시연·누락 보정용. 일반적인 정기 부여는 자동 배치(`leaveGrantJob`)에 맡기세요.
        </Typography.Paragraph>
        <Form form={grantForm} layout="vertical">
          <Form.Item
            label="대상 직원"
            name="memberId"
            rules={[{ required: true, message: '직원을 선택해주세요.' }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="이름·이메일로 검색"
              filterOption={false}
              onSearch={setMemberKeyword}
              loading={memberSearchQ.isFetching}
              notFoundContent={debouncedKeyword ? '결과 없음' : '키워드를 입력하세요'}
              options={(memberSearchQ.data ?? []).map((m) => ({
                value: m.memberId,
                label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="잔고 유형"
            name="balanceType"
            rules={[{ required: true, message: '잔고 유형을 선택해주세요.' }]}
            extra="ANNUAL=당해 연차 / CARRYOVER=이월 / MONTHLY=월차 (1년 미만)"
          >
            <Select
              options={[
                { value: 'ANNUAL', label: 'ANNUAL — 당해 연차' },
                { value: 'CARRYOVER', label: 'CARRYOVER — 이월 연차' },
                { value: 'MONTHLY', label: 'MONTHLY — 월차' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="부여 일수"
            name="totalGranted"
            rules={[
              { required: true, message: '일수를 입력해주세요.' },
              { type: 'number', min: 0.5, message: '0.5일 이상이어야 합니다.' },
            ]}
            extra="반차는 0.5 단위로 입력 가능"
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} placeholder="예: 15" />
          </Form.Item>
          <Form.Item
            label="만료일"
            name="expirationDate"
            extra="이 날짜 이후 매일 03:00 만료 배치(leaveExpireJob)에서 isExpireYn=Y 처리됩니다. 비워두면 만료 없음."
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>

      {/* [기본 휴가 불러오기] — 패턴 D 선택 마법사 */}
      <AppDoubleActionModal
        open={initOpen}
        onClose={() => setInitOpen(false)}
        onConfirm={() => {
          // 이미 등록된 코드는 backend 가 자동 SKIP 하지만 명시적으로 빼서 보내면 호환성 ↑
          const codes = Array.from(selectedCodes).filter((c) => !existingCodes.has(c));
          if (codes.length === 0) {
            message.info('이미 모두 등록되어 있어 추가할 항목이 없습니다.');
            setInitOpen(false);
            return;
          }
          initDefaultsM.mutate(codes);
        }}
        confirmLoading={initDefaultsM.isPending}
        confirmText="추가하기"
        cancelText="취소"
        title="기본 휴가 불러오기"
        width={580}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="!tw-text-xs !tw-mb-3">
          회사에서 사용할 휴가 종류를 선택하세요. 이미 등록된 항목은 회색으로 표시되며 다시 추가되지 않습니다.
        </Typography.Paragraph>

        {DEFAULT_CATALOG.map((section, idx) => {
          // 섹션 전체 체크 상태 계산
          const allCodes = section.items.map((it) => it.code);
          const checkedCount = allCodes.filter((c) => selectedCodes.has(c)).length;
          const allChecked = checkedCount === allCodes.length;
          const indeterminate = checkedCount > 0 && !allChecked;

          return (
            <div key={section.key}>
              {idx > 0 && <Divider className="!tw-my-3" />}
              <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
                <Space size={6}>
                  <Checkbox
                    checked={allChecked}
                    indeterminate={indeterminate}
                    onChange={(e) => toggleSection(section, e.target.checked)}
                  >
                    <Typography.Text strong>{section.title}</Typography.Text>
                  </Checkbox>
                </Space>
                <Typography.Text type="secondary" className="tw-text-xs">
                  {checkedCount} / {allCodes.length}
                </Typography.Text>
              </div>
              {section.description && (
                <Typography.Paragraph type="secondary" className="!tw-text-xs !tw-mb-2 !tw-ml-6">
                  {section.description}
                </Typography.Paragraph>
              )}
              <div className="tw-grid tw-grid-cols-2 tw-gap-y-1 tw-ml-6">
                {section.items.map((it) => {
                  const already = existingCodes.has(it.code);
                  const checked = selectedCodes.has(it.code);
                  return (
                    <Checkbox
                      key={it.code}
                      checked={checked}
                      disabled={it.required || already}
                      onChange={() => toggleCode(it.code)}
                    >
                      <Space size={4}>
                        <span className={already ? 'tw-text-slate-400' : ''}>{it.name}</span>
                        {it.required && <Tag color="red">필수</Tag>}
                        {already && <Tag>이미 있음</Tag>}
                      </Space>
                    </Checkbox>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Divider className="!tw-my-3" />
        <Typography.Text type="secondary" className="tw-text-xs">
          선택 안 한 휴가 종류는 등록되지 않습니다. 나중에 [기본 휴가 불러오기] 다시 눌러서 추가할 수 있습니다.
        </Typography.Text>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onConfirm={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        confirmText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '휴가 종류 수정' : '휴가 종류 추가'}
        destroyOnHidden
        width={560}
      >
        <div className="tw-px-5 tw-py-4">
        <Form<FormValues> form={form} layout="vertical" onFinish={onSubmit}>
          {/* 시스템 기본 휴가 안내 */}
          {editing?.isSystemDefault && (
            <div className="tw-rounded tw-bg-blue-50 tw-border tw-border-blue-100 tw-px-3 tw-py-2 tw-mb-4">
              <Typography.Text className="tw-text-xs tw-text-blue-700">
                ⓘ 시스템 기본 휴가입니다. 일부 필드만 수정할 수 있고 삭제는 불가합니다.
              </Typography.Text>
            </div>
          )}

          {/* ── 1. 기본 정보 ───────────────────────── */}
          <Typography.Text strong className="tw-text-slate-700 tw-text-sm">
            기본 정보
          </Typography.Text>
          <div className="tw-mt-2 tw-mb-4">
            <Form.Item
              label="휴가 이름"
              name="name"
              rules={[{ required: true, message: '이름을 입력하세요.' }, { max: 100 }]}
              className="!tw-mb-3"
            >
              <Input placeholder="예: 리프레시 휴가" />
            </Form.Item>

            <Form.Item label="유급 여부" name="isPaidYn" rules={[{ required: true }]} className="!tw-mb-0">
              <Select
                options={[
                  { value: 'Y', label: '유급 (급여 지급)' },
                  { value: 'N', label: '무급 (급여 차감)' },
                ]}
              />
            </Form.Item>
          </div>

          {/* ── 2. 사용 한도·기한 ─────────────────── */}
          <Typography.Text strong className="tw-text-slate-700 tw-text-sm">
            사용 한도·기한 <Typography.Text type="secondary" className="tw-text-xs">(선택)</Typography.Text>
          </Typography.Text>
          <div className="tw-mt-2 tw-mb-4 tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item
              label="연간 최대 일수"
              name="maxDaysPerYear"
              extra="비우면 한도 없음"
              className="!tw-mb-0"
            >
              <InputNumber className="tw-w-full" min={0.5} step={0.5} placeholder="예: 5" />
            </Form.Item>

            <Form.Item
              label="사유 발생일로부터"
              name="usageDeadlineDays"
              extra="결혼·사망 등 N일 이내. 비우면 기한 없음"
              className="!tw-mb-0"
            >
              <InputNumber
                className="tw-w-full"
                min={1}
                step={1}
                placeholder="예: 30"
                addonAfter="일"
              />
            </Form.Item>
          </div>

          {/* ── 3. 신청 시 부가 ─────────────────── */}
          <Typography.Text strong className="tw-text-slate-700 tw-text-sm">
            신청 시 부가
          </Typography.Text>
          <div className="tw-mt-2 tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item
              label="증빙 첨부"
              name="requireEvidenceYn"
              rules={[{ required: true }]}
              className="!tw-mb-0"
            >
              <Select
                options={[
                  { value: 'N', label: '선택 (첨부 안 해도 됨)' },
                  { value: 'Y', label: '필수 (진단서·증명서 등)' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label="정렬 순서"
              name="displayOrder"
              rules={[{ required: true, message: '순서를 입력하세요.' }]}
              extra="목록에서 위/아래 위치"
              className="!tw-mb-0"
            >
              <InputNumber className="tw-w-full" min={0} step={1} />
            </Form.Item>
          </div>
        </Form>
        </div>
      </AppDoubleActionModal>
            </Space>
          ),
        },
        {
          key: 'grant',
          label: '수동 휴가 부여',
          children: <AdminLeaveGrantPage />,
        },
      ]}
    />
  );
}
