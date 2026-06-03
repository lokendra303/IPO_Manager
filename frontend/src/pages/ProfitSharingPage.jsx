import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Table, Button, Form, InputNumber, Input, Select, message, Modal, Tabs, Row, Col, Tag, Space, Divider, Segmented, Popconfirm,
} from 'antd';
import {
  PercentageOutlined, SaveOutlined, EditOutlined, ReloadOutlined, WarningOutlined, PlusOutlined, DeleteOutlined,
  TeamOutlined, BankOutlined, UserOutlined,
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
  const [members, setMembers] = useState([]);
  const [report, setReport] = useState(null);
  const [pnlTotals, setPnlTotals] = useState(null);
  const [totalsView, setTotalsView] = useState('member');
  const [editMember, setEditMember] = useState(null);
  const [memberRules, setMemberRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleEdit, setRuleEdit] = useState(null);
  const [ruleForm] = Form.useForm();

  const renderAmt = (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span>;

  const load = async () => {
    setLoading(true);
    try {
      const [memRes, fpRes, repRes, totalsRes] = await Promise.all([
        client.get('/profit-shares/members'),
        client.get('/fund-providers'),
        client.get('/profit-shares/report'),
        client.get('/profit-shares/totals'),
      ]);
      setMembers(memRes.data);
      setFundProviders(fpRes.data);
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
    if (m) openEditMember(m);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.editMemberId, members]);

  const providerOptions = fundProviders.map((p) => ({ value: p.id, label: p.name }));

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

  const openEditMember = async (m) => {
    setEditMember(m);
    setRuleEdit(null);
    await loadMemberRules(m.memberId);
  };

  const combinedPercents = () => {
    const profitP = memberRules.reduce((s, r) => s + Number(r.profitProviderPercent), 0);
    const profitM = memberRules.reduce((s, r) => s + Number(r.profitManagerPercent), 0);
    const lossP = memberRules.reduce((s, r) => s + Number(r.lossProviderPercent), 0);
    const lossM = memberRules.reduce((s, r) => s + Number(r.lossManagerPercent), 0);
    return { profitP, profitM, lossP, lossM };
  };

  const openAddRule = () => {
    setRuleEdit({ isNew: true });
    ruleForm.setFieldsValue({
      ruleName: `Rule ${memberRules.length + 1}`,
      fundProviderId: undefined,
      profitProviderPercent: 0,
      profitManagerPercent: 0,
      lossProviderPercent: 0,
      lossManagerPercent: 0,
    });
  };

  const openEditRule = (rule) => {
    setRuleEdit({ isNew: false, id: rule.id });
    ruleForm.setFieldsValue({
      ruleName: rule.ruleName,
      fundProviderId: rule.fundProviderId,
      profitProviderPercent: rule.profitProviderPercent,
      profitManagerPercent: rule.profitManagerPercent,
      lossProviderPercent: rule.lossProviderPercent,
      lossManagerPercent: rule.lossManagerPercent,
    });
  };

  const onSaveRule = async (values) => {
    if (!editMember) return;
    try {
      if (ruleEdit?.isNew) {
        await client.post(`/profit-shares/members/${editMember.memberId}/rules`, values);
        message.success('Rule added');
      } else {
        await client.put(`/profit-shares/members/${editMember.memberId}/rules/${ruleEdit.id}`, values);
        message.success('Rule updated');
      }
      setRuleEdit(null);
      await loadMemberRules(editMember.memberId);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const onDeleteRule = async (ruleId) => {
    try {
      await client.delete(`/profit-shares/members/${editMember.memberId}/rules/${ruleId}`);
      message.success('Rule removed');
      await loadMemberRules(editMember.memberId);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const onClearMemberRules = async () => {
    try {
      await client.delete(`/profit-shares/members/${editMember.memberId}`);
      message.success('All share rules removed');
      setEditMember(null);
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
      width: 90,
      render: (n, r) => (
        n > 0 ? <Tag color="success">{n} rule{n > 1 ? 's' : ''}</Tag> : <Tag color="warning">Required</Tag>
      ),
    },
    {
      title: 'On profit',
      render: (_, r) => (r.hasShareRule ? pctPair(r.effectiveProfitProviderPercent, r.effectiveProfitManagerPercent) : '—'),
    },
    {
      title: 'On loss',
      render: (_, r) => (r.hasShareRule ? pctPair(r.effectiveLossProviderPercent, r.effectiveLossManagerPercent) : '—'),
    },
    {
      title: '',
      render: (_, r) => (
        <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEditMember(r)}>
          Edit
        </Button>
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
        subtitle="Each member can have multiple share rules (e.g. different fund providers). Combined % across all rules must not exceed 100% on profit or on loss."
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
              <ContentCard title="Member share rules">
                <Table rowKey="memberId" columns={memberCols} dataSource={members} scroll={{ x: 1000 }} {...tableDefaults} />
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
        title={`Share rules — ${editMember?.displayName}`}
        open={!!editMember}
        onCancel={() => { setEditMember(null); setRuleEdit(null); }}
        footer={null}
        destroyOnClose
        width={720}
      >
        {(() => {
          const { profitP, profitM, lossP, lossM } = combinedPercents();
          return (
            <div style={{ marginBottom: 12 }}>
              <Space wrap>
                <KeepsTag provider={profitP} manager={profitM} />
                <Tag color={profitP + profitM > 100 ? 'error' : 'default'}>Profit total: {profitP + profitM}%</Tag>
                <Tag color={lossP + lossM > 100 ? 'error' : 'default'}>Loss total: {lossP + lossM}%</Tag>
              </Space>
            </div>
          );
        })()}
        <Table
          rowKey="id"
          size="small"
          loading={rulesLoading}
          dataSource={memberRules}
          pagination={false}
          locale={{ emptyText: 'No rules yet — add one below' }}
          columns={[
            { title: 'Name', dataIndex: 'ruleName' },
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
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditRule(r)} />
                  <Popconfirm title="Delete this rule?" onConfirm={() => onDeleteRule(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddRule}>
            Add rule
          </Button>
          {memberRules.length > 0 && (
            <Popconfirm title="Remove all rules for this member?" onConfirm={onClearMemberRules}>
              <Button danger>Clear all</Button>
            </Popconfirm>
          )}
        </Space>
      </Modal>

      <Modal
        title={ruleEdit?.isNew ? 'Add share rule' : 'Edit share rule'}
        open={!!ruleEdit}
        onCancel={() => setRuleEdit(null)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Form form={ruleForm} layout="vertical" onFinish={onSaveRule}>
          <Form.Item name="ruleName" label="Rule name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Provider A share" />
          </Form.Item>
          <Form.Item name="fundProviderId" label="Fund provider" rules={[{ required: true }]}>
            <Select placeholder="Who receives the provider share?" options={providerOptions} />
          </Form.Item>
          <Divider orientation="left" plain>When this member has profit</Divider>
          <SharePercentForm form={ruleForm} prefix="profit" />
          <Divider orientation="left" plain>When this member has loss</Divider>
          <SharePercentForm form={ruleForm} prefix="loss" />
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} block style={{ marginTop: 8 }}>
            Save rule
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
