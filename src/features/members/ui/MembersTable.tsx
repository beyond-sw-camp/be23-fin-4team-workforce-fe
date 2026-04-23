import { EllipsisOutlined } from '@ant-design/icons';
import { Button, Dropdown, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useNavigate } from '@tanstack/react-router';
import { MEMBER_STATUS_KO } from '@/app/locale/app-ko';
import { AppDataTable } from '@/shared/ui/AppDataTable';
import type { Member } from '@/features/members/model/types';

const { Text } = Typography;

const colTitle = (label: string) => (
  <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">{label}</span>
);

function statusPill(status: Member['status']) {
  const u = status.toUpperCase();
  const cls =
    u === 'ACTIVE'
      ? 'tw-bg-emerald-50 tw-text-emerald-700 tw-ring-emerald-600/15'
      : u === 'DORMANT'
        ? 'tw-bg-amber-50 tw-text-amber-800 tw-ring-amber-500/20'
        : 'tw-bg-slate-100 tw-text-slate-600 tw-ring-slate-300/60';
  return (
    <span className={`tw-inline-flex tw-rounded-full tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-semibold tw-ring-1 ${cls}`}>
      {MEMBER_STATUS_KO[status]}
    </span>
  );
}

type Props = {
  rows: Member[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
};

export function MembersTable({ rows, loading, total, page, pageSize, onPageChange }: Props) {
  const navigate = useNavigate();

  const goDetail = (memberId: string) => {
    void navigate({ to: '/app/members/$memberId', params: { memberId } });
  };

  const columns: ColumnsType<Member> = [
    {
      title: colTitle('이름'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      onCell: (record) => ({
        onClick: () => goDetail(record.id),
      }),
      render: (v: string) => (
        <Text strong className="tw-text-[15px] tw-text-slate-900">
          {v}
        </Text>
      ),
    },
    {
      title: colTitle('이메일'),
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      onCell: (record) => ({
        onClick: () => goDetail(record.id),
      }),
      render: (v: string) => <span className="tw-text-sm tw-text-slate-600">{v}</span>,
    },
    {
      title: colTitle('부서'),
      dataIndex: 'department',
      key: 'department',
      ellipsis: true,
      onCell: (record) => ({
        onClick: () => goDetail(record.id),
      }),
      render: (v: string) => <span className="tw-text-sm tw-text-slate-700">{v}</span>,
    },
    {
      title: colTitle('상태'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      onCell: (record) => ({
        onClick: () => goDetail(record.id),
      }),
      render: (status: Member['status']) => statusPill(status),
    },
    {
      title: '',
      key: 'actions',
      width: 52,
      align: 'center',
      onCell: () => ({
        onClick: (e) => e.stopPropagation(),
      }),
      render: (_, row) => (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              {
                key: 'view',
                label: (
                  <Link to="/app/members/$memberId" params={{ memberId: row.id }}>
                    상세 보기
                  </Link>
                ),
              },
            ],
          }}
        >
          <Button
            type="text"
            icon={<EllipsisOutlined />}
            onClick={(e) => e.stopPropagation()}
            className="tw-text-slate-400 hover:tw-text-slate-700"
            aria-label="행 메뉴"
          />
        </Dropdown>
      ),
    },
  ];

  return (
    <AppDataTable<Member>
      rowKey="id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      rowClassName={() => 'tw-cursor-pointer'}
      pagination={{
        current: page,
        pageSize,
        total,
        onChange: onPageChange,
        showSizeChanger: true,
        showTotal: (t) => `총 ${t}건`,
        className: 'tw-mb-1 tw-mt-3 tw-px-2',
      }}
    />
  );
}
