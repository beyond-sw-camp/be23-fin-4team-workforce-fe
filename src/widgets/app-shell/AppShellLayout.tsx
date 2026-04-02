import { Layout, Menu } from 'antd';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useLayoutStore } from '@/shared/stores/layoutStore';

const menuItems = [
  { key: '/app/dashboard', label: <Link to="/app/dashboard">Dashboard</Link> },
  { key: '/app/members', label: <Link to="/app/members">Members</Link> },
  { key: '/app/organization', label: <Link to="/app/organization">Organization</Link> },
  { key: '/app/attendance', label: <Link to="/app/attendance">Attendance</Link> },
  { key: '/app/leave', label: <Link to="/app/leave">Leave</Link> },
  { key: '/app/approvals', label: <Link to="/app/approvals">Approvals</Link> },
  { key: '/app/payroll', label: <Link to="/app/payroll">Payroll</Link> },
  { key: '/app/mail', label: <Link to="/app/mail">Mail</Link> },
  { key: '/app/notifications', label: <Link to="/app/notifications">Notifications</Link> },
  { key: '/app/performance', label: <Link to="/app/performance">Performance</Link> },
  { key: '/app/evaluations', label: <Link to="/app/evaluations">Evaluations</Link> },
  { key: '/app/ai-assistant', label: <Link to="/app/ai-assistant">AI Assistant</Link> },
  { key: '/app/settings', label: <Link to="/app/settings">Settings</Link> },
];

export function AppShellLayout() {
  const { siderCollapsed } = useLayoutStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <Layout className="tw-h-full">
      <Layout.Sider collapsible collapsed={siderCollapsed}>
        <div className="tw-p-4 tw-text-white">Workforce</div>
        <Menu theme="dark" mode="inline" selectedKeys={[pathname]} items={menuItems} />
      </Layout.Sider>
      <Layout.Content className="tw-p-6">
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
