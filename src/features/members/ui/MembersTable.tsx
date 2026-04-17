import { Button, Dropdown, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from '@tanstack/react-router';
import { MEMBER_STATUS_KO } from '@/app/locale/app-ko';
import { AppDataTable } from '@/shared/ui/AppDataTable';
import type { Member } from '@/features/members/model/types';

type Props = {
  rows: Member[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
};

export function MembersTable({ rows, loading, total, page, pageSize, onPageChange }: Props) {
  const columns: ColumnsType<Member> = [
    { title: '이름', dataIndex: 'name' },
    { title: '이메일', dataIndex: 'email' },
    { title: '부서', dataIndex: 'department' },
    {
      title: '상태',
      dataIndex: 'status',
      render: (status: Member['status']) => (
        <Tag color={status === 'ACTIVE' ? 'green' : status === 'DORMANT' ? 'gold' : 'volcano'}>
          {MEMBER_STATUS_KO[status]}
        </Tag>
      ),
    },
    {
      title: '작업',
      key: 'actions',
      render: (_, row) => (
        <Space>
          <Dropdown
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
            <Button type="link" className="!tw-px-1">
              더보기
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <AppDataTable
      rowKey="id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      pagination={{
        current: page,
        pageSize,
        total,
        onChange: onPageChange,
        showSizeChanger: true,
        showTotal: (t) => `총 ${t}건`,
      }}
    />
  );
}
