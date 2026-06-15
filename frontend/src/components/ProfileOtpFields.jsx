import { Button, Form, Input, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

export function ProfilePasswordOtpFields({ email, onSendOtp, sendLoading }) {
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        For security, we will send a 6-digit code to your current email <strong>{email}</strong> before updating
        your password.
      </Typography.Paragraph>
      <Form.Item
        name="otp"
        label="Verification code"
        rules={[
          { required: true, message: 'Enter the verification code' },
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
      <Typography.Text type="secondary">
        <Button type="link" onClick={onSendOtp} loading={sendLoading} style={{ padding: 0 }}>
          Send code to current email
        </Button>
      </Typography.Text>
    </>
  );
}

export function ProfileEmailChangeFields({
  currentEmail,
  onSendCodes,
  sendLoading,
  codesSent,
  pendingNewEmail,
}) {
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Enter your new email, then we will send a separate verification code to both your current address (
        <strong>{currentEmail}</strong>) and the new one to confirm you own both.
      </Typography.Paragraph>
      <Form.Item
        name="email"
        label="New email address"
        rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
      >
        <Input placeholder="you@email.com" />
      </Form.Item>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        <Button type="link" onClick={onSendCodes} loading={sendLoading} style={{ padding: 0 }}>
          Send codes to both emails
        </Button>
      </Typography.Text>
      {codesSent ? (
        <>
          <Typography.Paragraph type="secondary">
            Codes sent to <strong>{currentEmail}</strong> and <strong>{pendingNewEmail}</strong>.
          </Typography.Paragraph>
          <Form.Item
            name="currentOtp"
            label={`Code from current email (${currentEmail})`}
            rules={[
              { required: true, message: 'Enter the code from your current email' },
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
          <Form.Item
            name="newOtp"
            label={`Code from new email (${pendingNewEmail})`}
            rules={[
              { required: true, message: 'Enter the code from your new email' },
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
        </>
      ) : null}
    </>
  );
}

async function verifyPasswordAndPatch({
  verifyOtp,
  patch,
  otp,
  patchBody,
  onSuccess,
  onError,
  setLoading,
}) {
  setLoading(true);
  try {
    const { data: verify } = await verifyOtp({ otp: otp?.trim() });
    const { data } = await patch({ ...patchBody, actionToken: verify.actionToken });
    onSuccess(data);
  } catch (err) {
    onError(err);
  } finally {
    setLoading(false);
  }
}

async function verifyEmailChangeAndPatch({
  verifyOtp,
  patch,
  newEmail,
  currentOtp,
  newOtp,
  onSuccess,
  onError,
  setLoading,
}) {
  setLoading(true);
  try {
    const { data: verify } = await verifyOtp({
      newEmail: newEmail?.trim(),
      currentOtp: currentOtp?.trim(),
      newOtp: newOtp?.trim(),
    });
    const { data } = await patch({
      email: newEmail?.trim(),
      actionToken: verify.actionToken,
    });
    onSuccess(data);
  } catch (err) {
    onError(err);
  } finally {
    setLoading(false);
  }
}

export { verifyPasswordAndPatch, verifyEmailChangeAndPatch };
