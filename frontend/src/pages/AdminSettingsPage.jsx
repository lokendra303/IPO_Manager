import { useEffect, useState } from 'react';
import { Form, Input, Button, message, Typography, Row, Col, Avatar, Tabs } from 'antd';
import { MailOutlined, SafetyOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import adminClient from '../api/adminClient';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getErrorMessage } from '../utils/errors';
import {
  ProfilePasswordOtpFields,
  ProfileEmailChangeFields,
  verifyPasswordAndPatch,
  verifyEmailChangeAndPatch,
} from '../components/ProfileOtpFields';
import PageHeader from '../components/PageHeader';
import SettingsSection from '../components/SettingsSection';

function FormFooter({ loading, label }) {
  return (
    <div className="settings-form-footer settings-form-footer--end">
      <Button type="primary" htmlType="submit" loading={loading} size="large" className="admin-login-btn">
        {label}
      </Button>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { admin, setAdmin } = useAdminAuth();
  const [emailLoading, setEmailLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [otpSendLoading, setOtpSendLoading] = useState(false);
  const [emailCodesSent, setEmailCodesSent] = useState(false);
  const [pendingNewEmail, setPendingNewEmail] = useState('');
  const [activeTab, setActiveTab] = useState('email');
  const [emailForm] = Form.useForm();
  const [passForm] = Form.useForm();

  useEffect(() => {
    setEmailCodesSent(false);
    setPendingNewEmail('');
    emailForm.resetFields();
  }, [activeTab, emailForm]);

  const sendPasswordOtp = async () => {
    setOtpSendLoading(true);
    try {
      const { data } = await adminClient.post('/admin/profile/send-password-otp');
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not send verification code'));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const sendEmailChangeCodes = async () => {
    const newEmail = emailForm.getFieldValue('email')?.trim();
    if (!newEmail) {
      message.error('Enter your new email address first');
      return;
    }
    setOtpSendLoading(true);
    try {
      const { data } = await adminClient.post('/admin/profile/send-email-change-otp', { newEmail });
      setEmailCodesSent(true);
      setPendingNewEmail(data.newEmail);
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not send verification codes'));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const onEmailSave = async (values) => {
    if (!emailCodesSent) {
      message.error('Send verification codes to both emails first');
      return;
    }
    await verifyEmailChangeAndPatch({
      verifyOtp: (body) => adminClient.post('/admin/profile/verify-email-change-otp', body),
      patch: (body) => adminClient.patch('/admin/profile/email', body),
      newEmail: values.email,
      currentOtp: values.currentOtp,
      newOtp: values.newOtp,
      setLoading: setEmailLoading,
      onSuccess: (data) => {
        setAdmin(data);
        message.success('Email updated');
        setEmailCodesSent(false);
        setPendingNewEmail('');
        emailForm.setFieldsValue({ email: data.email, currentOtp: '', newOtp: '' });
      },
      onError: (err) => message.error(getErrorMessage(err, 'Update failed')),
    });
  };

  const onPasswordSave = async (values) => {
    await verifyPasswordAndPatch({
      verifyOtp: (body) => adminClient.post('/admin/profile/verify-password-otp', body),
      patch: (body) => adminClient.patch('/admin/profile/password', body),
      otp: values.otp,
      patchBody: {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      },
      setLoading: setPassLoading,
      onSuccess: () => {
        message.success('Password updated');
        passForm.resetFields();
      },
      onError: (err) => message.error(getErrorMessage(err, 'Update failed')),
    });
  };

  const tabItems = [
    {
      key: 'email',
      label: (
        <span className="settings-tab-label">
          <MailOutlined /> Email
        </span>
      ),
      children: (
        <SettingsSection
          icon={<MailOutlined />}
          title="Login email"
          description="You will use this email address to sign in to the admin panel."
          alert={{
            type: 'info',
            message: 'Enter a new email, send codes to both addresses, then enter both codes to save.',
          }}
        >
          <Form form={emailForm} layout="vertical" onFinish={onEmailSave} requiredMark={false} size="large">
            <ProfileEmailChangeFields
              currentEmail={admin?.email}
              onSendCodes={sendEmailChangeCodes}
              sendLoading={otpSendLoading}
              codesSent={emailCodesSent}
              pendingNewEmail={pendingNewEmail}
            />
            <FormFooter loading={emailLoading} label="Save email" />
          </Form>
        </SettingsSection>
      ),
    },
    {
      key: 'password',
      label: (
        <span className="settings-tab-label">
          <SafetyOutlined /> Password
        </span>
      ),
      children: (
        <SettingsSection
          icon={<SafetyOutlined />}
          title="Change password"
          description="Use at least 6 characters. Verify with the code sent to your email before saving."
        >
          <Form form={passForm} layout="vertical" onFinish={onPasswordSave} requiredMark={false} size="large">
            <ProfilePasswordOtpFields
              email={admin?.email}
              onSendOtp={sendPasswordOtp}
              sendLoading={otpSendLoading}
            />
            <Form.Item
              name="currentPassword"
              label="Current password"
              rules={[{ required: true, message: 'Enter your current password' }]}
            >
              <Input.Password placeholder="Current password" />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="newPassword"
                  label="New password"
                  rules={[
                    { required: true, message: 'Enter new password' },
                    { min: 6, message: 'At least 6 characters' },
                  ]}
                >
                  <Input.Password placeholder="New password" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="confirmPassword"
                  label="Confirm new password"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Confirm password' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="Confirm new password" />
                </Form.Item>
              </Col>
            </Row>
            <FormFooter loading={passLoading} label="Update password" />
          </Form>
        </SettingsSection>
      ),
    },
  ];

  return (
    <div className="settings-page">
      <PageHeader
        title="Admin Profile"
        subtitle="Manage your administrator login credentials"
      />

      <div className="settings-profile-banner">
        <Avatar size={64} icon={<SafetyCertificateOutlined />} className="settings-profile-avatar admin-avatar" />
        <div className="settings-profile-info">
          <Typography.Title level={4} className="settings-profile-name">
            {admin?.displayName || 'System Admin'}
          </Typography.Title>
          <Typography.Text className="settings-profile-email">{admin?.email}</Typography.Text>
        </div>
        <div className="settings-profile-badges">
          <span className="settings-badge settings-badge--team">
            <SafetyCertificateOutlined /> Platform administrator
          </span>
        </div>
      </div>

      <div className="settings-layout">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          className="settings-tabs"
          tabPosition="top"
          size="large"
        />
      </div>
    </div>
  );
}
