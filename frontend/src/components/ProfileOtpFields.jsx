import { Button, Form, Input, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

export default function ProfileOtpFields({ email, onSendOtp, sendLoading }) {
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        For security, verify your identity with a 6-digit code sent to <strong>{email}</strong>.
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
          Send verification code
        </Button>
      </Typography.Text>
    </>
  );
}

async function verifyAndPatch({ verifyOtp, patch, otp, patchBody, onSuccess, onError, setLoading }) {
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

export { verifyAndPatch };
