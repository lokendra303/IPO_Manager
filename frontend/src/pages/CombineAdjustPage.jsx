import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Col, Modal, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, SwapOutlined, SendOutlined, DownloadOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import StatCard from '../components/StatCard';

export default function CombineAdjustPage() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ sources: [], targets: [] });
  const [fromIpoIds, setFromIpoIds] = useState([]);
  const [targetIpoIds, setTargetIpoIds] = useState([]);
  const [category, setCategory] = useState('RII');
  const [preview, setPreview] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [assignments, setAssignments] = useState({}); // applicationId -> targetIpoId
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adjustingId, setAdjustingId] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [providerBalance, setProviderBalance] = useState(0);
  const [payAccountId, setPayAccountId] = useState(null);

  const reloadMeta = () =>
    client
      .get('/ipos/adjust-combine/meta')
      .then((r) => setMeta(r.data || { sources: [], targets: [] }))
      .catch((err) => message.error(getErrorMessage(err)));

  const reloadWallet = () =>
    client
      .get('/wallet')
      .then((r) => {
        const accts = (r.data.accounts || []).filter((a) => a.purpose !== 'MANAGER');
        setBankAccounts(accts);
        setProviderBalance(Number(r.data.providerBalance ?? r.data.balance ?? 0));
        setPayAccountId((prev) => {
          if (prev && accts.some((a) => a.id === prev)) return prev;
          return accts.length === 1 ? accts[0].id : prev;
        });
      })
      .catch(() => {});

  const reloadPreview = async (nextAssign = assignments) => {
    if (!fromIpoIds.length || !targetIpoIds.length) {
      setPreview(null);
      setSelectedKeys([]);
      return;
    }
    setPreviewLoading(true);
    try {
      const assignmentList = Object.entries(nextAssign)
        .filter(([, tid]) => tid)
        .map(([applicationId, targetIpoId]) => ({
          applicationId: Number(applicationId),
          targetIpoId: Number(targetIpoId),
        }));
      const { data } = await client.post('/ipos/adjust-combine/preview', {
        fromIpoIds,
        targetIpoIds,
        investorCategory: category,
        assignments: assignmentList,
      });
      setPreview(data);
      const eligible = (data.rows || []).filter((r) => r.eligible);
      setSelectedKeys(eligible.map((r) => r.applicationId));
      setAssignments((prev) => {
        const next = { ...prev };
        for (const r of eligible) {
          if (r.targetIpoId) next[r.applicationId] = r.targetIpoId;
        }
        // drop adjusted apps that disappeared
        for (const key of Object.keys(next)) {
          if (!(data.rows || []).some((r) => String(r.applicationId) === String(key))) {
            delete next[key];
          }
        }
        return next;
      });
    } catch (err) {
      message.error(getErrorMessage(err, 'Preview failed'));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      client.get('/ipos/adjust-combine/meta'),
      client.get('/wallet').catch(() => ({ data: {} })),
    ])
      .then(([metaRes, walletRes]) => {
        setMeta(metaRes.data || { sources: [], targets: [] });
        const accts = (walletRes.data?.accounts || []).filter((a) => a.purpose !== 'MANAGER');
        setBankAccounts(accts);
        setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
        if (accts.length === 1) setPayAccountId(accts[0].id);
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Reload preview when sources/targets/category change (target per-row via changeTarget)
  useEffect(() => {
    if (!fromIpoIds.length || !targetIpoIds.length) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const assignmentList = Object.entries(assignments)
          .filter(([, tid]) => tid)
          .map(([applicationId, targetIpoId]) => ({
            applicationId: Number(applicationId),
            targetIpoId: Number(targetIpoId),
          }));
        const { data } = await client.post('/ipos/adjust-combine/preview', {
          fromIpoIds,
          targetIpoIds,
          investorCategory: category,
          assignments: assignmentList,
        });
        if (cancelled) return;
        setPreview(data);
        const eligible = (data.rows || []).filter((r) => r.eligible);
        setSelectedKeys(eligible.map((r) => r.applicationId));
        setAssignments((prev) => {
          const next = { ...prev };
          for (const r of eligible) {
            if (r.targetIpoId) next[r.applicationId] = r.targetIpoId;
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          message.error(getErrorMessage(err, 'Preview failed'));
          setPreview(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments refreshed via changeTarget
  }, [fromIpoIds, targetIpoIds, category]);

  const changeTarget = async (applicationId, targetIpoId) => {
    const nextAssign = { ...assignments, [applicationId]: targetIpoId };
    setAssignments(nextAssign);
    if (!fromIpoIds.length || !targetIpoIds.length) return;
    setPreviewLoading(true);
    try {
      const assignmentList = Object.entries(nextAssign)
        .filter(([, tid]) => tid)
        .map(([appId, tid]) => ({
          applicationId: Number(appId),
          targetIpoId: Number(tid),
        }));
      const { data } = await client.post('/ipos/adjust-combine/preview', {
        fromIpoIds,
        targetIpoIds,
        investorCategory: category,
        assignments: assignmentList,
      });
      setPreview(data);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedRows = useMemo(() => {
    if (!preview) return [];
    const set = new Set(selectedKeys);
    return (preview.rows || []).filter((r) => r.eligible && set.has(r.applicationId));
  }, [preview, selectedKeys]);

  const liveTotals = useMemo(() => {
    const adjustToSend = selectedRows.reduce((s, r) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s, r) => s + Number(r.toCollect || 0), 0);
    const totalAdjust = selectedRows.reduce((s, r) => s + Number(r.adjustAmount || 0), 0);
    const unadjustedToCollect = Number(preview?.totals?.unadjustedToCollect || 0);
    const allottedCount = Number(preview?.totals?.allottedCount || preview?.allottedExcluded?.length || 0);
    const allottedPrincipal = Number(preview?.totals?.allottedPrincipal || 0);
    return {
      adjustToSend,
      totalToCollect,
      totalAdjust,
      unadjustedToCollect,
      allottedCount,
      allottedPrincipal,
      count: selectedRows.length,
    };
  }, [selectedRows, preview]);

  const onSubmit = (rowsToAdjust) => {
    const rows = Array.isArray(rowsToAdjust) ? rowsToAdjust : selectedRows;
    if (!rows.length) {
      message.warning('Select at least one member');
      return;
    }

    const toSend = rows.reduce((s, r) => s + Number(r.toSend || 0), 0);
    const walletCredit = rows.reduce((s, r) => s + Number(r.walletCredit || 0), 0);
    const toCollect = rows.reduce((s, r) => s + Number(r.toCollect || 0), 0);
    const single = rows.length === 1;

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

    Modal.confirm({
      title: single
        ? `Reuse leftover for ${rows[0].memberName}?`
        : `Reuse leftover for ${rows.length} members?`,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            Leftover from the old IPO moves onto the new one. If the new lot is bigger, the extra is taken from the provider wallet.
          </p>
          <div>
            {rows.length} member{rows.length > 1 ? 's' : ''}
            {toSend > 0 && (
              <>
                {' · '}
                <Typography.Text type="danger">
                  wallet extra {formatCurrency(toSend)}
                </Typography.Text>
              </>
            )}
            {toCollect > 0 && <> · leftover on old IPO {formatCurrency(toCollect)}</>}
          </div>
          {toSend > 0 && (
            <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>
              From:{' '}
              {bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id))?.label ||
                'provider wallet'}
            </div>
          )}
        </div>
      ),
      okText: single ? 'Reuse this one' : `Reuse selected (${rows.length})`,
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        if (single) setAdjustingId(rows[0].applicationId);
        try {
          const items = rows.map((r) => ({
            applicationId: r.applicationId,
            targetIpoId: assignments[r.applicationId] || r.targetIpoId,
          }));
          const body = {
            items,
            investorCategory: category,
          };
          if (toSend > 0.001 || walletCredit > 0.001) {
            body.bankAccountId = payAccountId || bankAccounts[0]?.id;
          }
          const { data } = await client.post('/ipos/adjust-combine', body);
          message.success(
            `Moved leftover for ${data.count}` +
              (data.totalAdjusted > 0 ? ` · ${formatCurrency(data.totalAdjusted)} onto new IPO` : '') +
              (data.providerDebited > 0
                ? ` · wallet −${formatCurrency(data.providerDebited)}`
                : '') +
              (data.providerCredited > 0
                ? ` · wallet +${formatCurrency(data.providerCredited)}`
                : '') +
              (data.totalToCollect > 0 ? ` · leftover ${formatCurrency(data.totalToCollect)} on old IPO` : '')
          );
          await reloadMeta();
          await reloadWallet();
          await reloadPreview();
        } catch (err) {
          message.error(getErrorMessage(err, 'Reuse leftover failed'));
          throw err;
        } finally {
          setSubmitting(false);
          setAdjustingId(null);
        }
      },
    });
  };

  const adjustOne = (row) => {
    if (!row?.eligible) return;
    onSubmit([row]);
  };

  if (loading) return <PageLoading />;

  const sourceOptions = (meta.sources || []).map((s) => ({
    value: s.id,
    label: `${s.name} · ${s.adjustableCount} member${s.adjustableCount === 1 ? '' : 's'} · ${formatCurrency(s.adjustablePrincipal)} leftover`,
    disabled: targetIpoIds.includes(s.id),
  }));
  const targetOptions = (meta.targets || []).map((t) => ({
    value: t.id,
    label: `${t.name} · RII ${t.lotAmountRii != null ? formatCurrency(t.lotAmountRii) : '—'}`,
    disabled: fromIpoIds.includes(t.id),
  }));

  return (
    <div>
      <PageHeader
        title={
          <Space>
            <SwapOutlined />
            Reuse leftover funds
          </Space>
        }
        subtitle="Move not-allotted leftover from one or more old IPOs onto one or more new IPOs. Extra needed comes from the provider wallet."
        extra={
          <>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ipos')}>
              IPOs
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!selectedRows.length}
              onClick={() => onSubmit()}
            >
              Reuse leftover ({liveTotals.count})
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
            <li>Pick old IPOs that still have leftover with members (including small amounts like ₹180 or ₹48), and the new IPOs to put it on.</li>
            <li>Each member’s leftovers are added together onto one new IPO application.</li>
            <li>
              If the new lot is bigger, extra comes from the <strong>provider wallet</strong>.
              If the member is already on the new IPO, leftover is added there and the wallet is credited.
            </li>
          </ol>
        }
      />

      <ContentCard title="1. Choose IPOs" padded style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">Old IPOs (leftover with members)</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select old IPOs with leftover money"
              value={fromIpoIds}
              options={sourceOptions}
              onChange={(ids) => {
                setFromIpoIds(ids);
                setAssignments({});
              }}
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">New IPOs (where leftover goes)</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select open IPOs to reuse onto"
              value={targetIpoIds}
              options={targetOptions}
              onChange={(ids) => {
                setTargetIpoIds(ids);
                setAssignments({});
              }}
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Typography.Text type="secondary">Category on new IPOs</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={category}
              onChange={setCategory}
              options={[
                { value: 'RII', label: 'RII' },
                { value: 'HNI', label: 'HNI' },
              ]}
            />
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Typography.Text type="secondary">
              Provider wallet (if extra is needed)
            </Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
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
              Provider total {formatCurrency(providerBalance)}
              {liveTotals.adjustToSend > 0 && (
                <>
                  {' · '}
                  need {formatCurrency(liveTotals.adjustToSend)}
                  {liveTotals.adjustToSend > providerBalance + 0.001 && (
                    <Typography.Text type="danger"> (short)</Typography.Text>
                  )}
                </>
              )}
            </Typography.Text>
          </Col>
        </Row>
      </ContentCard>

      {preview && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <StatCard
                title="From provider wallet"
                value={formatCurrency(liveTotals.adjustToSend)}
                icon={<SendOutlined />}
                variant="danger"
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard
                title="Leftover on old IPO"
                value={formatCurrency(liveTotals.totalToCollect)}
                icon={<DownloadOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard
                title="Not reused"
                value={formatCurrency(liveTotals.unadjustedToCollect)}
                icon={<ClockCircleOutlined />}
                variant="warning"
              />
            </Col>
          </Row>

          <ContentCard
            title="2. Review members"
            style={{ marginBottom: 16 }}
            extra={
              <Space wrap>
                <Button
                  size="small"
                  onClick={() =>
                    setSelectedKeys(
                      (preview.rows || []).filter((r) => r.eligible).map((r) => r.applicationId)
                    )
                  }
                >
                  Select all
                </Button>
                <Button size="small" onClick={() => setSelectedKeys([])}>
                  Clear
                </Button>
                <Typography.Text type="danger" strong>
                  Wallet extra {formatCurrency(liveTotals.adjustToSend)}
                </Typography.Text>
                <Button
                  type="primary"
                  size="small"
                  loading={submitting}
                  disabled={!selectedRows.length}
                  onClick={() => onSubmit()}
                >
                  Reuse leftover ({liveTotals.count})
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
              scroll={{ x: 1360 }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                getCheckboxProps: (r) => ({ disabled: !r.eligible }),
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
                        <Tag color="cyan" style={{ marginTop: 4 }}>Adds to existing</Tag>
                      )}
                      {r.pooledWithCount > 1 && r.eligible && !r.ontoExisting && (
                        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                          Pooled with {r.pooledWithCount} leftovers
                        </Typography.Text>
                      )}
                    </div>
                  ),
                },
                {
                  title: 'From (old)',
                  dataIndex: 'sourceIpoName',
                  width: 180,
                  ellipsis: true,
                },
                {
                  title: 'With member now',
                  dataIndex: 'remainder',
                  align: 'right',
                  width: 128,
                  render: (v) => formatCurrency(v),
                },
                {
                  title: 'Onto (new)',
                  width: 220,
                  render: (_, r) => (
                    <Select
                      style={{ width: '100%', minWidth: 180 }}
                      size="small"
                      disabled={!r.eligible && !(r.targetOptions || []).length}
                      value={assignments[r.applicationId] || r.targetIpoId || undefined}
                      options={(r.targetOptions || []).map((o) => ({
                        value: o.targetIpoId,
                        label: o.targetIpoName,
                        disabled: o.blocked && o.targetIpoId !== (assignments[r.applicationId] || r.targetIpoId),
                      }))}
                      onChange={(tid) => changeTarget(r.applicationId, tid)}
                    />
                  ),
                },
                {
                  title: 'New lot',
                  dataIndex: 'newLot',
                  align: 'right',
                  width: 108,
                  render: (v) => (v != null ? formatCurrency(v) : '—'),
                },
                {
                  title: 'Wallet extra',
                  dataIndex: 'toSend',
                  align: 'right',
                  width: 118,
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
                  width: 132,
                  render: (v) => (v > 0 ? formatCurrency(v) : '—'),
                },
                {
                  title: 'After reuse',
                  width: 108,
                  render: (_, r) =>
                    r.eligible ? (
                      r.willMarkOldReceived ? (
                        <Tag color="success">Settled</Tag>
                      ) : (
                        <Tag color="orange">Collect</Tag>
                      )
                    ) : (
                      '—'
                    ),
                },
                {
                  title: '',
                  width: 88,
                  fixed: 'right',
                  render: (_, r) =>
                    r.eligible ? (
                      <Button
                        type="link"
                        size="small"
                        loading={adjustingId === r.applicationId}
                        disabled={submitting}
                        onClick={() => adjustOne(r)}
                      >
                        Reuse
                      </Button>
                    ) : (
                      '—'
                    ),
                },
              ]}
              summary={() => (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}>
                      <strong>Selected total ({liveTotals.count})</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Typography.Text type="danger" strong>
                        {formatCurrency(liveTotals.adjustToSend)}
                      </Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <strong>{formatCurrency(liveTotals.totalToCollect)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} />
                    <Table.Summary.Cell index={9} />
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
            </div>
          </ContentCard>

          {(preview.allottedExcluded || []).length > 0 && (
            <ContentCard
              title={`Allotted — cannot reuse (${preview.allottedExcluded.length})`}
              style={{ marginBottom: 16 }}
            >
              <div style={{ padding: '12px 16px 0' }}>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`${formatCurrency(liveTotals.allottedPrincipal)} is in allotted shares — it stays there. The same member can still reuse leftover from other not-allotted IPOs.`}
                />
              </div>
              <Table
                size="small"
                rowKey="applicationId"
                pagination={false}
                dataSource={preview.allottedExcluded}
                columns={[
                  { title: 'Member', dataIndex: 'memberName' },
                  { title: 'Old IPO', dataIndex: 'sourceIpoName' },
                  {
                    title: 'Amount',
                    dataIndex: 'remainder',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                  { title: 'Reason', dataIndex: 'reason' },
                ]}
              />
            </ContentCard>
          )}

          {(preview.unadjustedPending || []).length > 0 && (
            <ContentCard title="Not reused — still with these members" style={{ marginBottom: 16 }}>
              <Table
                size="small"
                rowKey="applicationId"
                pagination={false}
                dataSource={preview.unadjustedPending}
                columns={[
                  { title: 'Member', dataIndex: 'memberName' },
                  { title: 'Old IPO', dataIndex: 'sourceIpoName' },
                  {
                    title: 'Amount',
                    dataIndex: 'toCollect',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                  { title: 'Reason', dataIndex: 'reason' },
                ]}
              />
            </ContentCard>
          )}

          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message={
              <>
                <strong>Provider wallet extra: {formatCurrency(liveTotals.adjustToSend)}</strong>
                {' · '}
                Leftover on old IPO: {formatCurrency(liveTotals.totalToCollect)}
                {liveTotals.unadjustedToCollect > 0 && (
                  <>
                    {' · '}
                    Not reused: {formatCurrency(liveTotals.unadjustedToCollect)}
                  </>
                )}
              </>
            }
          />

          <Button
            type="primary"
            size="large"
            loading={submitting}
            disabled={!selectedRows.length}
            onClick={() => onSubmit()}
            icon={<SwapOutlined />}
            style={{ marginBottom: 32 }}
          >
            Reuse leftover ({liveTotals.count})
          </Button>
        </>
      )}

      {!preview && fromIpoIds.length > 0 && targetIpoIds.length > 0 && !previewLoading && (
        <Alert type="warning" showIcon message="No adjustable members for this selection" />
      )}
    </div>
  );
}
