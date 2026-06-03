import { Layout, Typography, Button, Avatar } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Header, Content } = Layout;

export default function MemberLayout({ children }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <Layout className="app-main" style={{ minHeight: '100vh' }}>
      <Header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-left">
            <span className="app-header-team-label">Team</span>
            <Typography.Title level={5} className="app-header-team">
              {user?.tenantName || 'My Team'}
            </Typography.Title>
          </div>
          <div className="app-header-right">
            <div className="app-header-user">
              <Avatar size={40} icon={<UserOutlined />} className="app-header-avatar" />
              <div className="app-header-user-text">
                <span className="app-header-user-role">Member</span>
                <span className="app-header-user-email">{user?.displayName || user?.pan}</span>
              </div>
            </div>
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
  );
}
