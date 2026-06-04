import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Table, Button, Form, InputNumber, Input, Select, message, Modal, Tabs, Row, Col, Tag, Space, Divider, Segmented, Popconfirm,
} from 'antd';
import {
  PercentageOutlined, SaveOutlined, EditOutlined, ReloadOutlined, WarningOutlined, PlusOutlined, DeleteOutlined,
  TeamOutlined, BankOutlined, UserOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

function KeepsTag({ provider, manager }) {
  const p = Number(provider) || 0;
  const m = Number(manager) || 0;
  return (
    <Tag color={p + m > 100 ? 'error' : 'processing'} style={{ marginTop: 4 }}>
      Member keeps: {Math.max(0, 100 - p - m)}%
    </Tag>
  );
}

function IpoScopeTag({ rule }) {
  if (rule?.ipoId) {
    return <Tag color="purple">{rule.ipoName || `IPO #${rule.ipoId}`}</Tag>;
  }
  return <Tag>All IPOs</Tag>;
}

function SharePercentForm({ form, prefix }) {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name={`${prefix}ProviderPercent`} label="Provider %" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name={`${prefix}ManagerPercent`} label="Manager (you) %" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item shouldUpdate>
        {() => (
          <KeepsTag
            provider={form.getFieldValue(`${prefix}ProviderPercent`)}
            manager={form.getFieldValue(`${prefix}ManagerPercent`)}
          />
        )}
      </Form.Item>
    </>
  );
}

