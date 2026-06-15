import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Steps } from 'antd';
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import adminClient from '../api/adminClient';
import { getErrorMessage } from '../utils/errors';

const STEPS = [{ title: 'Email' }, { title: 'Verify OTP' }, { title: 'New password' }];

export default function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');

  const sendOtp = async (values) => {
    setLoading(true);
    try {
      const normalizedEmail = values.email?.trim();
      const { data } = await adminClient.post('/admin/auth/forgot-password', { email: normalizedEmail });
      setEmail(normalizedEmail);
      setStep(1);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not send verification code'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (values) => {
    setLoading(true);
    try {
      const { data } = await adminClient.post('/admin/auth/verify-otp', {
        email,
        otp: values.otp?.trim(),
      });
      setResetToken(data.resetToken);
      setStep(2);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (values) => {
    setLoading(true);
    try {
      const { data } = await adminClient.post('/admin/auth/reset-password', {
        resetToken,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      message.success(data.message);
      navigate('/admin/login');
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not reset password'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const { data } = await adminClient.post('/admin/auth/forgot-password', { email });
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page admin-login-page">
      <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 480 }}>
        <Card className="login-card" bordered={false}>
          <Typography.Title level={3} className="login-card-title">
            Reset admin password
          </Typography.Title>
          <Typography.Text className="login-card-sub" type="secondary">
            We will email you a 6-digit code to verify your identity.
          </Typography.Text>

          <Steps current={step} items={STEPS} size="small" style={{ margin: '24px 0' }} />

          {step === 0 && (
            <Form layout="vertical" onFinish={sendOtp} size="large">
              <Form.Item name="email" label="Admin email" rules={[{ required: true, type: 'email' }]}>
                <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="admin@example.com" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} size="large" className="admin-login-btn">
                Send verification code
              </Button>
            </Form>
          )}

          {step === 1 && (
            <Form layout="vertical" onFinish={verifyOtp} size="large">
              <Typography.Paragraph type="secondary">
                Enter the 6-digit code sent to <strong>{email}</strong>.
              </Typography.Paragraph>
              <Form.Item
                name="otp"
                label="Verification code"
                rules={[
                  { required: true, message: 'Enter the 6-digit code' },
                  { pattern: /^\d{6}$/, message: 'Code must be 6 digits' },
                ]}
              >
                <Input
                  prefix={<SafetyCertificateOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="123456"
                  maxLength={6}
                  inputMode="numeric"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} size="large" className="admin-login-btn">
                Verify code
              </Button>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, textAlign: 'center' }}>
                <Button type="link" onClick={resendOtp} loading={loading} style={{ padding: 0 }}>
                  Resend code
                </Button>
                {' · '}
                <Button type="link" onClick={() => setStep(0)} style={{ padding: 0 }}>
                  Change email
                </Button>
              </Typography.Text>
            </Form>
          )}

          {step === 2 && (
            <Form layout="vertical" onFinish={resetPassword} size="large">
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
              <Button type="primary" htmlType="submit" block loading={loading} size="large" className="admin-login-btn">
                Update password
              </Button>
            </Form>
          )}

          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 20, textAlign: 'center' }}>
            <Link to="/admin/login">Back to admin sign in</Link>
          </Typography.Text>
        </Card>
      </div>
    </div>
  );
}
