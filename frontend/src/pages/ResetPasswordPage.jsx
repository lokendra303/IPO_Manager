import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Result } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/reset-password', {
        token,
        password: values.password,
      });
      setDone(true);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not reset password'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 440 }}>
          <Card className="login-card" bordered={false}>
            <Result
              status="error"
              title="Invalid reset link"
              subTitle="This password reset link is missing or invalid."
              extra={<Link to="/forgot-password">Request a new link</Link>}
            />
          </Card>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 440 }}>
          <Card className="login-card" bordered={false}>
            <Result
              status="success"
              title="Password updated"
              subTitle="You can now sign in with your new password."
              extra={<Link to="/login">Go to sign in</Link>}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 440 }}>
        <Card className="login-card" bordered={false}>
          <Typography.Title level={3} className="login-card-title">
            Choose a new password
          </Typography.Title>
          <Form layout="vertical" onFinish={onFinish} size="large" style={{ marginTop: 24 }}>
            <Form.Item
              name="password"
              label="New password"
              rules={[{ required: true, min: 6, message: 'At least 6 characters' }]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Min. 6 characters" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="Confirm password"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="Repeat password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} size="large">
              Update password
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}
