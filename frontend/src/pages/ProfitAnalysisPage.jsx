import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Modal, Row, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import {
  ApartmentOutlined,
  BankOutlined,
  DownloadOutlined,
  EyeOutlined,
  PercentageOutlined,
  RiseOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import {
  createProfitAnalysisPdfPreviewUrl,
  downloadProfitAnalysisPdf,
} from '../utils/profitAnalysisPdf';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

function yearOptions() {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current; y >= current - 10; y -= 1) {
    years.push({ value: y, label: String(y) });
  }
  return years;
}

function renderAmt(v) {
  return <span className={pnlClassName(v)}>{formatCurrency(v)}</span>;
}

export default function ProfitAnalysisPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('revenue');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [year, setYear] = useState(null);
  const [months, setMonths] = useState([]);

  const yearOpts = useMemo(() => yearOptions(), []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (year) {
      params.year = year;
      if (months.length) params.months = months.join(',');
    }
    client
      .get('/profit-shares/analysis', { params })
      .then((r) => setData(r.data))
      .catch((err) => message.error(getErrorMessage(err, 'Could not load analysis')))
      .finally(() => setLoading(false));
  }, [year, months]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pdfMeta = () => ({
    teamName: user?.tenantName || 'IPO Team',
    generatedAt: new Date().toISOString(),
  });

  const downloadPdf = () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      downloadProfitAnalysisPdf(data, pdfMeta());
      message.success('Profit analysis PDF downloaded');
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not generate PDF'));
    } finally {
      setPdfLoading(false);
    }
  };

  const previewPdf = () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const { url, fileName } = createProfitAnalysisPdfPreviewUrl(data, pdfMeta());
      setPreviewUrl(url);
      setPreviewFileName(fileName);
      setPreviewOpen(true);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not preview PDF'));
    } finally {
      setPdfLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  if (loading && !data) return <PageLoading />;

  const revenue = data?.revenue || {};
  const manager = data?.manager || {};
  const overall = data?.overall || {};
  const reportScope = data?.reportScope || {};
  const applicationCount = Number(
    reportScope.applicationCount ?? overall.applicationCount ?? revenue.applicationCount ?? 0
  );
  const profitApps = Number(reportScope.profitApps ?? overall.profitApps ?? 0);
  const iposApplied = Number(reportScope.iposApplied ?? overall.iposApplied ?? 0);
  const iposProfit = Number(reportScope.iposProfit ?? overall.iposProfit ?? 0);
  const appsLabel =
    reportScope.applicationsLabel
    || (applicationCount === 1 ? '1 application' : `${applicationCount} applications`);
  const iposAppliedLabel =
    reportScope.iposAppliedLabel
    || (iposApplied === 1 ? '1 IPO applied' : `${iposApplied} IPOs applied`);
  const iposProfitLabel =
    reportScope.iposProfitLabel
    || (iposProfit === 1 ? '1 IPO gave profit' : `${iposProfit} IPOs gave profit`);
  const periodLabel =
    reportScope.filters?.label
    || reportScope.periodLabel
    || 'All time';

  const memberCols = [
    {
      title: 'Member',
      dataIndex: 'displayName',
      fixed: 'left',
      render: (v, r) => (
        <span style={{ fontWeight: 500 }}>
          {v}
          {r.isGroupLeader ? <Tag color="blue" style={{ marginLeft: 8 }}>Leader</Tag> : null}
        </span>
      ),
    },
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
    {
      title: 'Sub-group',
      dataIndex: 'memberGroupName',
      render: (v) => (v ? <Tag>{v}</Tag> : '—'),
    },
    { title: 'Gross IPO P&L', dataIndex: 'grossIpoPnL', render: renderAmt },
    { title: 'Member keeps', dataIndex: 'memberShare', render: renderAmt },
    { title: 'Manager got', dataIndex: 'managerShare', render: renderAmt },
    { title: 'Provider got', dataIndex: 'providerShare', render: renderAmt },
    {
      title: 'Pending split',
      dataIndex: 'pendingGross',
      render: (v) => (Number(v) ? renderAmt(v) : '—'),
    },
  ];

  const providerCols = [
    { title: 'Provider', dataIndex: 'providerName', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Total share', dataIndex: 'totalShare', render: renderAmt },
    { title: 'From profit', dataIndex: 'profitShare', render: renderAmt },
    { title: 'From loss', dataIndex: 'lossShare', render: renderAmt },
    { title: 'Splits', dataIndex: 'distributionCount' },
  ];

  const segmentCols = [
    { title: 'Type', dataIndex: 'label' },
    { title: 'Gross split', dataIndex: 'grossDistributed', render: renderAmt },
    { title: 'Member', dataIndex: 'memberShare', render: renderAmt },
    { title: 'Manager', dataIndex: 'managerShare', render: renderAmt },
    { title: 'Provider', dataIndex: 'providerShare', render: renderAmt },
    { title: 'Splits', dataIndex: 'distributionCount' },
  ];

  const subGroupMemberCols = [
    {
      title: 'Member',
      dataIndex: 'displayName',
      render: (v, r) => (
        <span style={{ fontWeight: r.isLeader ? 600 : 400 }}>
          {v}
          {r.isLeader ? <Tag color="blue" style={{ marginLeft: 8 }}>Leader</Tag> : null}
        </span>
      ),
    },
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
    { title: 'Gross IPO P&L', dataIndex: 'grossIpoPnL', render: renderAmt },
    { title: 'Member profit', dataIndex: 'memberShare', render: renderAmt },
    { title: 'Manager share', dataIndex: 'managerShare', render: renderAmt },
    { title: 'Provider share', dataIndex: 'providerShare', render: renderAmt },
  ];

  return (
    <div>
      <PageHeader
        title="Profit Analysis"
        subtitle={`${periodLabel} · ${iposAppliedLabel} · ${iposProfitLabel}`}
        extra={(
          <Space wrap>
            <Select
              allowClear
              placeholder="Year"
              style={{ width: 110 }}
              options={yearOpts}
              value={year}
              onChange={(v) => {
                setYear(v ?? null);
                if (!v) setMonths([]);
              }}
            />
            <Select
              mode="multiple"
              allowClear
              disabled={!year}
              placeholder={year ? 'Months' : 'Select year first'}
              style={{ minWidth: 180 }}
              maxTagCount="responsive"
              options={MONTH_OPTIONS}
              value={months}
              onChange={(v) => setMonths(v || [])}
            />
            <Button icon={<EyeOutlined />} loading={pdfLoading} onClick={previewPdf}>
              Preview report
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} loading={pdfLoading} onClick={downloadPdf}>
              Download PDF
            </Button>
          </Space>
        )}
      />

      <Modal
        title={previewFileName || 'Profit analysis report'}
        open={previewOpen}
        onCancel={closePreview}
        width="95vw"
        style={{ top: 24 }}
        styles={{ body: { padding: 0, height: '80vh' } }}
        footer={[
          <Button key="close" onClick={closePreview}>
            Close
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => {
              downloadPdf();
            }}
          >
            Download PDF
          </Button>,
        ]}
        destroyOnClose
      >
        {previewUrl ? (
          <iframe
            title="Profit analysis PDF preview"
            src={previewUrl}
            style={{ width: '100%', height: '80vh', border: 'none' }}
          />
        ) : null}
      </Modal>

      <ContentCard
        title="Report overview"
        extra={(
          <Typography.Text type="secondary">
            {iposAppliedLabel} · {iposProfitLabel} · {appsLabel} · {profitApps} apps profit
          </Typography.Text>
        )}
        padded
        style={{ marginBottom: 24 }}
        className="profit-analysis-overview"
      >
        <Typography.Text type="secondary" className="profit-analysis-section-label">
          IPOs
        </Typography.Text>
        <div className="profit-analysis-stat-grid">
          <StatCard title="Applied" value={iposApplied} icon={<RiseOutlined />} variant="info" />
          <StatCard title="Gave profit" value={iposProfit} icon={<RiseOutlined />} variant="success" />
          <StatCard title="Active apps" value={applicationCount} icon={<TeamOutlined />} variant="default" />
          <StatCard title="Apps profit" value={profitApps} icon={<RiseOutlined />} variant="success" />
        </div>
        <Typography.Text type="secondary" className="profit-analysis-section-label" style={{ marginTop: 16 }}>
          Revenue split
        </Typography.Text>
        <div className="profit-analysis-stat-grid">
          <StatCard
            title="Gross P&L"
            value={formatCurrency(overall.grossIpoPnL)}
            icon={<PercentageOutlined />}
            variant={Number(overall.grossIpoPnL) >= 0 ? 'success' : 'danger'}
            valueClassName={pnlClassName(overall.grossIpoPnL)}
          />
          <StatCard
            title="Member share"
            value={formatCurrency(revenue.memberShare)}
            icon={<TeamOutlined />}
            variant="default"
            valueClassName={pnlClassName(revenue.memberShare)}
          />
          <StatCard
            title="Manager share"
            value={formatCurrency(revenue.managerShare)}
            icon={<UserOutlined />}
            variant={Number(revenue.managerShare) >= 0 ? 'success' : 'danger'}
            valueClassName={pnlClassName(revenue.managerShare)}
          />
          <StatCard
            title="Provider share"
            value={formatCurrency(revenue.providerShare)}
            icon={<BankOutlined />}
            variant="info"
            valueClassName={pnlClassName(revenue.providerShare)}
          />
        </div>
      </ContentCard>

      <ContentCard
        title="Analysis views"
        extra={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { label: 'Revenue', value: 'revenue' },
              { label: 'Members', value: 'members' },
              { label: 'Sub-groups', value: 'subgroups' },
              { label: 'Providers', value: 'providers' },
              { label: 'Manager', value: 'manager' },
            ]}
          />
        }
        style={{ marginBottom: 24 }}
      >
        {view === 'revenue' && (
          <>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              Split of distributed P&L into who keeps the revenue — members, you (manager), and fund providers.
              Pending amounts are allotted but not yet split.
            </Typography.Paragraph>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} md={8}>
                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Gross split (done)</div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{formatCurrency(revenue.grossDistributed)}</div>
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ padding: 16, background: '#fff7ed', borderRadius: 8 }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Pending to split</div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{formatCurrency(revenue.pendingGross)}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{overall.pendingCount || 0} application(s)</div>
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ padding: 16, background: '#f0fdfa', borderRadius: 8 }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Splits recorded</div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{overall.distributionCount || 0}</div>
                </div>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  <PercentageOutlined /> By IPO segment
                </Typography.Title>
                <Table
                  rowKey="ipoSegment"
                  columns={segmentCols}
                  dataSource={data?.bySegment || []}
                  pagination={false}
                  locale={{ emptyText: 'No splits yet' }}
                  {...tableDefaults}
                />
              </Col>
              <Col xs={24} lg={12}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  By investor category
                </Typography.Title>
                <Table
                  rowKey="investorCategory"
                  columns={segmentCols}
                  dataSource={data?.byCategory || []}
                  pagination={false}
                  locale={{ emptyText: 'No splits yet' }}
                  {...tableDefaults}
                />
              </Col>
            </Row>
          </>
        )}

        {view === 'members' && (
          <Table
            rowKey="memberId"
            columns={memberCols}
            dataSource={data?.members || []}
            scroll={{ x: 1100 }}
            locale={{ emptyText: 'No allotted IPO P&L yet' }}
            {...tableDefaults}
          />
        )}

        {view === 'subgroups' && (
          <>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              Each sub-group leader section lists members with their own profit share. The total row is the sum
              against that leader’s group (profit stays attributed to each member, not transferred to the leader).
            </Typography.Paragraph>
            {(data?.subGroups || []).length === 0 ? (
              <Typography.Text type="secondary">No sub-groups with members yet.</Typography.Text>
            ) : (
              (data?.subGroups || []).map((g) => (
                <ContentCard
                  key={g.groupId}
                  title={
                    <span>
                      <ApartmentOutlined style={{ marginRight: 8 }} />
                      {g.groupName}
                      <Tag style={{ marginLeft: 8 }}>{g.memberCount} members</Tag>
                    </span>
                  }
                  extra={
                    <Typography.Text type="secondary">
                      Leader: <strong>{g.leaderDisplayName || '—'}</strong>
                    </Typography.Text>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                    <Col xs={12} sm={6}>
                      <StatCard
                        title="Group member profit"
                        value={formatCurrency(g.totals.memberShare)}
                        variant="default"
                        valueClassName={pnlClassName(g.totals.memberShare)}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <StatCard
                        title="Gross IPO P&L"
                        value={formatCurrency(g.totals.grossIpoPnL)}
                        variant={g.totals.grossIpoPnL >= 0 ? 'success' : 'danger'}
                        valueClassName={pnlClassName(g.totals.grossIpoPnL)}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <StatCard
                        title="Manager from group"
                        value={formatCurrency(g.totals.managerShare)}
                        variant="info"
                        valueClassName={pnlClassName(g.totals.managerShare)}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <StatCard
                        title="Provider from group"
                        value={formatCurrency(g.totals.providerShare)}
                        variant="info"
                        valueClassName={pnlClassName(g.totals.providerShare)}
                      />
                    </Col>
                  </Row>
                  <Table
                    rowKey="memberId"
                    columns={subGroupMemberCols}
                    dataSource={g.members}
                    pagination={false}
                    scroll={{ x: 900 }}
                    {...tableDefaults}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ fontWeight: 600, background: '#f0fdfa' }}>
                          <Table.Summary.Cell index={0} colSpan={2}>
                            Total vs leader ({g.leaderDisplayName || 'group'})
                          </Table.Summary.Cell>
                          <Table.Summary.Cell>{renderAmt(g.totals.grossIpoPnL)}</Table.Summary.Cell>
                          <Table.Summary.Cell>{renderAmt(g.totals.memberShare)}</Table.Summary.Cell>
                          <Table.Summary.Cell>{renderAmt(g.totals.managerShare)}</Table.Summary.Cell>
                          <Table.Summary.Cell>{renderAmt(g.totals.providerShare)}</Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                </ContentCard>
              ))
            )}
            {(data?.ungroupedMembers || []).length > 0 && (
              <ContentCard title="Members not in a sub-group" style={{ marginTop: 8 }}>
                <Table
                  rowKey="memberId"
                  columns={memberCols.filter((c) => c.dataIndex !== 'memberGroupName')}
                  dataSource={data.ungroupedMembers}
                  scroll={{ x: 1000 }}
                  pagination={false}
                  {...tableDefaults}
                />
              </ContentCard>
            )}
          </>
        )}

        {view === 'providers' && (
          <Table
            rowKey="fundProviderId"
            columns={providerCols}
            dataSource={data?.providers || []}
            locale={{ emptyText: 'No provider shares recorded yet' }}
            {...tableDefaults}
          />
        )}

        {view === 'manager' && (
          <Row gutter={[16, 16]} style={{ maxWidth: 720 }}>
            <Col span={24}>
              <StatCard
                title={`${manager.label || 'Manager'} — total share`}
                value={formatCurrency(manager.totalShare)}
                icon={<UserOutlined />}
                variant={Number(manager.totalShare) >= 0 ? 'success' : 'danger'}
                valueClassName={pnlClassName(manager.totalShare)}
              />
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>From profit splits</div>
                <div className="amount-positive" style={{ fontSize: 20, fontWeight: 600 }}>
                  {formatCurrency(manager.profitShare)}
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>From loss splits</div>
                <div className="amount-negative" style={{ fontSize: 20, fontWeight: 600 }}>
                  {formatCurrency(manager.lossShare)}
                </div>
              </div>
            </Col>
          </Row>
        )}
      </ContentCard>
    </div>
  );
}