export default function ProfitSharingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fundProviders, setFundProviders] = useState([]);
  const [ipos, setIpos] = useState([]);
  const [members, setMembers] = useState([]);
  const [report, setReport] = useState(null);
  const [pnlTotals, setPnlTotals] = useState(null);
  const [totalsView, setTotalsView] = useState('member');
  const [manageMember, setManageMember] = useState(null);
  const [memberRules, setMemberRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [ruleFormContext, setRuleFormContext] = useState(null);
  const [ruleForm] = Form.useForm();
  const [ruleSaving, setRuleSaving] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const renderAmt = (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span>;

  const load = async () => {
    setLoading(true);
    try {
      const [memRes, fpRes, ipoRes, repRes, totalsRes] = await Promise.all([
        client.get('/profit-shares/members'),
        client.get('/fund-providers'),
        client.get('/ipos'),
        client.get('/profit-shares/report'),
        client.get('/profit-shares/totals'),
      ]);
      setMembers(memRes.data);
      setFundProviders(fpRes.data);
      setIpos(ipoRes.data);
      setReport(repRes.data);
      setPnlTotals(totalsRes.data);
      return memRes.data;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const editId = location.state?.editMemberId;
    if (!editId || !members.length) return;
    const m = members.find((x) => x.memberId === editId);
    if (m) openManageMember(m);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.editMemberId, members]);

  const providerOptions = fundProviders.map((p) => ({ value: p.id, label: p.name }));
  const ipoOptions = ipos.map((i) => ({ value: i.id, label: i.name }));

  const loadMemberRules = async (memberId) => {
    setRulesLoading(true);
    try {
      const { data } = await client.get(`/profit-shares/members/${memberId}/rules`);
      setMemberRules(data.rules || []);
      return data.rules || [];
    } finally {
      setRulesLoading(false);
    }
  };

  const openManageMember = async (m) => {
    setManageMember(m);
    await loadMemberRules(m.memberId);
  };

  const rulesByScope = (rules) => {
    const groups = new Map();
    for (const r of rules) {
      const key = r.ipoId ?? 'global';
      if (!groups.has(key)) {
        groups.set(key, { label: r.ipoId ? (r.ipoName || `IPO #${r.ipoId}`) : 'All IPOs', rules: [] });
      }
      groups.get(key).rules.push(r);
    }
    return [...groups.values()].map((g) => {
      const profitP = g.rules.reduce((s, r) => s + Number(r.profitProviderPercent), 0);
      const profitM = g.rules.reduce((s, r) => s + Number(r.profitManagerPercent), 0);
      const lossP = g.rules.reduce((s, r) => s + Number(r.lossProviderPercent), 0);
      const lossM = g.rules.reduce((s, r) => s + Number(r.lossManagerPercent), 0);
      return { ...g, profitP, profitM, lossP, lossM };
    });
  };

  const defaultRuleFormValues = (nextIndex = 1) => ({
    ruleName: `Rule ${nextIndex}`,
    ipoId: undefined,
    fundProviderId: undefined,
    profitProviderPercent: 0,
    profitManagerPercent: 0,
    lossProviderPercent: 0,
    lossManagerPercent: 0,
  });

  /** Open the rule form for one or many members (create) */
  const openAddRuleForm = (memberIds, label, nextRuleIndex = 1) => {
    if (!memberIds.length) return;
    setRuleFormContext({ mode: 'create', memberIds, label });
    ruleForm.setFieldsValue(defaultRuleFormValues(nextRuleIndex));
    setRuleFormOpen(true);
  };

  const openAddRuleForMember = (m) => {
    openAddRuleForm([m.memberId], m.displayName, (m.ruleCount || 0) + 1);
  };

  const openAddRuleForSelected = () => {
    const selected = members.filter((m) => selectedMemberIds.includes(m.memberId));
    const label = selected.length === 1
      ? selected[0].displayName
      : `${selected.length} members`;
    openAddRuleForm(selectedMemberIds, label, 1);
  };

  const openEditRuleForm = (rule) => {
    if (!manageMember) return;
    setRuleFormContext({
      mode: 'edit',
      memberIds: [manageMember.memberId],
      label: manageMember.displayName,
      ruleId: rule.id,
    });
    ruleForm.setFieldsValue({
      ruleName: rule.ruleName,
      ipoId: rule.ipoId ?? undefined,
      fundProviderId: rule.fundProviderId,
      profitProviderPercent: rule.profitProviderPercent,
      profitManagerPercent: rule.profitManagerPercent,
      lossProviderPercent: rule.lossProviderPercent,
      lossManagerPercent: rule.lossManagerPercent,
    });
    setRuleFormOpen(true);
  };

  const onRuleProviderChange = async (providerId) => {
    if (!providerId) return;
    try {
      const { data } = await client.get(`/profit-shares/providers/${providerId}/template`);
      ruleForm.setFieldsValue({
        profitProviderPercent: data.profitProviderPercent,
        profitManagerPercent: data.profitManagerPercent,
        lossProviderPercent: data.lossProviderPercent,
        lossManagerPercent: data.lossManagerPercent,
      });
    } catch {
      /* no provider template */
    }
  };

  const onSaveRule = async (values) => {
    if (!ruleFormContext) return;
    setRuleSaving(true);
    try {
      if (ruleFormContext.mode === 'edit') {
        const memberId = ruleFormContext.memberIds[0];
        await client.put(`/profit-shares/members/${memberId}/rules/${ruleFormContext.ruleId}`, values);
        message.success('Rule updated');
      } else if (ruleFormContext.memberIds.length === 1) {
        await client.post(`/profit-shares/members/${ruleFormContext.memberIds[0]}/rules`, values);
        message.success('Rule added');
      } else {
        const { data } = await client.post('/profit-shares/members/bulk-rules', {
          memberIds: ruleFormContext.memberIds,
          ...values,
        });
        const { appliedCount, failedCount, failed } = data;
        if (appliedCount) message.success(`Rule added to ${appliedCount} member(s)`);
        if (failedCount) {
          const detail = failed
            .slice(0, 3)
            .map((f) => `${f.displayName || f.memberId}: ${f.error}`)
            .join('; ');
          message.warning(
            `${failedCount} skipped${detail ? ` — ${detail}${failedCount > 3 ? '…' : ''}` : ''}`,
            8
          );
        }
        if (!appliedCount && failedCount) {
          message.error('Rule could not be added to any selected member');
          return;
        }
        setSelectedMemberIds([]);
      }
      setRuleFormOpen(false);
      setRuleFormContext(null);
      if (manageMember) await loadMemberRules(manageMember.memberId);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRuleSaving(false);
    }
  };

  const onDeleteRule = async (ruleId) => {
    if (!manageMember) return;
    try {
      await client.delete(`/profit-shares/members/${manageMember.memberId}/rules/${ruleId}`);
      message.success('Rule removed');
      await loadMemberRules(manageMember.memberId);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const onClearMemberRules = async () => {
    if (!manageMember) return;
    try {
      await client.delete(`/profit-shares/members/${manageMember.memberId}`);
      message.success('All share rules removed');
      setManageMember(null);
      setMemberRules([]);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const pctPair = (prov, mgr) => (
    <div>
      <div>Provider {prov}% · Manager {mgr}%</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>Member keeps {Math.max(0, 100 - prov - mgr)}%</div>
    </div>
  );

  const memberCols = [
    { title: 'Member', dataIndex: 'displayName', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'PAN', dataIndex: 'pan' },
    {
      title: 'Providers',
      render: (_, r) => r.effectiveProviderName || <Tag color="error">Not set</Tag>,
    },
    {
      title: 'Rules',
      dataIndex: 'ruleCount',
      width: 120,
      render: (n, r) => (
        <Space direction="vertical" size={2}>
          {n > 0 ? <Tag color="success">{n} rule{n > 1 ? 's' : ''}</Tag> : <Tag color="warning">Required</Tag>}
          {r.hasIpoSpecificRules && <Tag color="purple" style={{ margin: 0 }}>IPO-specific</Tag>}
        </Space>
      ),
    },
    {
      title: 'On profit (default)',
      render: (_, r) => (r.hasShareRule ? pctPair(r.effectiveProfitProviderPercent, r.effectiveProfitManagerPercent) : '—'),
    },
    {
      title: 'On loss',
      render: (_, r) => (r.hasShareRule ? pctPair(r.effectiveLossProviderPercent, r.effectiveLossManagerPercent) : '—'),
    },
    {
      title: 'Actions',
      width: 200,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openAddRuleForMember(r)}>
            Add rule
          </Button>
          <Button
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={() => openManageMember(r)}
            disabled={!r.ruleCount}
          >
            Manage
          </Button>
        </Space>
      ),
    },
  ];

  const distCols = [
    { title: 'Date', dataIndex: 'distributed_at', render: (v) => new Date(v).toLocaleDateString() },
    { title: 'Member', dataIndex: 'display_name' },
    { title: 'IPO', dataIndex: 'ipo_name' },
    {
      title: 'Rule',
      dataIndex: 'pnl_type',
      render: (v) => <Tag color={v === 'LOSS' ? 'error' : 'success'}>{v === 'LOSS' ? 'Loss %' : 'Profit %'}</Tag>,
    },
    { title: 'Gross P&L', dataIndex: 'gross_profit_loss', render: (v) => (
      <span className={pnlClassName(v)}>{formatCurrency(v)}</span>
    )},
    {
      title: 'Rules applied',
      render: (_, r) => {
        const lines = r.ruleLines || [];
        if (!lines.length) return r.provider_name || '—';
        return (
          <div style={{ fontSize: 12 }}>
            {lines.map((l) => (
              <div key={l.id || `${l.ruleName}-${l.fund_provider_id}`}>
                {l.rule_name || l.ruleName}: {l.provider_name || l.providerName} ({l.provider_percent ?? l.providerPercent}%)
              </div>
            ))}
          </div>
        );
      },
    },
    { title: 'Provider share', dataIndex: 'provider_amount', render: (v) => (
      <span className={pnlClassName(v)}>{formatCurrency(v)}</span>
    )},
    { title: 'Manager share', dataIndex: 'manager_amount', render: (v) => (
      <span className={pnlClassName(v)}>{formatCurrency(v)}</span>
    )},
    { title: 'Member share', dataIndex: 'member_amount', render: (v) => (
      <span className={pnlClassName(v)}>{formatCurrency(v)}</span>
    )},
  ];

  const memberTotalCols = [
    { title: 'Member', dataIndex: 'displayName', fixed: 'left', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'PAN', dataIndex: 'pan' },
    { title: 'IPOs', dataIndex: 'ipoCount', width: 70 },
    { title: 'Gross IPO P&L', dataIndex: 'grossIpoPnL', render: renderAmt },
    { title: 'Split (gross)', dataIndex: 'grossDistributed', render: renderAmt },
    { title: 'Pending split', dataIndex: 'pendingGross', render: (v) => (Number(v) ? renderAmt(v) : '—') },
    { title: 'Provider got', dataIndex: 'providerShare', render: renderAmt },
    { title: 'Manager got', dataIndex: 'managerShare', render: renderAmt },
    { title: 'Member keeps', dataIndex: 'memberShare', render: renderAmt },
  ];

  const providerTotalCols = [
    { title: 'Fund provider', dataIndex: 'providerName', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Distributions', dataIndex: 'distributionCount', width: 110 },
    { title: 'Total share (net)', dataIndex: 'totalShare', render: renderAmt },
    { title: 'From profits', dataIndex: 'profitShare', render: renderAmt },
    { title: 'From losses', dataIndex: 'lossShare', render: renderAmt },
    { title: 'Gross P&L base', dataIndex: 'grossPnLBase', render: renderAmt },
  ];

  if (loading) return <PageLoading />;

  const totals = report?.totals || {};
  const overall = pnlTotals?.overall || {};
  const unconfiguredMembers = members.filter((m) => !m.hasShareRule);

  return (
    <div>
      <PageHeader
        title="Profit Sharing"
        subtitle="Rules can apply to all IPOs or a specific IPO. IPO-specific rules override defaults for that IPO. Combined % per scope must not exceed 100%."
        extra={
          <Button icon={<ReloadOutlined />} onClick={load}>
            Refresh
          </Button>
        }
      />

      {unconfiguredMembers.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>
          <Space>
            <WarningOutlined style={{ color: '#d97706' }} />
            <span>
              {unconfiguredMembers.length} member(s) still need share rules before you can distribute P&L.
            </span>
          </Space>
        </div>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Gross IPO P&L (all)" value={formatCurrency(overall.grossIpoPnL)} icon={<PercentageOutlined />} variant="primary" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Fund providers (share)" value={formatCurrency(overall.providerShare)} icon={<BankOutlined />} variant="info" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Manager (you)" value={formatCurrency(overall.managerShare)} icon={<UserOutlined />} variant="success" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Members (kept)" value={formatCurrency(overall.memberShare)} icon={<TeamOutlined />} variant="default" />
        </Col>
      </Row>

      <Tabs
        size="large"
        items={[
          {
            key: 'totals',
            label: 'P&L totals',
            children: (
              <ContentCard
                title="Total profit & loss by member, fund provider, or manager"
                extra={
                  <Segmented
                    value={totalsView}
                    onChange={setTotalsView}
                    options={[
                      { label: 'By member', value: 'member' },
                      { label: 'By fund provider', value: 'provider' },
                      { label: 'Manager', value: 'manager' },
                    ]}
                  />
                }
              >
                {totalsView === 'member' && (
                  <Table
                    rowKey="memberId"
                    columns={memberTotalCols}
                    dataSource={pnlTotals?.byMember || []}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: 'No allotted IPO P&L yet' }}
                    {...tableDefaults}
                  />
                )}
                {totalsView === 'provider' && (
                  <Table
                    rowKey="fundProviderId"
                    columns={providerTotalCols}
                    dataSource={pnlTotals?.byProvider || []}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: 'No provider shares recorded yet' }}
                    {...tableDefaults}
                  />
                )}
                {totalsView === 'manager' && (
                  <div style={{ maxWidth: 480 }}>
                    <Row gutter={[16, 16]}>
                      <Col span={24}>
                        <StatCard
                          title="Your total share (all IPOs)"
                          value={formatCurrency(pnlTotals?.manager?.totalShare)}
                          icon={<UserOutlined />}
                          variant={Number(pnlTotals?.manager?.totalShare) >= 0 ? 'success' : 'danger'}
                        />
                      </Col>
                      <Col span={12}>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>Gross split (distributed)</div>
                          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(overall.grossDistributed)}</div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>Pending to split</div>
                          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(overall.grossPending)}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{overall.pendingCount} application(s)</div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>IPO profit (allotted)</div>
                          <div className="amount-positive" style={{ fontSize: 18, fontWeight: 600 }}>{formatCurrency(overall.ipoProfit)}</div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>IPO loss (allotted)</div>
                          <div className="amount-negative" style={{ fontSize: 18, fontWeight: 600 }}>{formatCurrency(overall.ipoLoss)}</div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                )}
              </ContentCard>
            ),
          },
          {
            key: 'members',
            label: `Share rules (${members.length})`,
            children: (
              <ContentCard
                title="Member share rules"
                extra={
                  <Space wrap>
                    {selectedMemberIds.length > 0 ? (
                      <>
                        <span style={{ color: '#64748b' }}>{selectedMemberIds.length} selected</span>
                        <Button type="link" size="small" onClick={() => setSelectedMemberIds([])}>
                          Clear selection
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openAddRuleForSelected}>
                          Add rule to selected
                        </Button>
                      </>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>
                        Tip: select rows to add the same rule to multiple members
                      </span>
                    )}
                  </Space>
                }
              >
                <Table
                  rowKey="memberId"
                  columns={memberCols}
                  dataSource={members}
                  scroll={{ x: 1100 }}
                  rowSelection={{
                    selectedRowKeys: selectedMemberIds,
                    onChange: setSelectedMemberIds,
                  }}
                  {...tableDefaults}
                />
              </ContentCard>
            ),
          },
          {
            key: 'history',
            label: `History (${report?.distributions?.length || 0})`,
            children: (
              <ContentCard title="Distributed P&L">
                <Table rowKey="id" columns={distCols} dataSource={report?.distributions || []} scroll={{ x: 1200 }} {...tableDefaults} />
              </ContentCard>
            ),
          },
          {
            key: 'pending',
            label: `Pending (${report?.pending?.length || 0})`,
            children: (
              <ContentCard title="Alloted with P&L — not yet distributed">
                <Table
                  rowKey="id"
                  dataSource={report?.pending || []}
                  columns={[
                    { title: 'Member', dataIndex: 'display_name' },
                    { title: 'IPO', dataIndex: 'ipo_name' },
                    {
                      title: 'P&L',
                      dataIndex: 'profit_loss',
                      render: (v) => (
                        <span className={pnlClassName(v)}>
                          {formatCurrency(v)}
                          {Number(v) < 0 ? ' (loss)' : Number(v) > 0 ? ' (profit)' : ''}
                        </span>
                      ),
                    },
                  ]}
                  locale={{ emptyText: 'All caught up' }}
                  {...tableDefaults}
                />
              </ContentCard>
            ),
          },
        ]}
      />

      <Modal
        title={`Rules — ${manageMember?.displayName}`}
        open={!!manageMember}
        onCancel={() => setManageMember(null)}
        destroyOnClose
        width={720}
        footer={
          memberRules.length > 0 ? (
            <Popconfirm title="Remove all rules for this member?" onConfirm={onClearMemberRules}>
              <Button danger>Clear all rules</Button>
            </Popconfirm>
          ) : null
        }
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <Space direction="vertical" size="small">
            {rulesByScope(memberRules).map((scope) => (
              <Space key={scope.label} wrap>
                <Tag color={scope.label === 'All IPOs' ? 'default' : 'purple'}>{scope.label}</Tag>
                <Tag color={scope.profitP + scope.profitM > 100 ? 'error' : 'default'}>
                  Profit: {scope.profitP + scope.profitM}%
                </Tag>
                <Tag color={scope.lossP + scope.lossM > 100 ? 'error' : 'default'}>
                  Loss: {scope.lossP + scope.lossM}%
                </Tag>
              </Space>
            ))}
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openAddRuleForm(
              [manageMember.memberId],
              manageMember.displayName,
              memberRules.length + 1
            )}
          >
            Add another rule
          </Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={rulesLoading}
          dataSource={memberRules}
          pagination={false}
          columns={[
            { title: 'Name', dataIndex: 'ruleName' },
            {
              title: 'Applies to',
              render: (_, r) => <IpoScopeTag rule={r} />,
            },
            { title: 'Fund provider', dataIndex: 'providerName' },
            {
              title: 'On profit',
              render: (_, r) => `${r.profitProviderPercent}% / ${r.profitManagerPercent}%`,
            },
            {
              title: 'On loss',
              render: (_, r) => `${r.lossProviderPercent}% / ${r.lossManagerPercent}%`,
            },
            {
              title: '',
              width: 120,
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditRuleForm(r)} />
                  <Popconfirm title="Delete this rule?" onConfirm={() => onDeleteRule(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={
          ruleFormContext?.mode === 'edit'
            ? `Edit rule — ${ruleFormContext?.label}`
            : ruleFormContext?.memberIds?.length > 1
              ? `Add rule — ${ruleFormContext?.memberIds?.length} members`
              : `Add rule — ${ruleFormContext?.label || ''}`
        }
        open={ruleFormOpen}
        onCancel={() => { setRuleFormOpen(false); setRuleFormContext(null); }}
        footer={null}
        destroyOnClose
        width={520}
      >
        {ruleFormContext?.mode === 'create' && ruleFormContext.memberIds.length > 1 && (
          <p style={{ marginBottom: 16, color: '#64748b' }}>
            This rule will be added to each selected member (existing rules are kept).
          </p>
        )}
        <Form form={ruleForm} layout="vertical" onFinish={onSaveRule}>
          <Form.Item name="ruleName" label="Rule name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Rule 2" />
          </Form.Item>
          <Form.Item
            name="ipoId"
            label="Applies to IPO"
            extra="Leave empty for all IPOs. Pick one IPO to use this rule only for that IPO (overrides default rules for that IPO)."
          >
            <Select
              allowClear
              placeholder="All IPOs (default)"
              options={ipoOptions}
            />
          </Form.Item>
          <Form.Item name="fundProviderId" label="Fund provider" rules={[{ required: true }]}>
            <Select
              placeholder="Who receives the provider share?"
              options={providerOptions}
              onChange={onRuleProviderChange}
            />
          </Form.Item>
          <Divider orientation="left" plain>When member has profit</Divider>
          <SharePercentForm form={ruleForm} prefix="profit" />
          <Divider orientation="left" plain>When member has loss</Divider>
          <SharePercentForm form={ruleForm} prefix="loss" />
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            block
            loading={ruleSaving}
            style={{ marginTop: 8 }}
          >
            {ruleFormContext?.mode === 'edit'
              ? 'Save changes'
              : ruleFormContext?.memberIds?.length > 1
                ? `Add rule to ${ruleFormContext.memberIds.length} members`
                : 'Add rule'}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
