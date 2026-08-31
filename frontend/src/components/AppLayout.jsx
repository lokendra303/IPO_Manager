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
  ApartmentOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RiseOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const { Header, Sider, Content } = Layout;

/** Longer paths first so /member-groups does not match /members */
const MENU_PATH_KEYS = [
  '/notifications',
  '/member-groups',
  '/group-leader-wallets',
  '/adjust-combine',
  '/members',
  '/fund-providers',
  '/wallet',
  '/ipos',
  '/summary',
  '/profit-analysis',
  '/profit-sharing',
  '/audit-log',
  '/settings',
];

function getSelectedMenuKey(pathname) {
  if (pathname === '/') return '/';
  const match = MENU_PATH_KEYS.find(
    (key) => pathname === key || pathname.startsWith(`${key}/`)
  );
  return match || pathname;
}

export default function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [openIssueCount, setOpenIssueCount] = useState(0);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 992
  );

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
    { key: '/member-groups', icon: <ApartmentOutlined />, label: <Link to="/member-groups">Sub-Groups</Link> },
    { key: '/group-leader-wallets', icon: <WalletOutlined />, label: <Link to="/group-leader-wallets">Leader wallets</Link> },
    { key: '/fund-providers', icon: <BankOutlined />, label: <Link to="/fund-providers">Fund Providers</Link> },
    { key: '/wallet', icon: <WalletOutlined />, label: <Link to="/wallet">Wallet</Link> },
    { key: '/ipos', icon: <StockOutlined />, label: <Link to="/ipos">IPOs</Link> },
    { key: '/adjust-combine', icon: <SwapOutlined />, label: <Link to="/adjust-combine">Reuse leftover</Link> },
    { key: '/summary', icon: <BarChartOutlined />, label: <Link to="/summary">Summary</Link> },
    { key: '/profit-analysis', icon: <RiseOutlined />, label: <Link to="/profit-analysis">Profit Analysis</Link> },
    { key: '/profit-sharing', icon: <PercentageOutlined />, label: <Link to="/profit-sharing">Profit Sharing</Link> },
    { key: '/audit-log', icon: <HistoryOutlined />, label: <Link to="/audit-log">Audit Log</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
  ];

  const selectedKey = getSelectedMenuKey(location.pathname);

  const email = user?.email || '';

  const toggleNav = () => setSiderCollapsed((c) => !c);

  return (
    <Layout
      style={{ minHeight: '100vh' }}
      className={mobileNav && !siderCollapsed ? 'app-layout-nav-open' : undefined}
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
        className="app-sider"
        theme="dark"
        width={248}
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
          <div className="app-sider-logo-icon">IPO</div>
          <div className="app-sider-logo-text-wrap">
            <div className="app-sider-logo-text">IPO Team</div>
            <div className="app-sider-logo-sub">Fund Manager</div>
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
            items={menuItems}
            style={{ border: 'none' }}
            onClick={() => {
              if (window.innerWidth < 992) setSiderCollapsed(true);
            }}
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
                <span className="app-header-team-label">Team</span>
                <Typography.Title level={5} className="app-header-team">
                  {user?.tenantName || 'My Team'}
                </Typography.Title>
              </div>
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
