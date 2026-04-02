import { Dropdown, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from '@tanstack/react-router';
import { AppDataTable } from '@/shared/ui/AppDataTable';
import { PermissionGuard } from '@/features/permissions/permission-guard';
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
    { title: 'Name', dataIndex: 'name' },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Department', dataIndex: 'department' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status: Member['status']) => (
        <Tag color={status === 'ACTIVE' ? 'green' : status === 'DORMANT' ? 'gold' : 'volcano'}>{status}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, row) => (
        <Space>
          <Dropdown
            menu={{
              items: [
                { key: 'view', label: <Link to="/app/members/$memberId" params={{ memberId: row.id }}>{`View ${row.name}`}</Link> },
                {
                  key: 'edit',
                  label: (
                    <PermissionGuard required="members.edit" fallback={<span style={{ opacity: 0.5 }}>Edit (No permission)</span>}>
                      <span>Edit</span>
                    </PermissionGuard>
                  ),
                },
              ],
            }}
          >
            <a>More</a>
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
      pagination={{ current: page, pageSize, total, onChange: onPageChange, showSizeChanger: true }}
    />
  );
}
