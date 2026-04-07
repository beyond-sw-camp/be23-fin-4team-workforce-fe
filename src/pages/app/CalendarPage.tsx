import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Calendar,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import type { CellRenderInfo } from 'antd/es/calendar/generateCalendar';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import { useMemo, useState } from 'react';
import {
  type CalendarEvent,
  calendarApi,
  type CreatePersonalCalendarPayload,
  type CreateTeamCalendarPayload,
} from '@/features/calendar/api/calendarApi';
import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';

dayjs.locale('ko');

function flattenOrgList(nodes: OrganizationTreeNode[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (n: OrganizationTreeNode) => {
    const id =
      (typeof n.id === 'string' && n.id) ||
      (typeof n.organizationId === 'string' && n.organizationId) ||
      (typeof n.organization_id === 'string' && n.organization_id) ||
      '';
    const name = typeof n.name === 'string' ? n.name : '';
    if (id) out.push({ id, name: name || id });
    const ch = n.children as OrganizationTreeNode[] | undefined;
    if (Array.isArray(ch)) ch.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function isTeamEvent(e: CalendarEvent): boolean {
  return e.scope === 'team' || Boolean(e.organizationId?.trim());
}

function eventsOnDay(events: CalendarEvent[], day: Dayjs): CalendarEvent[] {
  return events.filter((e) => {
    const start = dayjs(e.startAt);
    return start.isSame(day, 'day');
  });
}

type FormValues = {
  kind: 'personal' | 'team';
  title: string;
  description: string;
  range: [Dayjs, Dayjs];
  isPublicYn: 'YES' | 'NO';
  organizationId?: string;
};

function toPayload(values: FormValues): CreatePersonalCalendarPayload | CreateTeamCalendarPayload {
  const [a, b] = values.range;
  const startAt = a.format('YYYY-MM-DDTHH:mm:ss');
  const endAt = b.format('YYYY-MM-DDTHH:mm:ss');
  if (values.kind === 'team') {
    return {
      title: values.title.trim(),
      description: values.description.trim(),
      startAt,
      endAt,
      organizationId: values.organizationId ?? '',
    };
  }
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    startAt,
    endAt,
    isPublicYn: values.isPublicYn,
  };
}

export function CalendarPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [monthValue, setMonthValue] = useState(() => dayjs());
  const [selectedDay, setSelectedDay] = useState<Dayjs>(() => dayjs());

  const year = monthValue.year();
  const month = monthValue.month() + 1;

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar', 'month', year, month],
    queryFn: () => calendarApi.listMonth(year, month),
  });

  const { data: orgTree = [] } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
  });
  const orgOptions = useMemo(() => flattenOrgList(orgTree), [orgTree]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form] = Form.useForm<FormValues>();

  const invalidateMonth = () => {
    void qc.invalidateQueries({ queryKey: ['calendar', 'month', year, month] });
  };

  const createM = useMutation({
    mutationFn: async (payload: CreatePersonalCalendarPayload | CreateTeamCalendarPayload) => {
      if ('organizationId' in payload && payload.organizationId) {
        await calendarApi.createTeam(payload as CreateTeamCalendarPayload);
      } else {
        await calendarApi.createPersonal(payload as CreatePersonalCalendarPayload);
      }
    },
    onSuccess: () => {
      message.success('일정이 등록되었습니다.');
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      invalidateMonth();
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: async ({
      event,
      payload,
    }: {
      event: CalendarEvent;
      payload: CreatePersonalCalendarPayload | CreateTeamCalendarPayload;
    }) => {
      if (isTeamEvent(event)) {
        await calendarApi.updateTeam(event.eventId, payload as CreateTeamCalendarPayload);
      } else {
        await calendarApi.updatePersonal(event.eventId, payload as CreatePersonalCalendarPayload);
      }
    },
    onSuccess: () => {
      message.success('일정이 수정되었습니다.');
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      invalidateMonth();
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: async (event: CalendarEvent) => {
      if (isTeamEvent(event)) {
        await calendarApi.deleteTeam(event.eventId);
      } else {
        await calendarApi.deletePersonal(event.eventId);
      }
    },
    onSuccess: () => {
      message.success('일정이 삭제되었습니다.');
      setDetailOpen(false);
      setDetailEvent(null);
      invalidateMonth();
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const { data: detailData, isFetching: detailLoading } = useQuery({
    queryKey: ['calendar', 'detail', detailEvent?.eventId],
    queryFn: () => calendarApi.detail(detailEvent!.eventId),
    enabled: detailOpen && Boolean(detailEvent?.eventId),
  });

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      kind: 'personal',
      title: '',
      description: '',
      range: [selectedDay.hour(9).minute(0), selectedDay.hour(10).minute(0)],
      isPublicYn: 'YES',
      organizationId: orgOptions[0]?.id,
    });
    setFormOpen(true);
  };

  const openEdit = (e: CalendarEvent) => {
    setEditing(e);
    const start = dayjs(e.startAt);
    const end = dayjs(e.endAt);
    form.setFieldsValue({
      kind: isTeamEvent(e) ? 'team' : 'personal',
      title: e.title,
      description: e.description ?? '',
      range: [start, end],
      isPublicYn: e.isPublicYn ?? 'YES',
      organizationId: e.organizationId ?? orgOptions[0]?.id,
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    const values = await form.validateFields();
    const payload = toPayload(values);
    if (values.kind === 'team' && !values.organizationId) {
      message.warning('조직을 선택해 주세요.');
      return;
    }
    if (editing) {
      updateM.mutate({ event: editing, payload });
    } else {
      createM.mutate(payload);
    }
  };

  const dayList = useMemo(() => eventsOnDay(events, selectedDay), [events, selectedDay]);

  const cellRender = (current: Dayjs, info: CellRenderInfo<Dayjs>) => {
    if (info.type !== 'date') return info.originNode;
    const list = eventsOnDay(events, current);
    return (
      <div className="tw-flex tw-min-h-[52px] tw-flex-col tw-gap-0.5">
        <ul className="tw-m-0 tw-list-none tw-space-y-0.5 tw-p-0">
          {list.slice(0, 2).map((e) => (
            <li key={e.eventId}>
              <button
                type="button"
                className="tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-bg-blue-50 tw-px-1 tw-text-left tw-text-[10px] tw-text-blue-900 tw-leading-tight hover:tw-bg-blue-100"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  setDetailEvent(e);
                  setDetailOpen(true);
                }}
              >
                {e.title}
              </button>
            </li>
          ))}
        </ul>
        {list.length > 2 && (
          <span className="tw-text-[10px] tw-text-slate-400">+{list.length - 2}</span>
        )}
      </div>
    );
  };

  return (
    <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            일정
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            개인 일정과 팀 일정을 캘린더에서 확인합니다.
          </Typography.Paragraph>
        </div>
        <AppButton type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          일정 추가
        </AppButton>
      </div>

      <div className="tw-grid tw-min-h-0 tw-flex-1 tw-gap-4 lg:tw-grid-cols-[1fr_320px]">
        <Card className="tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <Spin spinning={isLoading}>
            <Calendar
              fullscreen={false}
              value={monthValue}
              onChange={(d) => {
                setMonthValue(d);
                setSelectedDay(d);
              }}
              onSelect={(d) => setSelectedDay(d)}
              onPanelChange={(d) => setMonthValue(d)}
              cellRender={cellRender}
            />
          </Spin>
        </Card>

        <Card
          title={
            <span className="tw-text-base tw-font-semibold">
              {selectedDay.format('M월 D일 (ddd)')} 일정
            </span>
          }
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          {dayList.length === 0 ? (
            <Typography.Text type="secondary">이 날짜에 등록된 일정이 없습니다.</Typography.Text>
          ) : (
            <ul className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
              {dayList.map((e) => (
                <li key={e.eventId}>
                  <button
                    type="button"
                    className="tw-w-full tw-rounded-lg tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2 tw-text-left tw-transition-colors hover:tw-bg-slate-50"
                    onClick={() => {
                      setDetailEvent(e);
                      setDetailOpen(true);
                    }}
                  >
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                      <span className="tw-font-medium tw-text-slate-900">{e.title}</span>
                      {isTeamEvent(e) ? <Tag color="blue">팀</Tag> : <Tag>개인</Tag>}
                    </div>
                    <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                      {dayjs(e.startAt).format('HH:mm')} – {dayjs(e.endAt).format('HH:mm')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        title={editing ? '일정 수정' : '일정 추가'}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>
            취소
          </Button>,
          <Button
            key="ok"
            type="primary"
            loading={createM.isPending || updateM.isPending}
            onClick={() => void submitForm()}
          >
            {editing ? '저장' : '등록'}
          </Button>,
        ]}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="tw-pt-2">
          <Form.Item name="kind" label="유형" rules={[{ required: true }]}>
            <Radio.Group disabled={Boolean(editing)}>
              <Radio value="personal">개인 일정</Radio>
              <Radio value="team">팀 일정</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.kind !== cur.kind}
          >
            {({ getFieldValue }) =>
              getFieldValue('kind') === 'team' ? (
                <Form.Item
                  name="organizationId"
                  label="조직"
                  rules={[{ required: true, message: '조직을 선택해 주세요.' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="조직 선택"
                    options={orgOptions.map((o) => ({ value: o.id, label: o.name }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력해 주세요.' }]}>
            <Input placeholder="제목" maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="내용">
            <Input.TextArea rows={3} placeholder="설명" maxLength={2000} />
          </Form.Item>
          <Form.Item name="range" label="시작·종료" rules={[{ required: true, message: '일시를 선택해 주세요.' }]}>
            <DatePicker.RangePicker showTime className="tw-w-full" format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.kind !== cur.kind}
          >
            {({ getFieldValue }) =>
              getFieldValue('kind') === 'personal' ? (
                <Form.Item name="isPublicYn" label="공개 여부" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Radio value="YES">공개</Radio>
                    <Radio value="NO">비공개</Radio>
                  </Radio.Group>
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="일정 상세"
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetailEvent(null);
        }}
        footer={[
          <Popconfirm
            key="del"
            title="이 일정을 삭제할까요?"
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true, loading: deleteM.isPending }}
            onConfirm={() => {
              const ev = detailData ?? detailEvent;
              if (ev) deleteM.mutate(ev);
            }}
          >
            <Button danger loading={deleteM.isPending} disabled={!detailData && !detailEvent}>
              삭제
            </Button>
          </Popconfirm>,
          <Button
            key="edit"
            type="primary"
            disabled={!detailData}
            onClick={() => {
              if (!detailData) return;
              setDetailOpen(false);
              setDetailEvent(null);
              openEdit(detailData);
            }}
          >
            수정
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setDetailOpen(false);
              setDetailEvent(null);
            }}
          >
            닫기
          </Button>,
        ]}
        width={480}
      >
        <Spin spinning={detailLoading}>
          {detailData ? (
            <Space direction="vertical" className="tw-w-full" size="middle">
              <div className="tw-flex tw-items-center tw-gap-2">
                <Typography.Text strong className="tw-text-lg">
                  {detailData.title}
                </Typography.Text>
                {isTeamEvent(detailData) ? <Tag color="blue">팀</Tag> : <Tag>개인</Tag>}
              </div>
              <Typography.Paragraph className="!tw-m-0 tw-whitespace-pre-wrap tw-text-slate-700">
                {detailData.description?.trim() || '—'}
              </Typography.Paragraph>
              <div className="tw-text-sm tw-text-slate-600">
                <div>
                  시작: {dayjs(detailData.startAt).format('YYYY-MM-DD HH:mm')}
                </div>
                <div>
                  종료: {dayjs(detailData.endAt).format('YYYY-MM-DD HH:mm')}
                </div>
                {!isTeamEvent(detailData) && (
                  <div>공개: {detailData.isPublicYn === 'NO' ? '비공개' : '공개'}</div>
                )}
                {isTeamEvent(detailData) && detailData.organizationId && (
                  <div>조직 ID: {detailData.organizationId}</div>
                )}
              </div>
            </Space>
          ) : (
            !detailLoading && <Typography.Text type="secondary">불러오지 못했습니다.</Typography.Text>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
