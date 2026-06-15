import { useEffect, useState } from 'react';
import { Form, Input, Button, message, Typography, Row, Col, Avatar, Tabs } from 'antd';
import { MailOutlined, SafetyOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import adminClient from '../api/adminClient';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getErrorMessage } from '../utils/errors';
import ProfileOtpFields, { verifyAndPatch } from '../components/ProfileOtpFields';
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
  const [activeTab, setActiveTab] = useState('email');
  const [emailForm] = Form.useForm();
  const [passForm] = Form.useForm();

  useEffect(() => {
    if (admin) {
      emailForm.setFieldsValue({ email: admin.email });
    }
  }, [admin, emailForm]);

  const sendProfileOtp = async () => {
    setOtpSendLoading(true);
    try {
      const { data } = await adminClient.post('/admin/profile/send-otp');
      message.success(data.message);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not send verification code'));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const onEmailSave = async (values) => {
    await verifyAndPatch({
      verifyOtp: (body) => adminClient.post('/admin/profile/verify-otp', body),
      patch: (body) => adminClient.patch('/admin/profile/email', body),
      otp: values.otp,
      patchBody: { email: values.email?.trim() },
      setLoading: setEmailLoading,
      onSuccess: (data) => {
        setAdmin(data);
        message.success('Email updated');
        emailForm.setFieldsValue({ email: data.email, otp: '' });
      },
      onError: (err) => message.error(getErrorMessage(err, 'Update failed')),
    });
  };

  const onPasswordSave = async (values) => {
    await verifyAndPatch({
      verifyOtp: (body) => adminClient.post('/admin/profile/verify-otp', body),
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
            message: 'Send a verification code to your current email, then save your new address.',
          }}
        >
          <Form form={emailForm} layout="vertical" onFinish={onEmailSave} requiredMark={false} size="large">
            <ProfileOtpFields
              email={admin?.email}
              onSendOtp={sendProfileOtp}
              sendLoading={otpSendLoading}
            />
            <Form.Item
              name="email"
              label="Email address"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input placeholder="admin@example.com" />
            </Form.Item>
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
            <ProfileOtpFields
              email={admin?.email}
              onSendOtp={sendProfileOtp}
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
