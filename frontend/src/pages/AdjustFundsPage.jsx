import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Col, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import { ArrowLeftOutlined, SwapOutlined, SendOutlined, DownloadOutlined, ClockCircleOutlined, FundOutlined } from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import {
  categoryCompactOptionsForIpo,
  getLotAmountForCategory,
} from '../utils/ipoCategories';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import StatCard from '../components/StatCard';

export default function AdjustFundsPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [targetIpo, setTargetIpo] = useState(null);
  const [sources, setSources] = useState([]);
  const [fromIpoId, setFromIpoId] = useState(
    searchParams.get('fromIpoId') ? Number(searchParams.get('fromIpoId')) : null
  );
  const [category, setCategory] = useState('RII');
  const [preview, setPreview] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [providerBalance, setProviderBalance] = useState(0);
  const [payAccountId, setPayAccountId] = useState(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [ipoRes, sourcesRes, walletRes] = await Promise.all([
        client.get(`/ipos/${id}`),
        client.get(`/ipos/${id}/adjust-sources`),
        client.get('/wallet').catch(() => ({ data: {} })),
      ]);
      setTargetIpo(ipoRes.data);
      setSources(sourcesRes.data || []);
      if (!ipoAllowsCategory(ipoRes.data, 'RII')) setCategory('HNI');
      const accts = (walletRes.data?.accounts || []).filter((a) => a.purpose !== 'MANAGER');
      setBankAccounts(accts);
      setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
      if (accts.length === 1) setPayAccountId(accts[0].id);
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to load adjust page'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadPreview = useCallback(
    async (sourceId, cat = category, applicationIds) => {
      if (!sourceId) {
        setPreview(null);
        setSelectedIds([]);
        return;
      }
      setPreviewLoading(true);
      try {
        const params = { fromIpoId: sourceId, investorCategory: cat };
        if (applicationIds?.length) {
          params.applicationIds = applicationIds.join(',');
        }
        const { data } = await client.get(`/ipos/${id}/adjust-preview`, { params });
        setPreview(data);
        const eligibleIds = (data.rows || []).filter((r) => r.eligible).map((r) => r.applicationId);
        if (!applicationIds?.length) {
          setSelectedIds(eligibleIds);
        } else {
          setSelectedIds(applicationIds.filter((aid) => eligibleIds.includes(aid)));
        }
      } catch (err) {
        message.error(getErrorMessage(err, 'Failed to load preview'));
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [id, category]
  );

  useEffect(() => {
    if (fromIpoId) loadPreview(fromIpoId, category);
  }, [fromIpoId, category, loadPreview]);

  const selectedPreview = useMemo(() => {
    if (!preview) return null;
    const selectedSet = new Set(selectedIds);
    const selectedRows = (preview.rows || []).filter(
      (r) => r.eligible && selectedSet.has(r.applicationId)
    );

    const unadjusted = [];
    const seen = new Set();
    const pushUnadjusted = (u) => {
      if (seen.has(u.applicationId)) return;
      seen.add(u.applicationId);
      unadjusted.push(u);
    };

    for (const u of preview.unadjustedPending || []) {
      if (u.allotmentStatus === 'PENDING') pushUnadjusted(u);
      else if (!selectedSet.has(u.applicationId)) pushUnadjusted(u);
    }
    for (const r of preview.rows || []) {
      if (r.eligible && !selectedSet.has(r.applicationId)) {
        pushUnadjusted({
          applicationId: r.applicationId,
          memberName: r.memberName,
          allotmentStatus: r.allotmentStatus,
          remainder: r.remainder,
          toCollect: r.remainder,
          reason: 'Not selected for adjust — full amount to collect',
          groupName: r.groupName,
        });
      } else if (!r.eligible && r.remainder > 0 && !selectedSet.has(r.applicationId)) {
        pushUnadjusted({
          applicationId: r.applicationId,
          memberName: r.memberName,
          allotmentStatus: r.allotmentStatus,
          remainder: r.remainder,
          toCollect: r.remainder,
          reason: r.blockedReason || 'Not adjusted — full amount to collect',
          groupName: r.groupName,
        });
      }
    }

    const totalToSend = selectedRows.reduce((s, r) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s, r) => s + Number(r.toCollect || 0), 0);
    const totalAdjust = selectedRows.reduce((s, r) => s + Number(r.adjustAmount || 0), 0);
    const totalNewApps = selectedRows.reduce((s, r) => s + Number(r.newAppAmount || 0), 0);
    const unadjustedToCollect = unadjusted.reduce((s, r) => s + Number(r.toCollect || 0), 0);

    const groupMap = new Map();
    const individuals = [];
    for (const row of selectedRows) {
      if (row.groupId == null) {
        individuals.push(row);
        continue;
      }
      if (!groupMap.has(row.groupId)) {
        groupMap.set(row.groupId, {
          groupId: row.groupId,
          groupName: row.groupName || `Group #${row.groupId}`,
          members: [],
          totalAdjust: 0,
          totalToSend: 0,
          totalToCollect: 0,
        });
      }
      const g = groupMap.get(row.groupId);
      g.members.push(row);
      g.totalAdjust += Number(row.adjustAmount || 0);
      g.totalToSend += Number(row.toSend || 0);
      g.totalToCollect += Number(row.toCollect || 0);
    }

    return {
      selectedRows,
      groups: [...groupMap.values()],
      individuals,
      unadjusted,
      totals: {
        totalAdjust,
        totalNewApps,
        totalToSend,
        totalToCollect,
        unadjustedToCollect,
        grandToCollect: totalToCollect + unadjustedToCollect,
      },
    };
  }, [preview, selectedIds]);

  const onSubmit = async () => {
    if (!fromIpoId) {
      message.warning('Select a source IPO');
      return;
    }
    if (!selectedIds.length) {
      message.warning('Select at least one member to adjust');
      return;
    }
    const toSend = Number(selectedPreview?.totals?.totalToSend || 0);
    if (toSend > 0.001) {
      if (!bankAccounts.length) {
        message.error('Add a provider wallet account before adjusting top-ups');
        return;
      }
      if (bankAccounts.length > 1 && !payAccountId) {
        message.warning('Select provider wallet account for the top-up debit');
        return;
      }
      const acc = bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id));
      if (acc && Number(acc.balance) < toSend) {
        message.error(
          `Insufficient provider wallet (${acc.label}). Need ${formatCurrency(toSend)}, available ${formatCurrency(acc.balance)}`
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const body = {
        fromIpoId,
        applicationIds: selectedIds,
        investorCategory: category,
      };
      if (toSend > 0.001) {
        body.bankAccountId = payAccountId || bankAccounts[0]?.id;
      }
      const { data } = await client.post(`/ipos/${id}/adjust-from`, body);
      const parts = [
        `Adjusted ${data.count} member(s)`,
        `rolled ${formatCurrency(data.totalAdjusted)}`,
      ];
      if (data.providerDebited > 0) {
        parts.push(`provider debited ${formatCurrency(data.providerDebited)}`);
      } else if (data.totalToSend > 0) {
        parts.push(`to send ${formatCurrency(data.totalToSend)}`);
      }
      if (data.totalToCollect > 0 || data.totalPendingCollect > 0) {
        parts.push(
          `to collect ${formatCurrency(data.totalToCollect ?? data.totalPendingCollect)}`
        );
      }
      message.success(parts.join(' · '));
      navigate(`/ipos/${id}`);
    } catch (err) {
      message.error(getErrorMessage(err, 'Adjust failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading />;
  if (!targetIpo) {
    return (
      <ContentCard>
        <Typography.Text type="danger">IPO not found</Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Link to="/ipos">Back to IPOs</Link>
        </div>
      </ContentCard>
    );
  }

  const lot = getLotAmountForCategory(targetIpo, category);

  return (
    <div>
      <PageHeader
        title={
          <Space>
            <SwapOutlined />
            Adjust funds → {targetIpo.name}
          </Space>
        }
        subtitle={
          <>
            New lot ({category}): {lot != null ? formatCurrency(lot) : '—'}
            {' · '}
            Top-up debits provider wallet · group leader follows paid-to
          </>
        }
        extra={
          <>
            <Button onClick={() => navigate('/adjust-combine')}>Combine adjust</Button>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/ipos/${id}`)}>
              Back to IPO
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!selectedIds.length || previewLoading}
              onClick={onSubmit}
            >
              Confirm adjust ({selectedIds.length})
            </Button>
          </>
        }
      />

      <ContentCard title="Source & category" padded style={{ marginBottom: 16 }}>
        <Space wrap align="start" size="large">
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              From (old IPO)
            </Typography.Text>
            <Select
              style={{ minWidth: 280, maxWidth: '100%' }}
              placeholder="Select previous IPO"
              value={fromIpoId}
              options={(sources || []).map((s) => ({
                value: s.id,
                label: `${s.name} (${s.adjustable_count} · ${formatCurrency(s.adjustable_principal)})`,
              }))}
              onChange={(val) => setFromIpoId(val)}
              allowClear
              onClear={() => {
                setFromIpoId(null);
                setPreview(null);
                setSelectedIds([]);
              }}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Category on {targetIpo.name}
            </Typography.Text>
            <Select
              style={{ minWidth: 120 }}
              value={category}
              options={categoryCompactOptionsForIpo(targetIpo)}
              onChange={setCategory}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Provider wallet (top-up)
            </Typography.Text>
            <Select
              style={{ minWidth: 220 }}
              allowClear={bankAccounts.length > 1}
              placeholder={bankAccounts.length ? 'Select account' : 'No provider account'}
              value={payAccountId}
              onChange={setPayAccountId}
              options={bankAccounts.map((a) => ({
                value: a.id,
                label: `${a.label} · ${formatCurrency(a.balance)}`,
              }))}
            />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              Available {formatCurrency(providerBalance)}
            </Typography.Text>
          </div>
        </Space>
        {!sources.length && (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="No previous IPOs with not-allotted / not-applied unsettled funds"
          />
        )}
      </ContentCard>

      {selectedPreview && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="To send"
                value={formatCurrency(selectedPreview.totals.totalToSend)}
                icon={<SendOutlined />}
                variant="danger"
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="To collect"
                value={formatCurrency(selectedPreview.totals.totalToCollect)}
                icon={<DownloadOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Not adjusted"
                value={formatCurrency(selectedPreview.totals.unadjustedToCollect)}
                icon={<ClockCircleOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Total to collect"
                value={formatCurrency(selectedPreview.totals.grandToCollect)}
                icon={<FundOutlined />}
                variant="primary"
              />
            </Col>
          </Row>

          <Alert
            style={{ marginBottom: 16 }}
            type="info"
            showIcon
            message="How this works"
            description={
              <>
                <div>
                  <strong>Old ≤ new</strong> (e.g. ₹14,807 → ₹14,936): roll old fund, mark old as Received,
                  show shortfall under <em>To send</em> — send manually (no wallet).
                </div>
                <div>
                  <strong>Old &gt; new</strong>: roll new lot, leftover under <em>To collect</em> on old IPO.
                </div>
                <div>
                  Members not adjusted (or still allotment Pending): <em>full amount to collect</em>.
                </div>
              </>
            }
          />

          <ContentCard
            title={`Members to adjust (${selectedPreview.selectedRows.length})`}
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button
                  size="small"
                  onClick={() =>
                    setSelectedIds(
                      (preview.rows || []).filter((r) => r.eligible).map((r) => r.applicationId)
                    )
                  }
                >
                  Select all eligible
                </Button>
                <Button size="small" onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </Space>
            }
          >
            <Table
              size="small"
              rowKey="applicationId"
              loading={previewLoading}
              dataSource={preview.rows || []}
              pagination={false}
              scroll={{ x: 900 }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys),
                getCheckboxProps: (record) => ({ disabled: !record.eligible }),
              }}
              columns={[
                {
                  title: 'Member',
                  dataIndex: 'memberName',
                  render: (v, r) => (
                    <span>
                      {v}
                      {r.groupName && (
                        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                          {r.groupName}
                        </Typography.Text>
                      )}
                      {!r.eligible && (
                        <Typography.Text type="danger" style={{ display: 'block', fontSize: 12 }}>
                          {r.blockedReason}
                        </Typography.Text>
                      )}
                    </span>
                  ),
                },
                {
                  title: 'Old remaining',
                  dataIndex: 'remainder',
                  align: 'right',
                  width: 120,
                  render: (v) => formatCurrency(v),
                },
                {
                  title: 'New lot',
                  dataIndex: 'newLot',
                  align: 'right',
                  width: 110,
                  render: (v) => (v != null ? formatCurrency(v) : '—'),
                },
                {
                  title: 'Roll from old',
                  dataIndex: 'adjustAmount',
                  align: 'right',
                  width: 120,
                  render: (v) => (v != null ? formatCurrency(v) : '—'),
                },
                {
                  title: 'To send',
                  dataIndex: 'toSend',
                  align: 'right',
                  width: 110,
                  render: (v) =>
                    v > 0 ? (
                      <Typography.Text type="danger" strong>
                        {formatCurrency(v)}
                      </Typography.Text>
                    ) : (
                      formatCurrency(0)
                    ),
                },
                {
                  title: 'To collect',
                  dataIndex: 'toCollect',
                  align: 'right',
                  width: 110,
                  render: (v) =>
                    v > 0 ? (
                      <Typography.Text type="warning" strong>
                        {formatCurrency(v)}
                      </Typography.Text>
                    ) : (
                      formatCurrency(0)
                    ),
                },
                {
                  title: 'Old status after',
                  width: 130,
                  render: (_, r) =>
                    r.eligible ? (
                      r.willMarkOldReceived ? (
                        <Tag color="success">Received</Tag>
                      ) : (
                        <Tag color="orange">Pending {formatCurrency(r.toCollect)}</Tag>
                      )
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </ContentCard>

          {selectedPreview.groups.length > 0 && (
            <ContentCard title="By sub-group" padded style={{ marginBottom: 16 }}>
              {selectedPreview.groups.map((g) => (
                <div key={g.groupId} style={{ marginBottom: 16 }}>
                  <Typography.Title level={5} style={{ marginBottom: 4 }}>
                    {g.groupName}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {g.members.length} members · roll {formatCurrency(g.totalAdjust)} · to send{' '}
                    <Typography.Text type="danger">{formatCurrency(g.totalToSend)}</Typography.Text>
                    {' · '}to collect {formatCurrency(g.totalToCollect)}
                  </Typography.Text>
                  <Table
                    size="small"
                    style={{ marginTop: 8 }}
                    rowKey="applicationId"
                    pagination={false}
                    dataSource={g.members}
                    columns={[
                      { title: 'Member', dataIndex: 'memberName' },
                      {
                        title: 'To send',
                        dataIndex: 'toSend',
                        align: 'right',
                        render: (v) => formatCurrency(v),
                      },
                      {
                        title: 'To collect',
                        dataIndex: 'toCollect',
                        align: 'right',
                        render: (v) => formatCurrency(v),
                      },
                    ]}
                  />
                </div>
              ))}
            </ContentCard>
          )}

          {selectedPreview.individuals.length > 0 && (
            <ContentCard title="Individuals (no sub-group)" style={{ marginBottom: 16 }}>
              <Table
                size="small"
                rowKey="applicationId"
                pagination={false}
                dataSource={selectedPreview.individuals}
                columns={[
                  { title: 'Member', dataIndex: 'memberName' },
                  {
                    title: 'Old remaining',
                    dataIndex: 'remainder',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                  {
                    title: 'To send',
                    dataIndex: 'toSend',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                  {
                    title: 'To collect',
                    dataIndex: 'toCollect',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                ]}
              />
            </ContentCard>
          )}

          {selectedPreview.unadjusted.length > 0 && (
            <ContentCard title="Not adjusted — full amount to collect" style={{ marginBottom: 16 }}>
              <div style={{ padding: '12px 16px 0' }}>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`${formatCurrency(selectedPreview.totals.unadjustedToCollect)} still with members (pending allotment or not selected)`}
                />
              </div>
              <Table
                size="small"
                rowKey="applicationId"
                pagination={false}
                dataSource={selectedPreview.unadjusted}
                columns={[
                  { title: 'Member', dataIndex: 'memberName' },
                  {
                    title: 'Group',
                    dataIndex: 'groupName',
                    render: (v) => v || '—',
                  },
                  {
                    title: 'Status',
                    dataIndex: 'allotmentStatus',
                    width: 120,
                    render: (v) => v || '—',
                  },
                  {
                    title: 'To collect (full)',
                    dataIndex: 'toCollect',
                    align: 'right',
                    render: (v) => (
                      <Typography.Text strong>{formatCurrency(v)}</Typography.Text>
                    ),
                  },
                  {
                    title: 'Reason',
                    dataIndex: 'reason',
                    render: (v) => (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {v}
                      </Typography.Text>
                    ),
                  },
                ]}
              />
            </ContentCard>
          )}

          <div style={{ marginBottom: 32 }}>
            <Button
              type="primary"
              size="large"
              loading={submitting}
              disabled={!selectedIds.length}
              onClick={onSubmit}
              icon={<SwapOutlined />}
            >
              Confirm adjust ({selectedIds.length})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ipoAllowsCategory(ipo, cat) {
  try {
    return categoryCompactOptionsForIpo(ipo).some((o) => o.value === cat);
  } catch {
    return cat === 'RII';
  }
}
