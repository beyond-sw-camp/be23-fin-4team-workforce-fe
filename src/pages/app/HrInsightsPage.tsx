import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Card, Col, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import clsx from 'clsx';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

/** HR insights — sample metrics until APIs are wired */

const KPI_STATS = [
  {
    title: '\uc7ac\uc9c1 \uc778\uc6d0',
    value: '128',
    suffix: '\uba85',
    delta: '+2.4%',
    up: true,
    hint: '\uc804\uc6d4 \ub300\ube44',
    icon: <TeamOutlined className="tw-text-xl tw-text-blue-600" />,
  },
  {
    title: '\uc774\ubc88 \ub2ec \uc785\uc0ac',
    value: '4',
    suffix: '\uba85',
    delta: '\uc11c\ub958 3\uac74 \uc9c4\ud589',
    up: true,
    hint: '\uc785\uc0ac \uc608\uc815 2\uba85',
    icon: <UserAddOutlined className="tw-text-xl tw-text-emerald-600" />,
  },
  {
    title: '\ud3c9\uade0 \uacb0\uc7ac \ucc98\ub9ac',
    value: '18.6',
    suffix: '\uc2dc\uac04',
    delta: 'SLA \uac1c\uc120',
    up: true,
    hint: '\uc804\uc790\uacb0\uc7ac\xb7\ubd80\uc11c \ubb38\uc11c\ud568',
    icon: <FileDoneOutlined className="tw-text-xl tw-text-violet-600" />,
  },
  {
    title: '\uc5f0\ucc28 \uc0ac\uc6a9\ub960(YTD)',
    value: '41',
    suffix: '%',
    delta: '\ub3d9\uae30 \ub300\ube44 \ub0ae\uc74c',
    up: false,
    hint: '\ud734\uac00\xb7\uadfc\ubb34 \ubaa8\ub4c8',
    icon: <ClockCircleOutlined className="tw-text-xl tw-text-amber-600" />,
  },
] as const;

type DeptRow = {
  key: string;
  dept: string;
  headcount: number;
  hired30d: number;
  leaveRate: number;
  pendingApprovals: number;
  risk: '\uc591\ud638' | '\ubcf4\ud1b5' | '\uc8fc\uc758';
};

const DEPT_SNAPSHOT: DeptRow[] = [
  { key: '1', dept: '\ubc31\uc5d4\ub4dc\ud300', headcount: 24, hired30d: 1, leaveRate: 38, pendingApprovals: 6, risk: '\ubcf4\ud1b5' },
  { key: '2', dept: '\ud504\ub860\ud2b8\uc5d4\ub4dc\ud300', headcount: 18, hired30d: 0, leaveRate: 44, pendingApprovals: 3, risk: '\uc591\ud638' },
  { key: '3', dept: '\uc778\uc0ac\uc6b4\uc601', headcount: 8, hired30d: 1, leaveRate: 52, pendingApprovals: 11, risk: '\uc8fc\uc758' },
  { key: '4', dept: '\uc7ac\ubb34\xb7\ucd1d\ubb34', headcount: 12, hired30d: 0, leaveRate: 35, pendingApprovals: 4, risk: '\uc591\ud638' },
  { key: '5', dept: '\uc601\uc5c5', headcount: 31, hired30d: 2, leaveRate: 29, pendingApprovals: 9, risk: '\ubcf4\ud1b5' },
];

