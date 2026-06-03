import { useState } from 'react';
import { Card, Form, Input, Button, Tabs, Typography, message } from 'antd';
import { MailOutlined, LockOutlined, TeamOutlined, IdcardOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { login, memberLogin, register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    navigate(user?.role === 'member' ? '/portal' : '/');
    return null;
  }

  const onMemberLogin = async (values) => {
    setLoading(true);
    try {
      await memberLogin(values.pan?.trim());
      message.success('Welcome!');
      navigate('/portal');
    } catch (err) {
      message.error(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (values) => {
    setLoading(true);
    try {
      await login(values.email?.trim(), values.password);
      message.success('Welcome back!');
      navigate('/');
    } catch (err) {
      message.error(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values) => {
    setLoading(true);
    try {
      await register(values.email?.trim(), values.password, values.tenantName?.trim());
      message.success('Account created!');
      navigate('/');
    } catch (err) {
      message.error(getErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <h1>IPO Team Manager</h1>
        <p>
          Track members, fund providers, wallet flows, and IPO profit — all in one place. Built for team owners managing Groww IPO groups.
        </p>
        <div className="login-brand-features">
          <div className="login-brand-feature"><span className="login-brand-feature-dot" /> Multi-tenant team workspaces</div>
          <div className="login-brand-feature"><span className="login-brand-feature-dot" /> Wallet & provider ledger</div>
          <div className="login-brand-feature"><span className="login-brand-feature-dot" /> Per-member IPO history & P&L</div>
        </div>
      </div>
      <div className="login-form-panel">
        <Card className="login-card" bordered={false}>
          <Typography.Title level={3} className="login-card-title">
            Welcome
          </Typography.Title>
          <Typography.Text className="login-card-sub">Sign in as manager or member</Typography.Text>
          <Tabs
            size="large"
            items={[
              {
                key: 'login',
                label: 'Manager',
                children: (
                  <Form layout="vertical" onFinish={onLogin} size="large">
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                      <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="you@email.com" />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                      <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      Sign in
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'member',
                label: 'Member',
                children: (
                  <Form layout="vertical" onFinish={onMemberLogin} size="large">
                    <Form.Item
                      name="pan"
                      label="PAN Number"
                      rules={[
                        { required: true, message: 'PAN is required' },
                        {
                          pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/i,
                          message: 'Enter valid PAN (e.g. ABCDE1234F)',
                        },
                      ]}
                    >
                      <Input
                        prefix={<IdcardOutlined style={{ color: '#94a3b8' }} />}
                        placeholder="ABCDE1234F"
                        style={{ textTransform: 'uppercase' }}
                        maxLength={10}
                      />
                    </Form.Item>
                    <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      No password needed — use the PAN registered by your manager.
                    </Typography.Text>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      View my IPOs
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: 'Register',
                children: (
                  <Form layout="vertical" onFinish={onRegister} size="large">
                    <Form.Item name="tenantName" label="Team Name" rules={[{ required: true }]}>
                      <Input prefix={<TeamOutlined style={{ color: '#94a3b8' }} />} placeholder="My IPO Team" />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                      <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="you@email.com" />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
                      <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Min. 6 characters" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      Create account
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
