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

  const pl = summary?.totalProfitLoss;
  const plDisplay = pl == null ? '—' : formatCurrency(pl);
  const plVariant = pl == null ? 'info' : pl >= 0 ? 'success' : 'danger';

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
      <Row gutter={[16, 16]} className="ipo-summary-stats" style={{ marginBottom: summary ? 12 : 0 }}>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Members"
            value={summary ? summary.applicationCount : '—'}
            icon={<TeamOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Distributed"
            value={summary ? formatCurrency(summary.totalDistributed) : '—'}
            icon={<FundOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Returned"
            value={summary ? formatCurrency(summary.totalReturned) : '—'}
            icon={<FundOutlined />}
            variant="success"
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Total pending fund"
            value={summary ? formatCurrency(summary.pendingFundTotal ?? summary.pendingReturn) : '—'}
            icon={<ClockCircleOutlined />}
            variant="danger"
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Pending after adjust"
            value={summary ? formatCurrency(summary.pendingAfterAdjust ?? 0) : '—'}
            icon={<ClockCircleOutlined />}
            variant="warning"
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Gross P&L"
            value={summary ? plDisplay : '—'}
            icon={<RiseOutlined />}
            variant={plVariant}
            valueClassName={pl == null ? undefined : pnlClassName(pl)}
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Manager share"
            value={summary ? formatCurrency(summary.shareManagerTotal) : '—'}
            icon={<BankOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={12} sm={8} lg={8}>
          <StatCard
            title="Provider share"
            value={summary ? formatCurrency(summary.shareProviderTotal) : '—'}
            icon={<FundOutlined />}
            variant="primary"
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
          {Number(summary.pendingFundTotal) > 0 && (
            <>
              {' · '}
              Total pending {formatCurrency(summary.pendingFundTotal)}
            </>
          )}
          {Number(summary.pendingAfterAdjust) > 0 && (
            <>
              {' · '}
              After adjust {formatCurrency(summary.pendingAfterAdjust)}
            </>
          )}
          {summary.profitSharedCount > 0 && (
            <>
              {' · '}
              P&L splits {summary.profitSharedCount}
              {' · '}
              Member {formatCurrency(summary.shareMemberTotal)}
            </>
          )}
        </Typography.Text>
      )}
    </ContentCard>
  );
}
