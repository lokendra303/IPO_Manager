import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/forgot-password', {
        email: values.email?.trim(),
      });
      setSent(true);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not send reset email'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 440 }}>
        <Card className="login-card" bordered={false}>
          <Typography.Title level={3} className="login-card-title">
            Forgot password
          </Typography.Title>
          <Typography.Text className="login-card-sub" type="secondary">
            Enter your manager account email and we will send a reset link.
          </Typography.Text>
          {sent ? (
            <div style={{ marginTop: 24 }}>
              <Typography.Paragraph>
                If an account exists for that email, a password reset link has been sent. Check your inbox and spam
                folder.
              </Typography.Paragraph>
              <Link to="/login">Back to sign in</Link>
            </div>
          ) : (
            <Form layout="vertical" onFinish={onFinish} size="large" style={{ marginTop: 24 }}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="you@email.com" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} size="large">
                Send reset link
              </Button>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, textAlign: 'center' }}>
                <Link to="/login">Back to sign in</Link>
              </Typography.Text>
            </Form>
          )}
        </Card>
      </div>
    </div>
  );
}