const WORKFORCE_HIGHLIGHTS = [
  '\uad6c\uc131\uc6d0\xb7\uc870\uc9c1 \ub9c8\uc2a4\ud130\uc640 \uc5f0\ub3d9\ub418\uba74 \uc778\uc6d0 \uc218\xb7\ubd80\uc11c \uc2a4\ub0b5\uc0f7\uc740 \uc2e4\uc81c \ub370\uc774\ud130\ub85c \ub300\uccb4\ub429\ub2c8\ub2e4.',
  '\uc804\uc790\uacb0\uc7ac\xb7\ubd80\uc11c \ubb38\uc11c\ud568 SLA\ub294 \uacb0\uc7ac\ud568 \ub85c\uadf8\ub97c \uc9d1\uacc4\ud574 \ubd80\uc11c\xb7\uc9c1\uae09\ubcc4\ub85c \ub098\ub20c \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
  '\uadfc\ud0dc \ubaa8\ub4c8\uc774 \ubd99\uc73c\uba74 \uc9c0\uac01\xb7\uc794\uc5c5 \uad6c\uac04\uc744 \uac19\uc740 \ud654\uba74\uc5d0\uc11c \uacbd\uace0 \ubc30\uc9c0\ub85c \ubcf4\uc5ec \uc904 \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
  '\uc131\uacfc\xb7\ud3c9\uac00\xb7\uba74\ub2f4(\uc778\uc7ac \ud5c8\ube0c) \uc9c0\ud45c\ub294 \ubaa9\ud45c \uc9c4\ud589\ub960\xb7\uba74\ub2f4 \uc644\ub8cc\ub960\ub85c \ud655\uc7a5\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
];

const RISK_TAG: Record<DeptRow['risk'], { color: string }> = {
  '\uc591\ud638': { color: 'success' },
  '\ubcf4\ud1b5': { color: 'processing' },
  '\uc8fc\uc758': { color: 'warning' },
};

const deptColumns: ColumnsType<DeptRow> = [
  { title: '\ubd80\uc11c', dataIndex: 'dept', key: 'dept', ellipsis: true },
  {
    title: '\uc778\uc6d0',
    dataIndex: 'headcount',
    key: 'headcount',
    align: 'right',
    render: (n: number) => <span className="tw-tabular-nums">{n}</span>,
  },
  {
    title: '\ucd5c\uadfc 30\uc77c \uc785\uc0ac',
    dataIndex: 'hired30d',
    key: 'hired30d',
    align: 'right',
    render: (n: number) => <span className="tw-tabular-nums">{n}</span>,
  },
  {
    title: '\uc5f0\ucc28 \uc0ac\uc6a9\ub960',
    dataIndex: 'leaveRate',
    key: 'leaveRate',
    align: 'right',
    render: (n: number) => (
      <span className="tw-tabular-nums">
        {n}
        <span className="tw-text-slate-400">%</span>
      </span>
    ),
  },
  {
    title: '\uacb0\uc7ac \ub300\uae30',
    dataIndex: 'pendingApprovals',
    key: 'pendingApprovals',
    align: 'right',
    render: (n: number) => <span className="tw-tabular-nums tw-text-slate-800">{n}</span>,
  },
  {
    title: '\ubaa8\ub2c8\ud130\ub9c1',
    dataIndex: 'risk',
    key: 'risk',
    align: 'center',
    render: (r: DeptRow['risk']) => <Tag color={RISK_TAG[r].color}>{r}</Tag>,
  },
];

