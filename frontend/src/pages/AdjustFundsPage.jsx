import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Col, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import { ArrowLeftOutlined, SwapOutlined, SendOutlined, DownloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
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
          reason: 'Not selected — leftover stays on the old IPO',
          groupName: r.groupName,
        });
      } else if (!r.eligible && r.remainder > 0 && !selectedSet.has(r.applicationId)) {
        pushUnadjusted({
          applicationId: r.applicationId,
          memberName: r.memberName,
          allotmentStatus: r.allotmentStatus,
          remainder: r.remainder,
          toCollect: r.remainder,
          reason: r.blockedReason || 'Cannot reuse — leftover stays on the old IPO',
          groupName: r.groupName,
        });
      }
    }

    const totalToSend = selectedRows.reduce((s, r) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s, r) => s + Number(r.toCollect || 0), 0);
    const totalAdjust = selectedRows.reduce((s, r) => s + Number(r.adjustAmount || 0), 0);
    const totalNewApps = selectedRows.reduce((s, r) => s + Number(r.newAppAmount || 0), 0);
    const unadjustedToCollect = unadjusted.reduce((s, r) => s + Number(r.toCollect || 0), 0);

    return {
      selectedRows,
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
      message.warning('Select the old IPO first');
      return;
    }
    if (!selectedIds.length) {
      message.warning('Select at least one member');
      return;
    }
    const toSend = Number(selectedPreview?.totals?.totalToSend || 0);
    const walletCredit = Number(selectedPreview?.totals?.totalWalletCredit || 0);
    if (toSend > 0.001 || walletCredit > 0.001) {
      if (!bankAccounts.length) {
        message.error('Add a provider wallet account before reusing leftover');
        return;
      }
      if (bankAccounts.length > 1 && !payAccountId) {
        message.warning('Select provider wallet account');
        return;
      }
      const acc = bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id));
      if (toSend > 0.001 && acc && Number(acc.balance) < toSend) {
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
      if (toSend > 0.001 || walletCredit > 0.001) {
        body.bankAccountId = payAccountId || bankAccounts[0]?.id;
      }
      const { data } = await client.post(`/ipos/${id}/adjust-from`, body);
      const parts = [`Moved leftover for ${data.count} member(s)`];
      if (data.totalAdjusted > 0) {
        parts.push(`${formatCurrency(data.totalAdjusted)} onto this IPO`);
      }
      if (data.providerDebited > 0) {
        parts.push(`provider wallet −${formatCurrency(data.providerDebited)}`);
      }
      if (data.providerCredited > 0) {
        parts.push(`provider wallet +${formatCurrency(data.providerCredited)}`);
      }
      const leftover = Number(data.totalToCollect ?? data.totalPendingCollect ?? 0);
      if (leftover > 0.001) {
        parts.push(`still collect ${formatCurrency(leftover)} on the old IPO`);
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
            Reuse leftover funds
          </Space>
        }
        subtitle={`Move not-allotted money from an old IPO onto ${targetIpo.name}. Extra needed comes from the provider wallet. Extra left on the old IPO is collected later.`}
        extra={
          <>
            <Button onClick={() => navigate('/adjust-combine')}>Several IPOs</Button>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/ipos/${id}`)}>
              Back to IPO
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!selectedIds.length || previewLoading}
              onClick={onSubmit}
            >
              Reuse leftover ({selectedIds.length})
            </Button>
          </>
        }
      />

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="How leftover reuse works"
        description={
          <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>Pick the old IPO that still has leftover with members — even small amounts like ₹180 or ₹48.</li>
            <li>We apply that leftover to this new IPO’s lot. Several leftovers for the same member can be added together.</li>
            <li>
              If the new lot is bigger, extra comes from the <strong>provider wallet</strong>.
              If the member is already on this IPO, leftover is added to that application and the wallet is credited.
            </li>
          </ol>
        }
      />

      <ContentCard title="1. Choose old IPO" padded style={{ marginBottom: 16 }}>
        <Space wrap align="start" size="large">
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Old IPO (money still with members)
            </Typography.Text>
            <Select
              style={{ minWidth: 320, maxWidth: '100%' }}
              placeholder="Select old IPO"
              value={fromIpoId}
              options={(sources || []).map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.adjustable_count} member${s.adjustable_count === 1 ? '' : 's'} · ${formatCurrency(s.adjustable_principal)} leftover`,
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
              New lot on {targetIpo.name}
            </Typography.Text>
            <Select
              style={{ minWidth: 160 }}
              value={category}
              options={categoryCompactOptionsForIpo(targetIpo)}
              onChange={setCategory}
            />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              {lot != null ? formatCurrency(lot) : '—'} per member
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Provider wallet (if extra is needed)
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
            message="No old IPOs with leftover not-allotted money to reuse"
          />
        )}
      </ContentCard>

      {selectedPreview && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <StatCard
                title="From provider wallet"
                value={formatCurrency(selectedPreview.totals.totalToSend)}
                icon={<SendOutlined />}
                variant="danger"
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard
                title="Leftover on old IPO"
                value={formatCurrency(selectedPreview.totals.totalToCollect)}
                icon={<DownloadOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard
                title="Not reused"
                value={formatCurrency(selectedPreview.totals.unadjustedToCollect)}
                icon={<ClockCircleOutlined />}
                variant="warning"
              />
            </Col>
          </Row>

          {selectedPreview.totals.totalToSend > providerBalance + 0.001 && (
            <Alert
              style={{ marginBottom: 16 }}
              type="error"
              showIcon
              message={`Provider wallet is short by ${formatCurrency(selectedPreview.totals.totalToSend - providerBalance)}`}
            />
          )}

          <ContentCard
            title="2. Review members"
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
                  Select all
                </Button>
                <Button size="small" onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </Space>
            }
          >
            <div className="combine-adjust-table-wrap">
            <Table
              className="pro-table combine-adjust-table"
              size="small"
              rowKey="applicationId"
              loading={previewLoading}
              dataSource={preview.rows || []}
              pagination={false}
              scroll={{ x: 980 }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys),
                getCheckboxProps: (record) => ({ disabled: !record.eligible }),
                columnWidth: 48,
                fixed: true,
              }}
              columns={[
                {
                  title: 'Member',
                  dataIndex: 'memberName',
                  width: 200,
                  fixed: 'left',
                  render: (v, r) => (
                    <div className="combine-adjust-member">
                      <Typography.Text
                        ellipsis={{ tooltip: v }}
                        className="combine-adjust-member-name"
                      >
                        {v}
                      </Typography.Text>
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
                      {r.ontoExisting && r.eligible && (
                        <Tag color="cyan" style={{ marginTop: 4 }}>Adds to existing application</Tag>
                      )}
                    </div>
                  ),
                },
                {
                  title: 'With member now',
                  dataIndex: 'remainder',
                  align: 'right',
                  width: 130,
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
                  title: 'Moved to new IPO',
                  dataIndex: 'adjustAmount',
                  align: 'right',
                  width: 140,
                  render: (v) => (v != null ? formatCurrency(v) : '—'),
                },
                {
                  title: 'Wallet extra',
                  dataIndex: 'toSend',
                  align: 'right',
                  width: 120,
                  render: (v) =>
                    v > 0 ? (
                      <Typography.Text type="danger" strong>
                        {formatCurrency(v)}
                      </Typography.Text>
                    ) : (
                      '—'
                    ),
                },
                {
                  title: 'Still on old IPO',
                  dataIndex: 'toCollect',
                  align: 'right',
                  width: 130,
                  render: (v) =>
                    v > 0 ? (
                      <Typography.Text type="warning" strong>
                        {formatCurrency(v)}
                      </Typography.Text>
                    ) : (
                      '—'
                    ),
                },
                {
                  title: 'Old IPO after',
                  width: 140,
                  render: (_, r) =>
                    r.eligible ? (
                      r.willMarkOldReceived ? (
                        <Tag color="success">Settled</Tag>
                      ) : (
                        <Tag color="orange">Collect {formatCurrency(r.toCollect)}</Tag>
                      )
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
            </div>
          </ContentCard>

          {selectedPreview.unadjusted.length > 0 && (
            <ContentCard title="Not reused — still with these members" style={{ marginBottom: 16 }}>
              <div style={{ padding: '12px 16px 0' }}>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`${formatCurrency(selectedPreview.totals.unadjustedToCollect)} stays on the old IPO (awaiting allotment or not selected)`}
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
                    title: 'Amount',
                    dataIndex: 'toCollect',
                    align: 'right',
                    render: (v) => (
                      <Typography.Text strong>{formatCurrency(v)}</Typography.Text>
                    ),
                  },
                  {
                    title: 'Why',
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
              Reuse leftover ({selectedIds.length})
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
