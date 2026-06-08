import { useEffect, useState } from 'react';
import { Row, Col, Typography, Spin } from 'antd';
import { TeamOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import adminClient from '../api/adminClient';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminClient
      .get('/admin/dashboard')
      .then((r) => setStats(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const t = stats?.tenants || {};

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Overview of all manager teams and registration requests"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Pending Approvals"
            value={t.pendingCount ?? 0}
            icon={<ClockCircleOutlined />}
            variant="warning"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Approved Teams"
            value={t.approvedCount ?? 0}
            icon={<CheckCircleOutlined />}
            variant="success"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Rejected"
            value={t.rejectedCount ?? 0}
            icon={<CloseCircleOutlined />}
            variant="danger"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Disabled"
            value={t.disabledCount ?? 0}
            icon={<CloseCircleOutlined />}
            variant="danger"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Managers"
            value={stats?.totalManagers ?? 0}
            icon={<TeamOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Members"
            value={stats?.totalMembers ?? 0}
            icon={<UserOutlined />}
            variant="primary"
          />
        </Col>
      </Row>
      <div style={{ marginTop: 24 }}>
      <ContentCard title="Quick Actions">
        <Typography.Paragraph>
          New manager registrations require your approval before they can access the system.
          {(t.pendingCount ?? 0) > 0 ? (
            <>
              {' '}You have <strong>{t.pendingCount}</strong> pending request{(t.pendingCount ?? 0) !== 1 ? 's' : ''}.{' '}
              <Link to="/admin/registrations?status=PENDING">Review now</Link>
            </>
          ) : (
            ' No pending requests at the moment.'
          )}
        </Typography.Paragraph>
      </ContentCard>
      </div>
    </div>
  );
}
