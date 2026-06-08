import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Modal } from 'antd';
import { MailOutlined, LockOutlined, SafetyCertificateOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getErrorMessage } from '../utils/errors';

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const { adminLogin, isAdminAuthenticated } = useAdminAuth();
  const navigate = useNavigate();

  if (isAdminAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  const onLogin = async (values) => {
    setLoading(true);
    try {
      await adminLogin(values.email?.trim(), values.password);
      message.success('Welcome, Administrator');
      navigate('/admin');
    } catch (err) {
      Modal.error({
        title: 'Admin sign-in failed',
        content: getErrorMessage(err, 'Invalid email or password'),
        okText: 'OK',
        centered: true,
        icon: <CloseCircleOutlined style={{ color: '#dc2626' }} />,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page admin-login-page">
      <div className="login-brand admin-login-brand">
        <SafetyCertificateOutlined style={{ fontSize: 48, color: '#7c3aed', marginBottom: 16 }} />
        <h1>System Administration</h1>
        <p>Manage manager account registrations, approve new teams, and oversee all tenants on the platform.</p>
      </div>
      <div className="login-form-panel">
        <Card className="login-card" bordered={false}>
          <Typography.Title level={3} className="login-card-title">
            Admin Sign In
          </Typography.Title>
          <Typography.Text className="login-card-sub">Platform administrator access only</Typography.Text>
          <Form layout="vertical" onFinish={onLogin} size="large" style={{ marginTop: 24 }}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="admin@example.com" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} size="large" className="admin-login-btn">
              Sign in as Admin
            </Button>
          </Form>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, textAlign: 'center' }}>
            <Link to="/login">Back to manager / member login</Link>
          </Typography.Text>
        </Card>
      </div>
    </div>
  );
}
