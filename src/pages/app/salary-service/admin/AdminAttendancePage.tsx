/** /app/attendance/company — 전사 근태 통합 페이지 (관리자)
 *
 * 기존 일별/월별 두 화면을 한 페이지로 통합:
 *  - 기간 프리셋: 오늘 / 이번 주 / 이번 달 / 사용자 지정
 *  - 단일일자(`day` 모드)에는 GET /attendance/company/daily,
 *    그 외 기간에는 GET /attendance/company/monthly 자동 선택
 *  - KPI 요약 카드(현재 페이지 데이터 기준 집계)
 *  - 구성원 이름/이메일/사번/부서 검색 (memberId 부분 매칭은 fallback)
 *  - antd Table `virtual` 가상 스크롤
 *  - 행 클릭 시 우측 Drawer 로 일자별 상세 표시
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Switch,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type { DailyAttendance } from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

type PeriodMode = 'day' | 'week' | 'month' | 'custom';

const { RangePicker } = DatePicker;

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('MM-DD HH:mm') : String(iso);
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('HH:mm:ss') : String(iso);
}

function formatHm(min?: number | null) {
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function AdminAttendancePage() {
  const navigate = useNavigate();
  const today = useMemo(() => dayjs(), []);
  const [mode, setMode] = useState<PeriodMode>('day');
  const [singleDate, setSingleDate] = useState<Dayjs>(today);
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>([
    today.startOf('week'),
    today.endOf('week'),
  ]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [overtimeOnly, setOvertimeOnly] = useState(false);
  const [drawerRow, setDrawerRow] = useState<DailyAttendance | null>(null);

  /** 기간 모드 → from/to/단일일자 여부 */
  const period = useMemo(() => {
    if (mode === 'day') {
      const iso = singleDate.format('YYYY-MM-DD');
      return { from: iso, to: iso, isSingleDay: true };
    }
    if (mode === 'week') {
      return {
        from: today.startOf('week').format('YYYY-MM-DD'),
        to: today.endOf('week').format('YYYY-MM-DD'),
        isSingleDay: false,
      };
    }
    if (mode === 'month') {
      return {
        from: today.startOf('month').format('YYYY-MM-DD'),
        to: today.endOf('month').format('YYYY-MM-DD'),
        isSingleDay: false,
      };
    }
    const [f, t] = customRange;
    return {
      from: f.format('YYYY-MM-DD'),
      to: t.format('YYYY-MM-DD'),
      isSingleDay: f.isSame(t, 'day'),
    };
  }, [mode, singleDate, customRange, today]);

  const pageSize = period.isSingleDay ? 50 : 100;

  /** 단일일자 vs. 기간에 따라 백엔드 엔드포인트 자동 선택 */
  const listQ = useQuery({
    queryKey: [
      'salary',
      'attendance',
      'company',
      'unified',
      period.from,
      period.to,
      page,
      pageSize,
      period.isSingleDay,
    ],
    queryFn: () =>
      period.isSingleDay
        ? attendanceApi.attendance.getCompanyDaily({
            date: period.from,
            page,
            size: pageSize,
          })
        : attendanceApi.attendance.getCompanyMonthly({
            from: period.from,
            to: period.to,
            page,
            size: pageSize,
          }),
  });

  /** 구성원 이름 매핑용. 5분 캐시. 회사 규모가 커지면 검색 전용 API 도입 검토. */
  const membersQ = useQuery({
    queryKey: ['members', 'list', 'attendance-name-map'],
    queryFn: () => membersApi.list({ page: 1, pageSize: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    membersQ.data?.items.forEach((m) => map.set(m.id, m));
    return map;
  }, [membersQ.data]);

  const normalized = useMemo(() => normalizeSpringPage(listQ.data), [listQ.data]);

  /** 검색은 현재 페이지 내 클라이언트 필터 (이름/이메일/부서/UUID 부분 매칭) */
  const filteredBySearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalized.content;
    return normalized.content.filter((r) => {
      const m = r.memberId ? memberMap.get(r.memberId) : undefined;
      const name = (m?.name ?? '').toLowerCase();
      const email = (m?.email ?? '').toLowerCase();
      const dept = (m?.department ?? '').toLowerCase();
      const sabun = (m?.sabun ?? '').toLowerCase();
      const id = (r.memberId ?? '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        dept.includes(q) ||
        sabun.includes(q) ||
        id.includes(q)
      );
    });
  }, [normalized.content, search, memberMap]);

  const filteredContent = useMemo(() => {
    if (!overtimeOnly) return filteredBySearch;
    return filteredBySearch.filter((r) => (r.overtimeMinutes ?? 0) > 0);
  }, [filteredBySearch, overtimeOnly]);

  /** KPI: 현재 페이지(검색 적용 후) 기준 집계 — 페이지 전체 집계 API 도입 시 교체 */
  const kpi = useMemo(() => {
    const counts: Record<string, number> = { NORMAL: 0, ABSENT: 0, LEAVE: 0, HALF: 0 };
    let workMinTotal = 0;
    let workCount = 0;
    let overtimeMinTotal = 0;
    let overtimeMemberCount = 0;
    let tripCount = 0;
    filteredContent.forEach((r) => {
      const s = r.status ?? '';
      if (s in counts) counts[s] += 1;
      if (typeof r.workedMinutes === 'number' && r.workedMinutes > 0) {
        workMinTotal += r.workedMinutes;
        workCount += 1;
      }
      if (typeof r.overtimeMinutes === 'number' && r.overtimeMinutes > 0) {
        overtimeMinTotal += r.overtimeMinutes;
        overtimeMemberCount += 1;
      }
      // 출장/외근 - WorkTripDetail 있는 일자
      if (r.workTripType === 'BUSINESS_TRIP' || r.workTripType === 'OUTSIDE_WORK') {
        tripCount += 1;
      }
    });
    return {
      normal: counts.NORMAL,
      absent: counts.ABSENT,
      leaveOrHalf: counts.LEAVE + counts.HALF,
      tripCount,
      avgWorkMin: workCount > 0 ? Math.round(workMinTotal / workCount) : 0,
      overtimeMinTotal,
      overtimeMemberCount,
      avgOvertimeMin:
        overtimeMemberCount > 0 ? Math.round(overtimeMinTotal / overtimeMemberCount) : 0,
    };
  }, [filteredContent]);

  const columns: ColumnsType<DailyAttendance> = useMemo(() => {
    const base: ColumnsType<DailyAttendance> = [
      {
        title: '부서',
        key: 'department',
        width: 140,
        ellipsis: true,
        render: (_, row) => {
          const m = row.memberId ? memberMap.get(row.memberId) : undefined;
          const v = m?.department?.trim();
          return v ? (
            <span className="tw-text-slate-900">{v}</span>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          );
        },
      },
      {
        title: '사번',
        key: 'sabun',
        width: 110,
        render: (_, row) => {
          const m = row.memberId ? memberMap.get(row.memberId) : undefined;
          const v = m?.sabun?.trim();
          return v ? (
            <span className="tw-text-slate-900">{v}</span>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          );
        },
      },
      {
        title: '이름',
        key: 'memberName',
        width: 120,
        ellipsis: true,
        render: (_, row) => {
          const id = row.memberId;
          const m = id ? memberMap.get(id) : undefined;
          if (m?.name) {
            return <span className="tw-font-medium tw-text-slate-900">{m.name}</span>;
          }
          return (
            <Typography.Text type="secondary" className="!tw-text-xs" title={id ?? undefined}>
              구성원 목록에 없음
            </Typography.Text>
          );
        },
      },
      {
        title: '일자',
        dataIndex: 'attendanceDate',
        key: 'attendanceDate',
        width: 120,
        sorter: (a, b) => (a.attendanceDate ?? '').localeCompare(b.attendanceDate ?? ''),
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        filters: [
          { text: '정상', value: 'NORMAL' },
          { text: '휴가', value: 'LEAVE' },
          { text: '반차', value: 'HALF' },
          { text: '결근', value: 'ABSENT' },
        ],
        onFilter: (value, record) => record.status === value,
        render: (_, row) => (
          <AttendanceStatusTag status={row.status} workTripType={row.workTripType ?? null} />
        ),
      },
    ];

    /** 단일일자에서만 첫 출근/마지막 퇴근 컬럼 노출. 기간 조회 시엔 행 클릭 → Drawer 에서 확인. */
    if (period.isSingleDay) {
      base.push(
        {
          title: '첫 출근',
          dataIndex: 'firstClockIn',
          key: 'firstClockIn',
          width: 130,
          render: (t: string) => formatDt(t),
        },
        {
          title: '마지막 퇴근',
          dataIndex: 'lastClockOut',
          key: 'lastClockOut',
          width: 130,
          render: (t: string) => formatDt(t),
        },
      );
    }

    base.push({
      title: '연장',
      dataIndex: 'overtimeMinutes',
      key: 'overtimeMinutes',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.overtimeMinutes ?? 0) - (b.overtimeMinutes ?? 0),
      render: (m: number | null | undefined) => {
        const val = m ?? 0;
        if (val <= 0) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Tag color="volcano" className="!tw-mr-0">
            {formatHm(val)}
          </Tag>
        );
      },
    });

    base.push({
      title: '근무',
      dataIndex: 'workedMinutes',
      key: 'workedMinutes',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.workedMinutes ?? 0) - (b.workedMinutes ?? 0),
      render: (m: number | null | undefined) => formatHm(m),
    });

    return base;
  }, [memberMap, period.isSingleDay]);

  const drawerMember = drawerRow?.memberId ? memberMap.get(drawerRow.memberId) : undefined;

  return (
    <div className="tw-space-y-4">
      <AppWorkspacePageTitle
        eyebrow="Attendance"
        title="전사 근태 현황"
        subtitle="기간을 선택해 일별·월별 근태를 한 화면에서 조회합니다."
        extra={(
          <Button onClick={() => navigate({ to: '/app/attendance/overtime-status' })}>
            초과 근무 현황
          </Button>
        )}
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm" size="small">
        <Space size="middle" wrap>
          <Segmented<PeriodMode>
            value={mode}
            onChange={(v) => {
              setMode(v);
              setPage(0);
            }}
            options={[
              { label: '오늘', value: 'day' },
              { label: '이번 주', value: 'week' },
              { label: '이번 달', value: 'month' },
              { label: '기간 선택', value: 'custom' },
            ]}
          />
          {mode === 'day' ? (
            <DatePicker
              value={singleDate}
              onChange={(d) => {
                if (!d) return;
                setSingleDate(d);
                setPage(0);
              }}
              allowClear={false}
            />
          ) : null}
          {mode === 'custom' ? (
            <RangePicker
              value={customRange}
              onChange={(v) => {
                if (!v || !v[0] || !v[1]) return;
                setCustomRange([v[0], v[1]]);
                setPage(0);
              }}
              allowClear={false}
            />
          ) : null}
          <Input.Search
            placeholder="이름·이메일·사번·부서로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <Space size={6}>
            <Typography.Text className="!tw-text-xs">초과근무만</Typography.Text>
            <Switch checked={overtimeOnly} onChange={setOvertimeOnly} size="small" />
          </Space>
          <Typography.Text type="secondary" className="!tw-text-xs">
            {period.from === period.to
              ? period.from
              : `${period.from} ~ ${period.to}`}{' '}
            · {normalized.totalElements.toLocaleString()}건
          </Typography.Text>
        </Space>
      </Card>

      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-3 xl:tw-grid-cols-6 tw-gap-3">
        <KpiTile label="정상 출근" value={kpi.normal.toLocaleString()} tone="success" />
        <KpiTile label="결근" value={kpi.absent.toLocaleString()} tone="danger" />
        <KpiTile label="휴가/반차" value={kpi.leaveOrHalf.toLocaleString()} tone="warning" />
        <KpiTile label="출장/외근" value={kpi.tripCount.toLocaleString()} tone="neutral" />
        <KpiTile label="평균 근무" value={formatHm(kpi.avgWorkMin)} tone="neutral" />
        <KpiTile label="초과근무 인원" value={`${kpi.overtimeMemberCount.toLocaleString()}명`} tone="hot" />
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" size="small">
        {listQ.isError ? (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="전사 근태 조회에 실패했습니다."
            description="네트워크 또는 권한 상태를 확인해 주세요."
          />
        ) : null}
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.memberId}-${r.attendanceDate}`}
          loading={listQ.isLoading || membersQ.isLoading}
          columns={columns}
          dataSource={filteredContent}
          size="small"
          virtual
          scroll={{ y: 520, x: 'max-content' }}
          onRow={(record) => ({
            onClick: () => setDrawerRow(record),
            style: { cursor: 'pointer' },
          })}
          pagination={
            search.trim()
              ? false
              : {
                  current: page + 1,
                  pageSize,
                  total: normalized.totalElements,
                  showSizeChanger: false,
                  onChange: (p) => setPage(p - 1),
                }
          }
          locale={{
            emptyText: search.trim() ? (
              <Empty description={`'${search}' 로 검색된 근태가 없습니다.`} />
            ) : (
              <Empty description="해당 기간 근태 데이터가 없습니다." />
            ),
          }}
        />
      </Card>

      <Drawer
        open={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        title="근태 상세"
        width={420}
        destroyOnHidden
      >
        {drawerRow ? (
          <>
            <div className="tw-mb-4 tw-space-y-1">
              <div className="tw-text-base tw-font-medium tw-text-slate-900">
                {drawerMember?.name ?? '—'}
              </div>
              {drawerMember ? (
                <div className="tw-text-sm tw-text-slate-500 tw-space-y-0.5">
                  <div>부서: {drawerMember.department?.trim() || '—'}</div>
                  <div>사번: {drawerMember.sabun?.trim() || '—'}</div>
                  <div>이메일: {drawerMember.email || '—'}</div>
                </div>
              ) : (
                <div className="tw-text-xs tw-text-slate-400">
                  구성원 정보를 불러오지 못했습니다. (memberId: {shortId(drawerRow.memberId)})
                </div>
              )}
            </div>
            <Descriptions
              column={1}
              size="small"
              bordered
              labelStyle={{ width: 110, background: '#fafafa' }}
            >
              <Descriptions.Item label="일자">{drawerRow.attendanceDate ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="상태">
                <AttendanceStatusTag status={drawerRow.status} />
              </Descriptions.Item>
              <Descriptions.Item label="첫 출근">
                {formatTime(drawerRow.firstClockIn)}
              </Descriptions.Item>
              <Descriptions.Item label="마지막 퇴근">
                {formatTime(drawerRow.lastClockOut)}
              </Descriptions.Item>
              <Descriptions.Item label="근무">
                {formatHm(drawerRow.workedMinutes)}
              </Descriptions.Item>
              <Descriptions.Item label="연장">
                {formatHm(drawerRow.overtimeMinutes)}
              </Descriptions.Item>
              {drawerRow.workScheduleId ? (
                <Descriptions.Item label="스케줄">
                  <Tag>{shortId(drawerRow.workScheduleId)}</Tag>
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}

type KpiTileProps = {
  label: string;
  value: string;
  tone: 'success' | 'danger' | 'warning' | 'neutral' | 'hot';
};

function KpiTile({ label, value, tone }: KpiTileProps) {
  const toneClass =
    tone === 'success'
      ? 'tw-text-emerald-600'
      : tone === 'danger'
        ? 'tw-text-rose-600'
        : tone === 'warning'
          ? 'tw-text-amber-600'
          : tone === 'hot'
            ? 'tw-text-orange-600'
          : 'tw-text-slate-900';
  return (
    <div className="tw-rounded-lg tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3 tw-shadow-sm">
      <div className="tw-text-xs tw-text-slate-500">{label}</div>
      <div className={`tw-mt-1 tw-text-2xl tw-font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}
