import { useMemo, useState } from 'react';
import {
  Tabs,
  Table,
  Button,
  Tag,
  Space,
  Drawer,
  Form,
  Input,
  DatePicker,
  Select,
  message,
  Typography,
  Tooltip,
  Empty,
  Card,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  LinkOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import type {
  MeetingRecord,
  CreateMeetingPayload,
  RepeatCycle,
} from '@/features/meetings/model/types';
import { AppPageHeader } from '@/shared/ui/AppPageHeader';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const MEETING_KO = {
  pageTitle: '1:1 면담',
  pageSubtitle: '정기·수시 면담을 관리하고 후속 액션을 추적합니다.',
  tabAsMember: '나의 면담',
  tabAsManager: '매니저 면담',
  newMeeting: '면담 예약',
  colPartner: '면담 상대',
  colSchedule: '일정',
  colRepeat: '반복',
  colStatus: '상태',
  colAction: '',
  statusScheduled: '예정',
  statusCompleted: '완료',
  repeatOneTime: '1회',
  repeatWeekly: '매주',
  repeatBiWeekly: '격주',
  repeatMonthly: '매월',
  repeatQuarterly: '분기',
  drawerTitle: '새 면담 예약',
  fieldMember: '면담 대상',
  fieldMemberPlaceholder: '이름·이메일로 검색',
  fieldSchedule: '일시',
  fieldRepeat: '반복 주기',
  fieldAgenda: '안건',
  create: '예약하기',
  cancel: '취소',
  created: '면담이 예약되었습니다.',
  detail: '상세',
  feedbackBadge: '평가 피드백',
  statTotal: '전체',
  statUpcoming: '예정',
  statDone: '완료',
};

const repeatLabel: Record<RepeatCycle, string> = {
  ONE_TIME: MEETING_KO.repeatOneTime,
  WEEKLY: MEETING_KO.repeatWeekly,
  BI_WEEKLY: MEETING_KO.repeatBiWeekly,
  MONTHLY: MEETING_KO.repeatMonthly,
  QUARTERLY: MEETING_KO.repeatQuarterly,
};

const repeatOptions = Object.entries(repeatLabel).map(([value, label]) => ({ value, label }));

function statusTag(m: MeetingRecord) {
  if (m.completedAt)
    return (
      <Tag icon={<CheckCircleOutlined />} color="success">
        {MEETING_KO.statusCompleted}
      </Tag>
    );
  const scheduled = dayjs(m.scheduledAt);
  const isPast = scheduled.isBefore(dayjs());
  return (
    <Tag icon={<ClockCircleOutlined />} color={isPast ? 'warning' : 'processing'}>
      {isPast ? '지연' : MEETING_KO.statusScheduled}
    </Tag>
  );
}

function scheduleDisplay(scheduledAt: string) {
  const d = dayjs(scheduledAt);
  const isToday = d.isSame(dayjs(), 'day');
  const isTomorrow = d.isSame(dayjs().add(1, 'day'), 'day');
  const prefix = isToday ? '오늘 ' : isTomorrow ? '내일 ' : '';
  return (
    <Tooltip title={d.format('YYYY-MM-DD HH:mm')}>
      <span>
        {prefix}
        {d.format(isToday || isTomorrow ? 'HH:mm' : 'MM/DD (ddd) HH:mm')}
      </span>
    </Tooltip>
  );
}

export default function MeetingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'member' | 'manager'>('member');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();

  // ── Queries ──
  const memberQ = useQuery({
    queryKey: ['meetings', 'as-member'],
    queryFn: () => meetingApi.listMyMeetingsAsMember(),
  });
  const managerQ = useQuery({
    queryKey: ['meetings', 'as-manager'],
    queryFn: () => meetingApi.listMyMeetingsAsManager(),
  });

  const createMut = useMutation({
    mutationFn: (body: CreateMeetingPayload) => meetingApi.createMeeting(body),
    onSuccess: () => {
      message.success(MEETING_KO.created);
      setDrawerOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => message.error('면담 예약에 실패했습니다.'),
  });

  const meetings = tab === 'member' ? memberQ.data ?? [] : managerQ.data ?? [];
  const loading = tab === 'member' ? memberQ.isLoading : managerQ.isLoading;

  const upcoming = meetings.filter((m) => !m.completedAt);
  const done = meetings.filter((m) => m.completedAt);

  // ── 멤버 UUID → 이름 변환 ──
  const partnerIds = useMemo(() => {
    const allMeetings = [...(memberQ.data ?? []), ...(managerQ.data ?? [])];
    const ids = new Set<string>();
    for (const m of allMeetings) {
      if (m.memberId) ids.add(m.memberId);
      if (m.managerId) ids.add(m.managerId);
    }
    return [...ids];
  }, [memberQ.data, managerQ.data]);

  const { labelFor } = useMemberDisplayNames(partnerIds);

  // ── Columns ──
  const partnerField = tab === 'member' ? 'managerId' : 'memberId';
  const partnerLabel = tab === 'member' ? '매니저' : '구성원';

  const columns = [
    {
      title: partnerLabel,
      dataIndex: partnerField,
      key: 'partner',
      render: (id: string, rec: MeetingRecord) => (
        <Space>
          <UserOutlined />
          <Typography.Text className="tw-font-medium">
            {labelFor(id)}
          </Typography.Text>
          {rec.relatedSeasonId && (
            <Tag color="blue" className="tw-ml-1">
              <LinkOutlined className="tw-mr-1" />
              {MEETING_KO.feedbackBadge}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: MEETING_KO.colSchedule,
      dataIndex: 'scheduledAt',
      key: 'schedule',
      sorter: (a: MeetingRecord, b: MeetingRecord) =>
        dayjs(a.scheduledAt).unix() - dayjs(b.scheduledAt).unix(),
      defaultSortOrder: 'ascend' as const,
      render: (v: string) => scheduleDisplay(v),
    },
    {
      title: MEETING_KO.colRepeat,
      dataIndex: 'repeatCycle',
      key: 'repeat',
      width: 90,
      render: (v: RepeatCycle) => <Tag>{repeatLabel[v] ?? v}</Tag>,
    },
    {
      title: MEETING_KO.colStatus,
      key: 'status',
      width: 110,
      render: (_: unknown, rec: MeetingRecord) => statusTag(rec),
    },
    {
      title: MEETING_KO.colAction,
      key: 'action',
      width: 80,
      render: (_: unknown, rec: MeetingRecord) => (
        <Link to="/app/meetings/$meetingId" params={{ meetingId: rec.meetingRecordId }}>
          <Button type="link" size="small">
            {MEETING_KO.detail}
          </Button>
        </Link>
      ),
    },
  ];

  // ── Render ──
  return (
    <div className="tw-p-6 tw-max-w-[1200px] tw-mx-auto">
      <AppPageHeader
        title={MEETING_KO.pageTitle}
        subtitle={MEETING_KO.pageSubtitle}
        extra={
          tab === 'manager' ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
              {MEETING_KO.newMeeting}
            </Button>
          ) : undefined
        }
      />

      {/* ── 통계 요약 ── */}
      <Row gutter={16} className="tw-mb-5">
        <Col span={8}>
          <Card size="small" className="tw-text-center">
            <Statistic
              title={MEETING_KO.statTotal}
              value={meetings.length}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" className="tw-text-center">
            <Statistic
              title={MEETING_KO.statUpcoming}
              value={upcoming.length}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" className="tw-text-center">
            <Statistic
              title={MEETING_KO.statDone}
              value={done.length}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 탭 ── */}
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'member' | 'manager')}
        items={[
          { key: 'member', label: MEETING_KO.tabAsMember },
          { key: 'manager', label: MEETING_KO.tabAsManager },
        ]}
      />

      <Table
        rowKey="meetingRecordId"
        columns={columns}
        dataSource={meetings}
        loading={loading}
        pagination={{ pageSize: 15, showSizeChanger: false }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                tab === 'manager'
                  ? '예약된 면담이 없습니다. 새 면담을 예약해 보세요.'
                  : '배정된 면담이 없습니다.'
              }
            />
          ),
        }}
      />

      {/* ── 생성 Drawer ── */}
      <Drawer
        title={MEETING_KO.drawerTitle}
        width={420}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>{MEETING_KO.cancel}</Button>
            <Button
              type="primary"
              loading={createMut.isPending}
              onClick={() => form.submit()}
            >
              {MEETING_KO.create}
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(vals) => {
            createMut.mutate({
              memberId: vals.memberId,
              managerId: vals.managerId ?? vals.memberId,
              repeatCycle: vals.repeatCycle,
              scheduledAt: vals.scheduledAt.toISOString(),
              agenda: vals.agenda,
            });
          }}
        >
          <Form.Item
            name="memberId"
            label={MEETING_KO.fieldMember}
            rules={[{ required: true, message: '면담 대상을 선택해 주세요.' }]}
          >
            <MemberRemoteSelect placeholder={MEETING_KO.fieldMemberPlaceholder} />
          </Form.Item>
          <Form.Item
            name="scheduledAt"
            label={MEETING_KO.fieldSchedule}
            rules={[{ required: true, message: '일시를 선택해 주세요.' }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              className="tw-w-full"
              placeholder="날짜·시간 선택"
            />
          </Form.Item>
          <Form.Item
            name="repeatCycle"
            label={MEETING_KO.fieldRepeat}
            initialValue="ONE_TIME"
            rules={[{ required: true }]}
          >
            <Select options={repeatOptions} />
          </Form.Item>
          <Form.Item name="agenda" label={MEETING_KO.fieldAgenda}>
            <Input.TextArea rows={3} placeholder="면담 안건을 간단히 적어 주세요." />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
