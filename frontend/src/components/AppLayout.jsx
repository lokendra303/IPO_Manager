import { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Button, Avatar, Tooltip, Badge } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  BankOutlined,
  WalletOutlined,
  StockOutlined,
  BarChartOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
  PercentageOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const { Header, Sider, Content } = Layout;

export default function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [openIssueCount, setOpenIssueCount] = useState(0);

  useEffect(() => {
    client
      .get('/member-issues/count')
      .then((r) => setOpenIssueCount(r.data.openCount ?? 0))
      .catch(() => setOpenIssueCount(0));
  }, [location.pathname]);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    {
      key: '/notifications',
      icon: <BellOutlined />,
      label: (
        <Link to="/notifications" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Notifications</span>
          {openIssueCount > 0 && (
            <Badge count={openIssueCount} size="small" style={{ marginLeft: 8 }} />
          )}
        </Link>
      ),
    },
    { key: '/members', icon: <TeamOutlined />, label: <Link to="/members">Members</Link> },
    { key: '/fund-providers', icon: <BankOutlined />, label: <Link to="/fund-providers">Fund Providers</Link> },
    { key: '/wallet', icon: <WalletOutlined />, label: <Link to="/wallet">Wallet</Link> },
    { key: '/ipos', icon: <StockOutlined />, label: <Link to="/ipos">IPOs</Link> },
    { key: '/summary', icon: <BarChartOutlined />, label: <Link to="/summary">Summary</Link> },
    { key: '/profit-sharing', icon: <PercentageOutlined />, label: <Link to="/profit-sharing">Profit Sharing</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
  ];

  const selectedKey =
    menuItems.find((m) => m.key !== '/' && location.pathname.startsWith(m.key))?.key ||
    (location.pathname === '/' ? '/' : location.pathname);

  const email = user?.email || '';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" width={248} theme="dark">
        <div className="app-sider-logo">
          <div className="app-sider-logo-icon">IPO</div>
          <div>
            <div className="app-sider-logo-text">IPO Team</div>
            <div className="app-sider-logo-sub">Fund Manager</div>
          </div>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} style={{ border: 'none' }} />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-inner">
            <div className="app-header-left">
              <span className="app-header-team-label">Team</span>
              <Typography.Title level={5} className="app-header-team">
                {user?.tenantName || 'My Team'}
              </Typography.Title>
            </div>

            <div className="app-header-right">
              <Link to="/settings" className="app-header-user">
                <Avatar size={40} icon={<UserOutlined />} className="app-header-avatar" />
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
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
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
