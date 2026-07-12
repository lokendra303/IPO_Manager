import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Result } from 'antd';
import { MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [form] = Form.useForm();

  const verifyOtp = async (values) => {
    setLoading(true);
    try {
      const normalizedEmail = (values.email || email)?.trim();
      const { data } = await client.post('/auth/verify-email', {
        email: normalizedEmail,
        otp: values.otp?.trim(),
      });
      setEmail(normalizedEmail);
      setDone(true);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    const targetEmail = (form.getFieldValue('email') || email)?.trim();
    if (!targetEmail) {
      message.error('Enter your email first');
      return;
    }
    setResendLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification', { email: targetEmail });
      setEmail(targetEmail);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 480 }}>
        <Card className="login-card" bordered={false}>
          {done ? (
            <Result
              status="success"
              title="Email confirmed"
              subTitle={
                email
                  ? `${email} is verified. Your registration is now waiting for system administrator approval. You can sign in once approved.`
                  : 'Your email is verified. Your registration is waiting for administrator approval.'
              }
              extra={
                <Button type="primary" onClick={() => navigate('/login')}>
                  Go to sign in
                </Button>
              }
            />
          ) : (
            <>
              <Typography.Title level={3} className="login-card-title">
                Verify your email
              </Typography.Title>
              <Typography.Text className="login-card-sub" type="secondary">
                Enter the 6-digit code sent to your email. After verification, a system administrator must approve your team.
              </Typography.Text>

              <Form
                form={form}
                layout="vertical"
                onFinish={verifyOtp}
                size="large"
                style={{ marginTop: 24 }}
                initialValues={{ email: initialEmail }}
              >
                <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                  <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="you@email.com" />
                </Form.Item>
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
                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                  Verify code
                </Button>
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, textAlign: 'center' }}>
                  <Button type="link" onClick={resendOtp} loading={resendLoading} style={{ padding: 0 }}>
                    Resend code
                  </Button>
                  {' · '}
                  <Link to="/login">Back to sign in</Link>
                </Typography.Text>
              </Form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
