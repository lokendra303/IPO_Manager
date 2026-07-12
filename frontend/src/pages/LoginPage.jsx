import { useState } from 'react';
import { Card, Form, Input, Button, Tabs, Typography, message, Modal } from 'antd';
import { MailOutlined, LockOutlined, TeamOutlined, IdcardOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { getAuthErrorModal, getErrorMessage } from '../utils/errors';

function showAuthErrorModal(err, context) {
  const { title, content } = getAuthErrorModal(err, context);
  Modal.error({
    title,
    content,
    okText: 'OK',
    centered: true,
    icon: <CloseCircleOutlined style={{ color: '#dc2626' }} />,
    className: 'auth-error-modal',
  });
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('');
  const [managerForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const { login, memberLogin, register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to={user?.role === 'member' ? '/portal' : '/'} replace />;
  }

  const onMemberLogin = async (values) => {
    setLoading(true);
    try {
      await memberLogin(values.pan?.trim().toUpperCase());
      message.success('Welcome!');
      navigate('/portal');
    } catch (err) {
      showAuthErrorModal(err, 'member');
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (values) => {
    setLoading(true);
    setPendingVerifyEmail('');
    try {
      await login(values.email?.trim(), values.password);
      message.success('Welcome back!');
      navigate('/');
    } catch (err) {
      const raw = err?.response?.data?.error || '';
      if (raw.toLowerCase().includes('confirm your email')) {
        setPendingVerifyEmail(values.email?.trim() || '');
      }
      showAuthErrorModal(err, 'manager');
    } finally {
      setLoading(false);
    }
  };

  const onResendVerification = async () => {
    if (!pendingVerifyEmail) return;
    setResendLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification', { email: pendingVerifyEmail });
      message.success(data.message);
      navigate(`/verify-email?email=${encodeURIComponent(pendingVerifyEmail)}`);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setResendLoading(false);
    }
  };

  const onRegister = async (values) => {
    setLoading(true);
    try {
      const email = values.email?.trim();
      await register(email, values.password, values.tenantName?.trim());
      registerForm.resetFields();
      message.success('Registration submitted. Enter the verification code sent to your email.');
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      showAuthErrorModal(err, 'register');
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
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'member',
                label: 'Member',
                children: (
                  <Form layout="vertical" onFinish={onMemberLogin} size="large">
                    <Form.Item
                      name="pan"
                      label="PAN Number"
                      normalize={(v) => (v ? String(v).toUpperCase() : v)}
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
                      No password — use the PAN your manager added under Members. Opens{' '}
                      <Typography.Text code>/portal</Typography.Text> after sign-in.
                    </Typography.Text>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      Open member portal
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'login',
                label: 'Manager',
                children: (
                  <Form form={managerForm} layout="vertical" onFinish={onLogin} size="large">
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                      <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="you@email.com" />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                      <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Password" />
                    </Form.Item>
                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                      <Link to="/forgot-password">Forgot password?</Link>
                    </div>
                    {pendingVerifyEmail ? (
                      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        Need a new code?{' '}
                        <Button type="link" size="small" loading={resendLoading} onClick={onResendVerification} style={{ padding: 0 }}>
                          Resend verification code
                        </Button>
                        {' · '}
                        <Link to={`/verify-email?email=${encodeURIComponent(pendingVerifyEmail)}`}>Enter code</Link>
                      </Typography.Text>
                    ) : null}
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      Sign in
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: 'Register',
                children: (
                  <Form form={registerForm} layout="vertical" onFinish={onRegister} size="large">
                    <Form.Item name="tenantName" label="Team Name" rules={[{ required: true }]}>
                      <Input prefix={<TeamOutlined style={{ color: '#94a3b8' }} />} placeholder="My IPO Team" />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                      <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="you@email.com" />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
                      <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Min. 6 characters" />
                    </Form.Item>
                    <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      New teams require an email verification code and administrator approval before you can sign in.
                    </Typography.Text>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">
                      Submit registration
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 20, textAlign: 'center', fontSize: 12 }}>
            <Link to="/admin/login">System administrator</Link>
          </Typography.Text>
        </Card>
      </div>
    </div>
  );
}
