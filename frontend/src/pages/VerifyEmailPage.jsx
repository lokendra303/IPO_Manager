import { useEffect, useState } from 'react';
import { Card, Button, Typography, Result, Spin } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Verification link is missing or invalid.');
      setLoading(false);
      return;
    }

    client
      .get('/auth/verify-email', { params: { token } })
      .then((res) => {
        setEmail(res.data.email || '');
      })
      .catch((err) => {
        setError(getErrorMessage(err, 'Could not verify email'));
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="login-page">
      <div className="login-form-panel" style={{ margin: '0 auto', maxWidth: 480 }}>
        <Card className="login-card" bordered={false}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Spin size="large" />
              <Typography.Paragraph style={{ marginTop: 16 }}>Confirming your email…</Typography.Paragraph>
            </div>
          ) : error ? (
            <Result
              status="error"
              title="Email verification failed"
              subTitle={error}
              extra={
                <>
                  <Link to="/login">
                    <Button type="primary">Back to sign in</Button>
                  </Link>
                </>
              }
            />
          ) : (
            <Result
              status="success"
              title="Email confirmed"
              subTitle={
                email
                  ? `${email} is verified. You can sign in once a system administrator approves your account.`
                  : 'Your email is verified. You can sign in once your account is approved.'
              }
              extra={
                <Link to="/login">
                  <Button type="primary">Go to sign in</Button>
                </Link>
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}