export function HrInsightsPage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={20}>
      <AppWorkspacePageTitle
        eyebrow="Insights"
        title={'\uc778\uc0ac\uc774\ud2b8'}
        subtitle={
          '\uc6cc\ud06c\ud3ec\uc2a4 HR \uc778\uc0ac\xb7\uc870\uc9c1\xb7\uadfc\ubb34\xb7\uacb0\uc7ac\xb7\uc778\uc7ac \ud5c8\ube0c\ub97c \uc544\uc6b0\ub974\ub294 \uc694\uc57d \uc9c0\ud45c\uc785\ub2c8\ub2e4. \uc544\ub798 \uc218\uce58\ub294 UI \uc2dc\uc5f0\uc6a9 \ub354\ubbf8\uc774\uba70, \ucd94\ud6c4 member-service\xb7\uacb0\uc7ac\xb7\uadfc\ud0dc API\uc640 \uc5f0\ub3d9\ud569\ub2c8\ub2e4.'
        }
      />

      <Row gutter={[16, 16]}>
        {KPI_STATS.map((k) => (
          <Col xs={24} sm={12} xl={6} key={k.title}>
            <Card
              className="tw-h-full tw-rounded-2xl tw-border-slate-200/90 tw-shadow-sm"
              styles={{ body: { padding: 16 } }}
            >
              <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
                <div>
                  <Typography.Text type="secondary" className="tw-text-xs">
                    {k.title}
                  </Typography.Text>
                  <div className="tw-mt-1 tw-flex tw-flex-wrap tw-items-baseline tw-gap-x-1">
                    <span className="tw-text-2xl tw-font-bold tw-tabular-nums tw-text-slate-900">{k.value}</span>
                    <span className="tw-text-sm tw-text-slate-500">{k.suffix}</span>
                  </div>
                  <div
                    className={clsx(
                      'tw-mt-2 tw-inline-flex tw-items-center tw-gap-1 tw-text-xs tw-font-medium',
                      k.up ? 'tw-text-emerald-600' : 'tw-text-amber-700',
                    )}
                  >
                    {k.up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {k.delta}
                  </div>
                  <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-[11px]">
                    {k.hint}
                  </Typography.Text>
                </div>
                <div className="tw-rounded-xl tw-bg-slate-50 tw-p-2">{k.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">
                {'\uc6b4\uc601 \uc9c0\ud45c (\uc0d8\ud50c)'}
              </span>
            }
            className="tw-rounded-2xl tw-border-slate-200/90 tw-shadow-sm"
            styles={{ body: { paddingTop: 12 } }}
          >
            <Space direction="vertical" className="tw-w-full" size={16}>
              <div>
                <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs tw-text-slate-600">
                  <span>{'\uc774\ubc88 \uc8fc \uadfc\ud0dc \uc815\uc0c1\ub960'}</span>
                  <span className="tw-font-medium tw-text-slate-900">96.2%</span>
                </div>
                <Progress percent={96.2} showInfo={false} strokeColor="#2563EB" trailColor="#e2e8f0" />
              </div>
              <div>
                <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs tw-text-slate-600">
                  <span>{'\ubd84\uae30 \ubaa9\ud45c(\uc131\uacfc) \uc81c\ucd9c\ub960'}</span>
                  <span className="tw-font-medium tw-text-slate-900">78%</span>
                </div>
                <Progress percent={78} showInfo={false} strokeColor="#2563EB" trailColor="#e2e8f0" />
              </div>
              <div>
                <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs tw-text-slate-600">
                  <span>{'\uba74\ub2f4 \uc77c\uc815 \uc774\ud589\ub960'}</span>
                  <span className="tw-font-medium tw-text-slate-900">64%</span>
                </div>
                <Progress percent={64} showInfo={false} strokeColor="#7c3aed" trailColor="#e2e8f0" />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">
                {'\uc6cc\ud06c\ud3ec\uc2a4 \uc5f0\ub3d9 \ub85c\ub4dc\ub9f5'}
              </span>
            }
            className="tw-rounded-2xl tw-border-slate-200/90 tw-shadow-sm"
            styles={{ body: { paddingTop: 12 } }}
          >
            <ul className="tw-m-0 tw-list-disc tw-space-y-2 tw-pl-5 tw-text-sm tw-text-slate-600">
              {WORKFORCE_HIGHLIGHTS.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">
            {'\ubd80\uc11c\ubcc4 \uc2a4\ub0b5\uc0f7 (\ub354\ubbf8)'}
          </span>
        }
        className="tw-rounded-2xl tw-border-slate-200/90 tw-shadow-sm"
        styles={{ body: { paddingTop: 12 } }}
      >
        <Table<DeptRow>
          size="small"
          pagination={false}
          columns={deptColumns}
          dataSource={DEPT_SNAPSHOT}
          scroll={{ x: true }}
        />
      </Card>
    </Space>
  );
}
