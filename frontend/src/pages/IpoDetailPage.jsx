import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Table, Button, Tag, Modal, InputNumber, Steps, Checkbox, Alert,
  message, Space, Typography, Select, Input, Popconfirm, Switch, Result, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, LockOutlined, UnlockOutlined, PercentageOutlined } from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

export default function IpoDetailPage() {
  const { id } = useParams();
  const [ipo, setIpo] = useState(null);
  const [applications, setApplications] = useState([]);
  const [members, setMembers] = useState([]);
  const [wallet, setWallet] = useState(0);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payMode, setPayMode] = useState('single');
  const [payAccountId, setPayAccountId] = useState(null);
  const [paySplits, setPaySplits] = useState({});
  const [receiveAccountId, setReceiveAccountId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [markReceived, setMarkReceived] = useState(true);
  const [markGiven, setMarkGiven] = useState(true);
  const [editedRows, setEditedRows] = useState({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [profitPreview, setProfitPreview] = useState([]);
  const [profitLoading, setProfitLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ipoRes, appsRes, membersRes, walletRes] = await Promise.all([
        client.get(`/ipos/${id}`),
        client.get(`/ipos/${id}/applications`),
        client.get('/members'),
        client.get('/wallet'),
      ]);
      setIpo(ipoRes.data);
      setApplications(appsRes.data);
      setMembers(membersRes.data.filter((m) => m.status === 'ACTIVE'));
      const accts = walletRes.data.accounts || [];
      setWallet(Number(walletRes.data.balance));
      setBankAccounts(accts);
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setIpo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const activeMemberIds = new Set(applications.map((a) => a.member_id));
  const availableMembers = members.filter((m) => !activeMemberIds.has(m.id));
  const isClosed = ipo?.status === 'CLOSED';

  const totalNeeded = selectedIds.length * Number(ipo?.lot_amount || 0);

  const splitDebits = Object.entries(paySplits)
    .map(([bankAccountId, amount]) => ({ bankAccountId: Number(bankAccountId), amount: Number(amount) || 0 }))
    .filter((d) => d.amount > 0);
  const splitTotal = splitDebits.reduce((s, d) => s + d.amount, 0);

  const selectedPayAccount = bankAccounts.find((a) => a.id === payAccountId);
  const insufficientWallet = totalNeeded > wallet;
  const missingPayAccount = payMode === 'single' && bankAccounts.length > 1 && !payAccountId;
  const insufficientSingle =
    payMode === 'single' && selectedPayAccount && totalNeeded > Number(selectedPayAccount.balance);
  const insufficientSplit =
    payMode === 'split' && (splitTotal !== totalNeeded || splitDebits.some((d) => {
      const acc = bankAccounts.find((a) => a.id === d.bankAccountId);
      return !acc || d.amount > Number(acc.balance);
    }));
  const insufficient = insufficientWallet || insufficientSingle || insufficientSplit || missingPayAccount;
  const missingReceiveAccount = bankAccounts.length > 1 && !receiveAccountId;

  const onCloseIpo = async () => {
    setStatusLoading(true);
    try {
      const { data } = await client.post(`/ipos/${id}/close`);
      setIpo(data);
      message.success('IPO closed — fund distribution is disabled until you reopen');
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to close IPO'));
    } finally {
      setStatusLoading(false);
    }
  };

  const onReopenIpo = async () => {
    setStatusLoading(true);
    try {
      const { data } = await client.post(`/ipos/${id}/reopen`);
      setIpo(data);
      message.success('IPO reopened — you can distribute funds again');
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to reopen IPO'));
    } finally {
      setStatusLoading(false);
    }
  };

  const onPreviewProfitShare = async () => {
    setProfitLoading(true);
    try {
      const { data } = await client.post('/profit-shares/preview', { ipoId: Number(id) });
      setProfitPreview(data);
      setProfitModalOpen(true);
      if (!data.length) message.info('No pending allotted applications with P&L to distribute');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setProfitLoading(false);
    }
  };

  const onConfirmProfitShare = async () => {
    setProfitLoading(true);
    try {
      const { data } = await client.post('/profit-shares/distribute', { ipoId: Number(id) });
      message.success(`Distributed P&L for ${data.count} application(s)`);
      setProfitModalOpen(false);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setProfitLoading(false);
    }
  };

  const onDistribute = async () => {
    if (!selectedIds.length) {
      message.warning('Select at least one member');
      return;
    }
    if (payMode === 'single' && bankAccounts.length > 1 && !payAccountId) {
      message.warning('Select which bank account to pay from');
      return;
    }
    if (payMode === 'split' && splitTotal !== totalNeeded) {
      message.warning('Split amounts must equal the total required');
      return;
    }
    setDistributing(true);
    try {
      const body = {
        memberIds: selectedIds,
        markReceived,
        markGiven,
      };
      if (payMode === 'split' && splitDebits.length) {
        body.accountDebits = splitDebits;
      } else if (payAccountId) {
        body.bankAccountId = payAccountId;
      }
      await client.post(`/ipos/${id}/distribute`, body);
      message.success('Funds distributed to team');
      setDistributeOpen(false);
      setSelectedIds([]);
      setStep(0);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Distribution failed'));
    } finally {
      setDistributing(false);
    }
  };

  const onSaveBulk = async () => {
    const updates = Object.entries(editedRows).map(([appId, vals]) => {
      const update = { id: Number(appId) };
      if (vals.allotmentStatus !== undefined) update.allotmentStatus = vals.allotmentStatus;
      if (vals.profitLoss !== undefined) update.profitLoss = vals.profitLoss;
      if (vals.remarks !== undefined) update.remarks = vals.remarks;
      if (vals.amount !== undefined) update.amount = vals.amount;
      return update;
    }).filter((u) => Object.keys(u).length > 1);

    if (!updates.length) {
      message.info('No changes to save');
      return;
    }

    for (const u of updates) {
      if (u.allotmentStatus === 'ALLOTED' && u.profitLoss === undefined) {
        const row = applications.find((a) => a.id === u.id);
        if (row?.allotment_status !== 'ALLOTED' && row?.profit_loss == null) {
          message.warning('Set P&L for newly allotted applications before saving');
          return;
        }
      }
      if (u.amount !== undefined && (u.amount == null || u.amount <= 0)) {
        message.error('Application amount must be greater than zero');
        return;
      }
    }

    try {
      const { data } = await client.patch('/ipo-applications/bulk', { updates });
      const auto = data.autoDistributions || [];
      const applied = auto.filter((r) => !r.skipped);
      const needRules = auto.filter((r) => r.skipped && /share|Profit Sharing/i.test(r.reason || ''));
      setEditedRows({});
      load();
      if (applied.length) {
        message.success(
          `Saved. P&L share applied automatically for ${applied.length} member(s) — recorded in Profit Sharing history.`
        );
      } else {
        message.success('Applications updated');
      }
      if (needRules.length) {
        message.warning(
          `${needRules.length} member(s) need share rules under Profit Sharing before auto split can run.`,
          6
        );
      }
      const otherSkipped = auto.filter((r) => r.skipped && !r.reason?.includes('Share %'));
      if (otherSkipped.length && !applied.length) {
        const reasons = [...new Set(otherSkipped.map((r) => r.reason))].join('; ');
        if (reasons && reasons !== 'Already distributed') {
          message.info(reasons);
        }
      }
    } catch (err) {
      message.error(getErrorMessage(err, 'Update failed'));
    }
  };

  const onReceive = async (appId) => {
    if (missingReceiveAccount) {
      message.warning('Select which bank account should receive the returned funds');
      return;
    }
    try {
      await client.post(`/ipos/applications/${appId}/receive`, {
        returnToWallet: true,
        bankAccountId: receiveAccountId,
      });
      message.success('Marked as received — funds returned to wallet');
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    }
  };

  const updateRow = (appId, field, value) => {
    setEditedRows((prev) => ({
      ...prev,
      [appId]: { ...(prev[appId] || {}), id: Number(appId), [field]: value },
    }));
  };

  const getRowVal = (record, field, dbField) => {
    const edited = editedRows[record.id];
    if (edited && edited[field] !== undefined) return edited[field];
    return record[dbField];
  };

  const columns = [
    { title: 'Member', dataIndex: 'display_name' },
    { title: 'PAN', dataIndex: 'pan' },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v, r) => (
        <InputNumber
          size="small"
          min={1}
          disabled={isClosed}
          value={getRowVal(r, 'amount', 'amount')}
          onChange={(val) => updateRow(r.id, 'amount', val)}
        />
      ),
    },
    { title: 'Received', dataIndex: 'trns_received', render: (v) => v && <Tag color="green">{v}</Tag> },
    { title: 'Given', dataIndex: 'trns_given', render: (v) => v && <Tag color="blue">{v}</Tag> },
    {
      title: 'Allotment',
      dataIndex: 'allotment_status',
      render: (v, r) => (
        <Select
          size="small"
          style={{ width: 130 }}
          value={getRowVal(r, 'allotmentStatus', 'allotment_status')}
          onChange={(val) => {
            updateRow(r.id, 'allotmentStatus', val);
            if (val === 'NOT_ALLOTED') updateRow(r.id, 'profitLoss', null);
          }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'ALLOTED', label: 'Alloted' },
            { value: 'NOT_ALLOTED', label: 'Not Alloted' },
          ]}
        />
      ),
    },
    {
      title: 'P&L',
      dataIndex: 'profit_loss',
      render: (v, r) => {
        const status = getRowVal(r, 'allotmentStatus', 'allotment_status');
        if (status !== 'ALLOTED') return '—';
        return (
          <InputNumber
            size="small"
            placeholder="Profit + / Loss −"
            value={getRowVal(r, 'profitLoss', 'profit_loss')}
            onChange={(val) => updateRow(r.id, 'profitLoss', val)}
          />
        );
      },
    },
    {
      title: 'P&L share',
      render: (_, r) => {
        if (r.profit_share_distribution_id) {
          return (
            <Tag color="purple" title={`Provider ${formatCurrency(r.share_provider_amount)} · Manager ${formatCurrency(r.share_manager_amount)}`}>
              Split done
            </Tag>
          );
        }
        const status = getRowVal(r, 'allotmentStatus', 'allotment_status');
        const pl = getRowVal(r, 'profitLoss', 'profit_loss');
        if (status === 'ALLOTED' && pl != null && Number(pl) !== 0) {
          return <Tag color="gold">On save</Tag>;
        }
        return '—';
      },
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      render: (v, r) => (
        <Input
          size="small"
          value={getRowVal(r, 'remarks', 'remarks') ?? ''}
          onChange={(e) => updateRow(r.id, 'remarks', e.target.value)}
        />
      ),
    },
    {
      title: 'Return',
      render: (_, r) =>
        r.trns_received === 'Received' ? (
          <Tag color="green">Settled</Tag>
        ) : (
          <Popconfirm title="Mark received and return to wallet?" onConfirm={() => onReceive(r.id)}>
            <Button size="small">Receive</Button>
          </Popconfirm>
        ),
    },
  ];

  if (loading && !ipo) return <PageLoading />;

  if (loadError && !loading) {
    return (
      <Result
        status="error"
        title="Could not load IPO"
        subTitle={loadError}
        extra={<Link to="/ipos"><Button type="primary">Back to IPOs</Button></Link>}
      />
    );
  }

  if (!ipo && !loading) {
    return (
      <Result
        status="404"
        title="IPO not found"
        extra={<Link to="/ipos"><Button type="primary">Back to IPOs</Button></Link>}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <Space>
            {ipo?.name}
            <Tag color={isClosed ? 'error' : 'success'}>{isClosed ? 'CLOSED' : 'OPEN'}</Tag>
          </Space>
        }
        subtitle={`Lot size ${formatCurrency(ipo?.lot_amount)} · Total wallet ${formatCurrency(wallet)}`}
        extra={
          <Space wrap>
            <Link to="/ipos"><Button icon={<ArrowLeftOutlined />}>Back</Button></Link>
            <Tooltip
              title={
                isClosed
                  ? 'IPO is closed — reopen to distribute funds to more members'
                  : !availableMembers.length
                    ? 'All active members already have an application for this IPO'
                    : 'Distribute lot amount from wallet to selected members'
              }
            >
              <Button
                type="primary"
                onClick={() => {
                  setSelectedIds(availableMembers.map((m) => m.id));
                  setStep(0);
                  setDistributeOpen(true);
                }}
                disabled={!availableMembers.length || isClosed}
              >
                Distribute Funds
              </Button>
            </Tooltip>
            <Button icon={<SaveOutlined />} onClick={onSaveBulk} disabled={!Object.keys(editedRows).length}>
              Save Changes
            </Button>
            <Button icon={<PercentageOutlined />} onClick={onPreviewProfitShare} loading={profitLoading}>
              Distribute pending P&L
            </Button>
            {isClosed ? (
              <Popconfirm
                title="Reopen this IPO?"
                description="You will be able to distribute funds to more members again."
                onConfirm={onReopenIpo}
              >
                <Button icon={<UnlockOutlined />} loading={statusLoading}>
                  Reopen IPO
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="Close this IPO?"
                description="After close, Distribute Funds is disabled until you reopen. You can still update allotments and P&L."
                onConfirm={onCloseIpo}
              >
                <Button icon={<LockOutlined />} danger loading={statusLoading}>
                  Close IPO
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="P&L share runs automatically on save"
        description="When you set Alloted and enter profit or loss (e.g. ₹4,000), Save Changes splits it by that member's rules and adds a row in Profit Sharing → History."
      />

      {isClosed && (
        <Alert
          type="warning"
          message="IPO is closed"
          description="Distribute Funds is disabled for closed IPOs. You can still edit allotments, profit/loss, and mark returns. Reopen IPO to add more members."
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {bankAccounts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">Member returns credit to: </Typography.Text>
          <Select
            style={{ minWidth: 280, marginLeft: 8 }}
            placeholder={bankAccounts.length > 1 ? 'Select account' : undefined}
            allowClear={bankAccounts.length <= 1}
            value={receiveAccountId}
            onChange={setReceiveAccountId}
            options={bankAccounts.map((a) => ({
              value: a.id,
              label: `${a.label} (${formatCurrency(a.balance)})`,
            }))}
          />
          {bankAccounts.length > 1 && !receiveAccountId && (
            <Typography.Text type="warning" style={{ marginLeft: 8 }}>
              Required before marking receive
            </Typography.Text>
          )}
        </div>
      )}

      <ContentCard title={`Applications (${applications.length})`}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={applications}
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{ emptyText: 'No applications yet — distribute funds to members' }}
          {...tableDefaults}
        />
      </ContentCard>

      <Modal
        title="Distribute profit & loss (by %)"
        open={profitModalOpen}
        onCancel={() => setProfitModalOpen(false)}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => setProfitModalOpen(false)}>Cancel</Button>,
          <Button
            key="ok"
            type="primary"
            disabled={!profitPreview.length || profitPreview.some((r) => r.configWarning)}
            loading={profitLoading}
            onClick={onConfirmProfitShare}
          >
            Confirm distribution
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Manual distribute (optional)"
          description="Pending rows that were not auto-split on save (e.g. missing member rules) can be distributed here."
        />
        {profitPreview.some((r) => r.configWarning) && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="Share rules required"
            description="Some members need at least one valid share rule under Profit Sharing before confirming."
          />
        )}
        <Table
          rowKey="applicationId"
          size="small"
          pagination={false}
          dataSource={profitPreview}
          columns={[
            { title: 'Member', dataIndex: 'memberName' },
            {
              title: 'Gross P&L',
              dataIndex: 'grossProfitLoss',
              render: (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span>,
            },
            {
              title: 'Rules',
              render: (_, r) => {
                if (r.configWarning) return <Tag color="error">{r.configWarning}</Tag>;
                const lines = r.ruleLines || [];
                if (!lines.length) return '—';
                return (
                  <div style={{ fontSize: 12 }}>
                    {lines.map((l) => (
                      <div key={l.ruleId || l.ruleName}>
                        <Tag color={l.pnlType === 'LOSS' ? 'error' : 'success'} style={{ marginRight: 4 }}>
                          {l.ruleName}
                        </Tag>
                        {l.providerName} ({l.providerPercent}% + {l.managerPercent}% mgr)
                      </div>
                    ))}
                  </div>
                );
              },
            },
            {
              title: 'Provider share',
              dataIndex: 'providerAmount',
              render: (v, r) => (
                <span className={pnlClassName(v)}>
                  {formatCurrency(v)}
                  {r.pnlType === 'LOSS' && Number(v) < 0 ? ' (bears loss)' : ''}
                </span>
              ),
            },
            {
              title: 'Manager share',
              dataIndex: 'managerAmount',
              render: (v, r) => (
                <span className={pnlClassName(v)}>
                  {formatCurrency(v)}
                  {r.pnlType === 'LOSS' && Number(v) < 0 ? ' (bears loss)' : ''}
                </span>
              ),
            },
            {
              title: 'Member keeps',
              dataIndex: 'memberAmount',
              render: (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span>,
            },
          ]}
        />
      </Modal>

      <Modal
        title="Distribute for IPO"
        open={distributeOpen}
        onCancel={() => { setDistributeOpen(false); setStep(0); }}
        footer={step < 2 ? undefined : [
          <Button key="back" onClick={() => setStep(step - 1)}>Back</Button>,
          <Button key="go" type="primary" disabled={insufficient || distributing} loading={distributing} onClick={onDistribute}>
            Confirm Distribution
          </Button>,
        ]}
        width={640}
        destroyOnClose
      >
        <Steps current={step} items={[{ title: 'Members' }, { title: 'Options' }, { title: 'Confirm' }]} style={{ marginBottom: 24 }} />

        {step === 0 && (
          <>
            {availableMembers.length ? (
              <>
                <Checkbox.Group
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  value={selectedIds}
                  onChange={setSelectedIds}
                  options={availableMembers.map((m) => ({ label: `${m.display_name} (${m.pan})`, value: m.id }))}
                />
                <Button type="link" onClick={() => setSelectedIds(availableMembers.map((m) => m.id))}>Select all</Button>
              </>
            ) : (
              <Alert type="warning" message="All active members already have applications for this IPO" showIcon />
            )}
            <div style={{ marginTop: 16 }}>
              <Button disabled={!selectedIds.length} type="primary" onClick={() => setStep(1)}>Next</Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <label><Switch checked={markReceived} onChange={setMarkReceived} /> Mark Received now</label>
              <label><Switch checked={markGiven} onChange={setMarkGiven} /> Mark Given now</label>
              <div>
                <Typography.Text strong>Pay from bank account(s)</Typography.Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  value={payMode}
                  onChange={setPayMode}
                  options={[
                    { value: 'single', label: 'One account' },
                    { value: 'split', label: 'Split across multiple accounts' },
                  ]}
                />
              </div>
              {payMode === 'single' ? (
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select bank account"
                  value={payAccountId}
                  onChange={setPayAccountId}
                  options={bankAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.label} — ${formatCurrency(a.balance)} available`,
                  }))}
                />
                {bankAccounts.length > 1 && !payAccountId && (
                  <Typography.Text type="danger" style={{ display: 'block', marginTop: 4 }}>
                    Select an account to pay from
                  </Typography.Text>
                )}
              ) : (
                <div>
                  {bankAccounts.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ flex: 1 }}>{a.label} ({formatCurrency(a.balance)})</span>
                      <InputNumber
                        min={0}
                        max={a.balance}
                        style={{ width: 140 }}
                        placeholder="₹0"
                        value={paySplits[a.id]}
                        onChange={(v) => setPaySplits((prev) => ({ ...prev, [a.id]: v }))}
                      />
                    </div>
                  ))}
                  <Typography.Text type={splitTotal === totalNeeded ? undefined : 'danger'}>
                    Split total: {formatCurrency(splitTotal)} / {formatCurrency(totalNeeded)}
                  </Typography.Text>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      let remaining = totalNeeded;
                      const next = {};
                      const sorted = [...bankAccounts].sort((a, b) => b.balance - a.balance);
                      for (const acc of sorted) {
                        if (remaining <= 0) break;
                        const use = Math.min(remaining, Number(acc.balance));
                        if (use > 0) {
                          next[acc.id] = use;
                          remaining -= use;
                        }
                      }
                      setPaySplits(next);
                    }}
                  >
                    Auto-fill from available balances
                  </Button>
                </div>
              )}
            </Space>
            <div style={{ marginTop: 16 }}>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button type="primary" style={{ marginLeft: 8 }} onClick={() => setStep(2)}>Next</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p>Members: <strong>{selectedIds.length}</strong></p>
            <p>Lot amount: <strong>{formatCurrency(ipo?.lot_amount)}</strong></p>
            <p>Total required: <strong>{formatCurrency(totalNeeded)}</strong></p>
            <p>Total wallet: <strong>{formatCurrency(wallet)}</strong></p>
            {payMode === 'single' && selectedPayAccount && (
              <p>Pay from: <strong>{selectedPayAccount.label}</strong> ({formatCurrency(selectedPayAccount.balance)} available)</p>
            )}
            {payMode === 'split' && splitDebits.length > 0 && (
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                {splitDebits.map((d) => {
                  const acc = bankAccounts.find((a) => a.id === d.bankAccountId);
                  return (
                    <li key={d.bankAccountId}>{acc?.label}: {formatCurrency(d.amount)}</li>
                  );
                })}
              </ul>
            )}
            {insufficient && (
              <Alert
                type="error"
                message="Insufficient funds"
                description={
                  missingPayAccount
                    ? 'Select which bank account to pay from.'
                    : insufficientSplit
                    ? 'Adjust split amounts so they match the total and each account has enough balance.'
                    : insufficientSingle
                      ? `${selectedPayAccount?.label} does not have enough for ${formatCurrency(totalNeeded)}.`
                      : `Need ${formatCurrency(totalNeeded)} but only ${formatCurrency(wallet)} total in wallet. Add funds from a Fund Provider first.`
                }
                showIcon
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
