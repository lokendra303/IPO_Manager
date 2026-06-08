import { useState } from 'react';
import { Layout, Menu, Typography, Button, Avatar, Tooltip } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

const { Header, Sider, Content } = Layout;

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, adminLogout } = useAdminAuth();
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 992
  );

  const selectedKey = (() => {
    if (location.pathname.startsWith('/admin/registrations')) return '/admin/registrations';
    if (location.pathname.startsWith('/admin/settings')) return '/admin/settings';
    if (location.pathname.startsWith('/admin/audit-log')) return '/admin/audit-log';
    if (location.pathname.startsWith('/admin/tenants')) return '/admin/registrations';
    return '/admin';
  })();

  const handleLogout = () => {
    adminLogout();
    navigate('/admin/login');
  };

  const toggleNav = () => setSiderCollapsed((c) => !c);
  const email = admin?.email || '';

  return (
    <Layout
      style={{ minHeight: '100vh' }}
      className={`admin-layout${mobileNav && !siderCollapsed ? ' app-layout-nav-open' : ''}`}
    >
      {mobileNav && !siderCollapsed && (
        <button
          type="button"
          className="app-sider-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setSiderCollapsed(true)}
        />
      )}
      <Sider
        width={248}
        className="app-sider admin-sider"
        theme="dark"
        collapsible
        collapsed={siderCollapsed}
        onCollapse={setSiderCollapsed}
        breakpoint="lg"
        collapsedWidth={mobileNav ? 0 : 80}
        trigger={null}
        onBreakpoint={(broken) => {
          setMobileNav(broken);
          if (broken) setSiderCollapsed(true);
        }}
      >
        <div className="app-sider-logo">
          <div className="app-sider-logo-icon admin-logo-icon">
            <SafetyCertificateOutlined />
          </div>
          <div className="app-sider-logo-text-wrap">
            <div className="app-sider-logo-text">System Admin</div>
            <div className="app-sider-logo-sub">IPO Manager</div>
          </div>
          <Tooltip title={siderCollapsed ? 'Expand menu' : 'Collapse menu'} placement="right">
            <Button
              type="text"
              className="app-sider-collapse-btn"
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              aria-label={siderCollapsed ? 'Expand menu' : 'Collapse menu'}
              onClick={toggleNav}
            />
          </Tooltip>
        </div>
        <div className="app-sider-menu">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            style={{ border: 'none' }}
            onClick={() => {
              if (window.innerWidth < 992) setSiderCollapsed(true);
            }}
            items={[
              {
                key: '/admin',
                icon: <DashboardOutlined />,
                label: <Link to="/admin">Dashboard</Link>,
              },
              {
                key: '/admin/registrations',
                icon: <TeamOutlined />,
                label: <Link to="/admin/registrations">Manager Accounts</Link>,
              },
            {
              key: '/admin/audit-log',
              icon: <HistoryOutlined />,
              label: <Link to="/admin/audit-log">Audit Log</Link>,
            },
            {
              key: '/admin/settings',
              icon: <SettingOutlined />,
              label: <Link to="/admin/settings">Profile</Link>,
            },
            ]}
          />
        </div>
      </Sider>
      <Layout className="app-main">
        <Header className="app-header">
          <div className="app-header-inner">
            <div className="app-header-left">
              <Tooltip title={siderCollapsed ? 'Open menu' : 'Close menu'}>
                <Button
                  type="text"
                  className={`app-menu-toggle${siderCollapsed ? ' app-menu-toggle--collapsed' : ''}`}
                  icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  aria-label={siderCollapsed ? 'Open menu' : 'Close menu'}
                  onClick={toggleNav}
                />
              </Tooltip>
              <div className="app-header-team-block">
                <span className="app-header-team-label admin-header-label">Platform</span>
                <Typography.Title level={5} className="app-header-team">
                  System Administration
                </Typography.Title>
              </div>
            </div>

            <div className="app-header-right">
              <Link to="/admin/settings" className="app-header-user admin-header-user">
                <Avatar size={40} icon={<SafetyCertificateOutlined />} className="app-header-avatar admin-avatar" />
                <div className="app-header-user-text">
                  <span className="app-header-user-role">Signed in as</span>
                  <Tooltip title={email}>
                    <span className="app-header-user-email">{email}</span>
                  </Tooltip>
                </div>
              </Link>
              <div className="app-header-divider" aria-hidden />
              <Button
                type="text"
                className="app-header-logout"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        </Header>
        <Content className="app-content">
          <div className="app-content-inner">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
