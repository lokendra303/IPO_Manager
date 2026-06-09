import { Link } from 'react-router-dom';
import { Col, Row, Typography } from 'antd';
import {
  TeamOutlined,
  FundOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  BankOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import StatCard from './StatCard';
import ContentCard from './ContentCard';
import { formatCurrency, pnlClassName } from '../utils/format';

export default function IpoSummaryStats({ summary, loading }) {
  if (!summary && !loading) return null;

  const pl = summary?.totalProfitLoss ?? 0;

  return (
    <ContentCard
      title="IPO Summary"
      extra={
        <Link to="/summary">
          <Typography.Text type="secondary">
            <BarChartOutlined /> All IPOs summary
          </Typography.Text>
        </Link>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: summary ? 12 : 0 }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            title="Members"
            value={summary ? summary.applicationCount : '—'}
            icon={<TeamOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            title="Distributed"
            value={summary ? formatCurrency(summary.totalDistributed) : '—'}
            icon={<FundOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            title="Returned"
            value={summary ? formatCurrency(summary.totalReturned) : '—'}
            icon={<FundOutlined />}
            variant="success"
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            title="Pending return"
            value={summary ? formatCurrency(summary.pendingReturn) : '—'}
            icon={<ClockCircleOutlined />}
            variant="warning"
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            title="Gross P&L"
            value={summary ? formatCurrency(pl) : '—'}
            icon={<RiseOutlined />}
            variant={pl >= 0 ? 'success' : 'danger'}
            valueClassName={pnlClassName(pl)}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            title="Manager share"
            value={summary ? formatCurrency(summary.shareManagerTotal) : '—'}
            icon={<BankOutlined />}
            variant="info"
          />
        </Col>
      </Row>
      {summary && (
        <Typography.Text type="secondary">
          Alloted {summary.allottedCount}
          {' · '}
          Not alloted {summary.notAllottedCount}
          {' · '}
          Did not apply {summary.notAppliedCount}
          {' · '}
          Pending allotment {summary.pendingAllotmentCount}
          {' · '}
          Fund returns {summary.returnedCount}/{summary.applicationCount}
          {summary.profitSharedCount > 0 && (
            <>
              {' · '}
              P&L splits {summary.profitSharedCount}
              {' · '}
              Provider {formatCurrency(summary.shareProviderTotal)}
              {' · '}
              Member {formatCurrency(summary.shareMemberTotal)}
            </>
          )}
        </Typography.Text>
      )}
    </ContentCard>
  );
}
