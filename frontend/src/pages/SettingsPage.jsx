import { useState, useEffect } from 'react';
import { Form, Input, Button, message, Typography, Row, Col, Avatar, Tabs } from 'antd';
import {
  TeamOutlined,
  MailOutlined,
  SafetyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
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
      <Button type="primary" htmlType="submit" loading={loading} size="large">
        {label}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, setSessionUser } = useAuth();
  const [teamLoading, setTeamLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [otpSendLoading, setOtpSendLoading] = useState(false);
  const [emailCodesSent, setEmailCodesSent] = useState(false);
  const [pendingNewEmail, setPendingNewEmail] = useState('');
  const [activeTab, setActiveTab] = useState('team');
  const [teamForm] = Form.useForm();
  const [emailForm] = Form.useForm();
  const [passForm] = Form.useForm();

  useEffect(() => {
    if (user) {
      teamForm.setFieldsValue({ tenantName: user.tenantName });
    }
  }, [user, teamForm]);

  const onTeamSave = async (values) => {
    setTeamLoading(true);
    try {
      const { data } = await client.patch('/settings/team', {
        tenantName: values.tenantName,
      });
      setSessionUser(data);
      message.success('Team name updated');
      teamForm.setFieldsValue({ tenantName: data.tenantName });
    } catch (err) {
      message.error(getErrorMessage(err, 'Update failed'));
    } finally {
      setTeamLoading(false);
    }
  };

  const sendPasswordOtp = async () => {
    setOtpSendLoading(true);
    try {
      const { data } = await client.post('/settings/send-password-otp');
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
      const { data } = await client.post('/settings/send-email-change-otp', { newEmail });
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
      verifyOtp: (body) => client.post('/settings/verify-email-change-otp', body),
      patch: (body) => client.patch('/settings/email', body),
      newEmail: values.email,
      currentOtp: values.currentOtp,
      newOtp: values.newOtp,
      setLoading: setEmailLoading,
      onSuccess: (data) => {
        setSessionUser(data);
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
      verifyOtp: (body) => client.post('/settings/verify-password-otp', body),
      patch: (body) => client.patch('/settings/password', body),
      otp: values.otp,
      patchBody: {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
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
      key: 'team',
      label: (
        <span className="settings-tab-label">
          <TeamOutlined /> Team
        </span>
      ),
      children: (
        <SettingsSection
          icon={<TeamOutlined />}
          title="Team name"
          description="This name appears in the header and identifies your workspace."
        >
          <Form form={teamForm} layout="vertical" onFinish={onTeamSave} requiredMark={false} size="large">
            <Form.Item
              name="tenantName"
              label="Team name"
              rules={[{ required: true, message: 'Enter team name' }]}
            >
              <Input placeholder="My IPO Team" />
            </Form.Item>
            <FormFooter loading={teamLoading} label="Save team name" />
          </Form>
        </SettingsSection>
      ),
    },
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
          description="You will use this email address to sign in."
          alert={{
            type: 'info',
            message: 'Enter a new email, send codes to both addresses, then enter both codes to save.',
          }}
        >
          <Form form={emailForm} layout="vertical" onFinish={onEmailSave} requiredMark={false} size="large">
            <ProfileEmailChangeFields
              currentEmail={user?.email}
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
              email={user?.email}
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
        title="Account Settings"
        subtitle="Manage your team profile and login credentials"
      />

      <div className="settings-profile-banner">
        <Avatar size={64} icon={<UserOutlined />} className="settings-profile-avatar" />
        <div className="settings-profile-info">
          <Typography.Title level={4} className="settings-profile-name">
            {user?.tenantName || 'My Team'}
          </Typography.Title>
          <Typography.Text className="settings-profile-email">{user?.email}</Typography.Text>
        </div>
        <div className="settings-profile-badges">
          <span className="settings-badge settings-badge--team">
            <TeamOutlined /> Team owner
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
