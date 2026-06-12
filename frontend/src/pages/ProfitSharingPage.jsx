import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Table, Button, Form, InputNumber, Input, Select, message, Modal, Tabs, Row, Col, Tag, Space, Divider, Segmented, Popconfirm, Typography, Dropdown, Alert,
} from 'antd';
import {
  PercentageOutlined, SaveOutlined, EditOutlined, ReloadOutlined, WarningOutlined, PlusOutlined, DeleteOutlined,
  TeamOutlined, BankOutlined, UserOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
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

function normalizeProviderId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeTemplateId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeMemberIds(ids) {
  return [...new Set((ids || []).map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0))];
}

/** null = all IPOs; number = specific IPO */
function normalizeIpoScope(ipoId) {
  if (ipoId == null || ipoId === '') return null;
  const n = Number(ipoId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function IpoScopeSelect({ value, onChange, placeholder = 'All IPOs (default)', options, ...rest }) {
  const scoped = normalizeIpoScope(value);
  return (
    <Select
      allowClear
      placeholder={placeholder}
      options={options}
      value={scoped}
      onChange={(v) => onChange(v == null ? null : Number(v))}
      onClear={() => onChange(null)}
      {...rest}
    />
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
          <Form.Item
            name={`${prefix}ManagerPercent`}
            label="Manager (you) %"
            rules={[{ required: true }]}
            extra="Your cut only — member share is the remainder below."
          >
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
  const [ruleTemplates, setRuleTemplates] = useState([]);
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
  const [templateApplyOpen, setTemplateApplyOpen] = useState(false);
  const [templateApplyContext, setTemplateApplyContext] = useState(null);
  const [templateApplyForm] = Form.useForm();
  const [ruleListEditOpen, setRuleListEditOpen] = useState(false);
  const [ruleListEdit, setRuleListEdit] = useState(null);
  const [ruleListForm] = Form.useForm();
  const [bulkTemplateId, setBulkTemplateId] = useState(null);
  const [bulkTemplateIpoId, setBulkTemplateIpoId] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState('members');
  const [membersFilter, setMembersFilter] = useState('all');

  const renderAmt = (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span>;

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [memRes, fpRes, ipoRes, repRes, totalsRes, templatesRes] = await Promise.all([
        client.get('/profit-shares/members'),
        client.get('/fund-providers'),
        client.get('/ipos'),
        client.get('/profit-shares/report'),
        client.get('/profit-shares/totals'),
        client.get('/profit-shares/rule-templates'),
      ]);
      setMembers(memRes.data);
      setFundProviders(fpRes.data);
      setRuleTemplates(templatesRes.data);
      setIpos(ipoRes.data);
      setReport(repRes.data);
      setPnlTotals(totalsRes.data);
      return memRes.data;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshAfterRuleChange = async () => {
    setActiveTabKey('members');
    await load({ silent: true });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const editId = location.state?.editMemberId;
    if (!editId || !members.length) return;
    const m = members.find((x) => x.memberId === editId);
    if (m) {
      setActiveTabKey('members');
      openManageMember(m);
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.editMemberId, members]);

  const providerOptions = fundProviders.map((p) => ({ value: p.id, label: p.name }));
  const ipoOptions = ipos.map((i) => ({ value: i.id, label: i.name }));

  const templateCatalog = useMemo(() => {
    const byId = new Map();
    for (const t of ruleTemplates) {
      if (t.hasRule) byId.set(t.id, t);
    }
    for (const m of members) {
      for (const rule of m.rules || []) {
        const fpId = normalizeProviderId(rule.fundProviderId);
        if (!fpId) continue;
        const key = `member-${m.memberId}-${rule.id}`;
        if ([...byId.values()].some((x) => x.fundProviderId === fpId
          && x.profitProviderPercent === rule.profitProviderPercent)) continue;
        byId.set(key, {
          id: key,
          fundProviderId: fpId,
          providerName: rule.providerName,
          ruleName: rule.ruleName || rule.providerName,
          profitProviderPercent: rule.profitProviderPercent,
          profitManagerPercent: rule.profitManagerPercent,
          lossProviderPercent: rule.lossProviderPercent,
          lossManagerPercent: rule.lossManagerPercent,
          hasRule: true,
          fromMember: true,
        });
      }
    }
    return byId;
  }, [ruleTemplates, members]);

  const templateRuleOptions = useMemo(
    () => ruleTemplates
      .filter((t) => t.hasRule)
      .map((t) => ({
        value: t.id,
        label: `${t.ruleName} (${t.providerName}) — P ${t.profitProviderPercent}/${t.profitManagerPercent}% · L ${t.lossProviderPercent}/${t.lossManagerPercent}%`,
      })),
    [ruleTemplates]
  );

  const getTemplateById = (templateId) => {
    const id = normalizeTemplateId(templateId);
    if (id) {
      const saved = ruleTemplates.find((t) => t.id === id);
      if (saved) return saved;
    }
    return templateCatalog.get(templateId) ?? null;
  };

  const buildApplyRuleMenu = (memberId, displayName, afterApply) => ({
    items: templateRuleOptions.map((o) => ({
      key: String(o.value),
      label: o.label,
    })),
    onClick: async ({ key }) => {
      const templateId = normalizeTemplateId(key) ?? key;
      if (!templateId) return;
      await onQuickApplyTemplate(templateId, memberId, displayName);
      if (afterApply) await afterApply();
    },
  });

  const applyTemplateToMembers = async (templateId, memberIds, ipoId, ruleName) => {
    const tpl = getTemplateById(templateId);
    if (!tpl) {
      throw new Error('Select a rule from the Rule list tab or use a provider already set on a member');
    }
    const fundProviderId = normalizeProviderId(tpl.fundProviderId);
    if (!fundProviderId) throw new Error('Rule has no fund provider');
    const payload = {
      ruleName: ruleName || tpl.ruleName || `${tpl.providerName} share`,
      fundProviderId,
      ipoId: normalizeIpoScope(ipoId),
      profitProviderPercent: tpl.profitProviderPercent,
      profitManagerPercent: tpl.profitManagerPercent,
      lossProviderPercent: tpl.lossProviderPercent,
      lossManagerPercent: tpl.lossManagerPercent,
    };
    if (memberIds.length === 1) {
      await client.post(`/profit-shares/members/${memberIds[0]}/rules`, payload);
      return { appliedCount: 1, failedCount: 0 };
    }
    const { data } = await client.post('/profit-shares/members/bulk-rules', {
      memberIds,
      ...payload,
    });
    return data;
  };

  const openApplyTemplate = (memberIds, label) => {
    if (!templateRuleOptions.length) {
      message.warning('Add share % in the Rule list tab first');
      return;
    }
    setTemplateApplyContext({ memberIds, label });
    templateApplyForm.resetFields();
    templateApplyForm.setFieldsValue({
      templateId: bulkTemplateId ?? undefined,
      ipoId: bulkTemplateIpoId,
    });
    setTemplateApplyOpen(true);
  };

  const onApplyTemplateSubmit = async (values) => {
    if (!templateApplyContext) return;
    const templateId = normalizeTemplateId(values.templateId) ?? values.templateId;
    if (!templateId) {
      message.warning('Select a rule from the list');
      return;
    }
    setRuleSaving(true);
    try {
      const memberIds = normalizeMemberIds(templateApplyContext.memberIds);
      const data = await applyTemplateToMembers(
        templateId,
        memberIds,
        normalizeIpoScope(values.ipoId),
        values.ruleName
      );
      const { appliedCount, failedCount, failed } = data;
      if (appliedCount) {
        message.success(`Rule applied to ${appliedCount} member(s)`);
      }
      if (failedCount) {
        message.warning(`${failedCount} skipped — ${failed?.[0]?.error || 'see details'}`, 6);
      }
      if (!appliedCount && failedCount) {
        message.error('Rule could not be applied');
        return;
      }
      setTemplateApplyOpen(false);
      setTemplateApplyContext(null);
      setSelectedMemberIds([]);
      if (manageMember && templateApplyContext.memberIds.includes(manageMember.memberId)) {
        await loadMemberRules(manageMember.memberId);
      }
      refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRuleSaving(false);
    }
  };

  const onQuickApplyTemplate = async (templateId, memberId, displayName) => {
    if (!templateId) return;
    const tpl = getTemplateById(templateId);
    setRuleSaving(true);
    try {
      await applyTemplateToMembers(templateId, [memberId], undefined);
      message.success(`"${tpl?.ruleName || tpl?.providerName || 'Rule'}" applied to ${displayName}`);
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRuleSaving(false);
    }
  };

  const openAddRuleTemplate = () => {
    if (!fundProviders.length) {
      message.warning('Add a fund provider first (Fund Providers page)');
      return;
    }
    setRuleListEdit({ mode: 'create' });
    ruleListForm.setFieldsValue({
      ruleName: '',
      fundProviderId: undefined,
      profitProviderPercent: 0,
      profitManagerPercent: 0,
      lossProviderPercent: 0,
      lossManagerPercent: 0,
    });
    setRuleListEditOpen(true);
  };

  const openEditRuleTemplate = (row) => {
    setRuleListEdit({ mode: 'edit', id: row.id });
    ruleListForm.setFieldsValue({
      ruleName: row.ruleName,
      fundProviderId: row.fundProviderId,
      profitProviderPercent: row.profitProviderPercent ?? 0,
      profitManagerPercent: row.profitManagerPercent ?? 0,
      lossProviderPercent: row.lossProviderPercent ?? 0,
      lossManagerPercent: row.lossManagerPercent ?? 0,
    });
    setRuleListEditOpen(true);
  };

  const onSaveRuleTemplate = async (values) => {
    if (!ruleListEdit) return;
    setRuleSaving(true);
    try {
      if (ruleListEdit.mode === 'create') {
        await client.post('/profit-shares/rule-templates', values);
        message.success('Rule added to list');
      } else {
        await client.put(`/profit-shares/rule-templates/${ruleListEdit.id}`, values);
        message.success('Rule updated');
      }
      setRuleListEditOpen(false);
      setRuleListEdit(null);
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRuleSaving(false);
    }
  };

  const onDeleteRuleTemplate = async (templateId) => {
    try {
      await client.delete(`/profit-shares/rule-templates/${templateId}`);
      message.success('Rule removed from list');
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const onApplyToNextMember = async () => {
    const templateId = normalizeTemplateId(bulkTemplateId) ?? bulkTemplateId;
    if (!templateId) {
      message.warning('Select a rule from the list first');
      return;
    }
    const next = members.find((m) => !m.hasShareRule);
    if (!next) {
      message.info('Every member already has a share rule');
      return;
    }
    await onQuickApplyTemplate(templateId, next.memberId, next.displayName);
  };

  const onApplySelectedOneByOne = async () => {
    const templateId = normalizeTemplateId(bulkTemplateId) ?? bulkTemplateId;
    const memberIds = normalizeMemberIds(selectedMemberIds);
    if (!templateId) {
      message.warning('Select a rule from the list first');
      return;
    }
    if (!memberIds.length) {
      message.warning('Select one or more members in the table');
      return;
    }
    const tpl = getTemplateById(templateId);
    setActiveTabKey('members');
    setRuleSaving(true);
    let applied = 0;
    let failed = 0;
    const errors = [];
    try {
      for (const memberId of memberIds) {
        const m = members.find((x) => x.memberId === memberId);
        try {
          await applyTemplateToMembers(templateId, [memberId], bulkTemplateIpoId);
          applied += 1;
        } catch (err) {
          failed += 1;
          errors.push(`${m?.displayName || memberId}: ${getErrorMessage(err)}`);
        }
      }
      await load({ silent: true });
      if (applied) {
        message.success(
          `"${tpl?.ruleName || tpl?.providerName || 'Rule'}" applied to ${applied} member(s) one by one`
        );
      }
      if (failed) {
        message.warning(`${failed} failed — ${errors[0] || 'see console'}`, 6);
      }
      if (!applied && failed) message.error('No members were updated');
      if (applied) setSelectedMemberIds([]);
    } finally {
      setRuleSaving(false);
    }
  };

  const onBulkApplyFromToolbar = async () => {
    const templateId = normalizeTemplateId(bulkTemplateId) ?? bulkTemplateId;
    const memberIds = normalizeMemberIds(selectedMemberIds);
    if (!templateId) {
      message.warning('Select a rule from the list');
      return;
    }
    if (!memberIds.length) {
      message.warning('Select one or more members in the table');
      return;
    }
    const tpl = getTemplateById(templateId);
    setRuleSaving(true);
    try {
      const data = await applyTemplateToMembers(templateId, memberIds, bulkTemplateIpoId);
      if (data.appliedCount) {
        message.success(
          `"${tpl?.ruleName || tpl?.providerName || 'Rule'}" applied to ${data.appliedCount} member(s)`
        );
      }
      if (data.failedCount) {
        const detail = data.failed?.[0]?.error;
        message.warning(
          `${data.failedCount} member(s) skipped${detail ? ` — ${detail}` : ''}`,
          6
        );
      }
      if (!data.appliedCount && data.failedCount) {
        message.error('Rule could not be applied to any selected member');
        return;
      }
      setSelectedMemberIds([]);
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRuleSaving(false);
    }
  };

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
    ipoId: null,
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
    openApplyTemplate([m.memberId], m.displayName);
  };

  const openBulkApplyForSelected = () => {
    const memberIds = normalizeMemberIds(selectedMemberIds);
    if (!memberIds.length) {
      message.warning('Select one or more members in the table');
      return;
    }
    const selected = members.filter((m) => memberIds.includes(m.memberId));
    const label = selected.length === 1
      ? selected[0].displayName
      : `${selected.length} members`;
    openApplyTemplate(memberIds, label);
  };

  const openCustomRuleForMember = (m) => {
    openAddRuleForm([m.memberId], m.displayName, (m.ruleCount || 0) + 1);
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
      ipoId: rule.ipoId ?? null,
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
    const fromList = ruleTemplates.find((t) => t.fundProviderId === providerId && t.hasRule);
    if (fromList) {
      ruleForm.setFieldsValue({
        profitProviderPercent: fromList.profitProviderPercent,
        profitManagerPercent: fromList.profitManagerPercent,
        lossProviderPercent: fromList.lossProviderPercent,
        lossManagerPercent: fromList.lossManagerPercent,
      });
      return;
    }
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

  const rulePayloadFromValues = (values) => ({
    ...values,
    ipoId: normalizeIpoScope(values.ipoId),
  });

  const onSaveRule = async (values) => {
    if (!ruleFormContext) return;
    const payload = rulePayloadFromValues(values);
    setRuleSaving(true);
    try {
      if (ruleFormContext.mode === 'edit') {
        const memberId = ruleFormContext.memberIds[0];
        await client.put(`/profit-shares/members/${memberId}/rules/${ruleFormContext.ruleId}`, payload);
        message.success('Rule updated');
      } else if (ruleFormContext.memberIds.length === 1) {
        await client.post(`/profit-shares/members/${ruleFormContext.memberIds[0]}/rules`, payload);
        message.success('Rule added');
      } else {
        const { data } = await client.post('/profit-shares/members/bulk-rules', {
          memberIds: ruleFormContext.memberIds,
          ...payload,
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
      await refreshAfterRuleChange();
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
      await refreshAfterRuleChange();
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
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const pctSummary = (prov, mgr) => (
    <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
      {prov}% / {mgr}% <Typography.Text type="secondary">(keeps {Math.max(0, 100 - prov - mgr)}%)</Typography.Text>
    </span>
  );

  const memberCols = [
    {
      title: 'Member',
      dataIndex: 'displayName',
      width: 160,
      fixed: 'left',
      render: (v, r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {r.effectiveProviderName && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Fund provider: {r.effectiveProviderName}
            </div>
          )}
          {!r.effectiveProviderName && r.memberFundProviderName && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Default on profile: {r.memberFundProviderName}
            </div>
          )}
        </div>
      ),
    },
    { title: 'PAN', dataIndex: 'pan', width: 108, render: (v) => formatPan(v) || '—' },
    {
      title: 'Rules',
      width: 88,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.ruleCount > 0 ? (
            <Tag color="success">{r.ruleCount}</Tag>
          ) : (
            <Tag color="warning">Need rule</Tag>
          )}
          {r.hasIpoSpecificRules && <Tag color="purple">IPO</Tag>}
        </Space>
      ),
    },
    {
      title: 'Profit %',
      width: 168,
      render: (_, r) => (r.hasShareRule
        ? pctSummary(r.effectiveProfitProviderPercent, r.effectiveProfitManagerPercent)
        : '—'),
    },
    {
      title: 'Loss %',
      width: 168,
      render: (_, r) => (r.hasShareRule
        ? pctSummary(r.effectiveLossProviderPercent, r.effectiveLossManagerPercent)
        : '—'),
    },
    {
      title: 'Actions',
      width: 220,
      render: (_, r) => (
        <Space size="small" wrap className="profit-share-row-actions">
          <Dropdown
            disabled={!templateRuleOptions.length || ruleSaving}
            menu={buildApplyRuleMenu(r.memberId, r.displayName)}
          >
            <Button size="small" type="primary" loading={ruleSaving}>
              Apply rule
            </Button>
          </Dropdown>
          <Button size="small" type="link" onClick={() => openCustomRuleForMember(r)}>
            Custom
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
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
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
  const filteredMembers = membersFilter === 'needs-rule'
    ? members.filter((m) => !m.hasShareRule)
    : members;

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
        activeKey={activeTabKey}
        onChange={setActiveTabKey}
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
                      <Col xs={24} sm={12}>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>Gross split (distributed)</div>
                          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(overall.grossDistributed)}</div>
                        </div>
                      </Col>
                      <Col xs={24} sm={12}>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>Pending to split</div>
                          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(overall.grossPending)}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{overall.pendingCount} application(s)</div>
                        </div>
                      </Col>
                      <Col xs={24} sm={12}>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 12 }}>IPO profit (allotted)</div>
                          <div className="amount-positive" style={{ fontSize: 18, fontWeight: 600 }}>{formatCurrency(overall.ipoProfit)}</div>
                        </div>
                      </Col>
                      <Col xs={24} sm={12}>
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
            key: 'rule-list',
            label: `Rule list (${ruleTemplates.length})`,
            children: (
              <ContentCard
                title="Share rule list"
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAddRuleTemplate}>
                    Add rule
                  </Button>
                }
              >
                <Table
                  rowKey="id"
                  dataSource={ruleTemplates}
                  pagination={false}
                  columns={[
                    {
                      title: 'Rule name',
                      dataIndex: 'ruleName',
                      width: 160,
                      render: (v, r) => (
                        <div>
                          <strong>{v || r.providerName}</strong>
                          {r.hasRule && v && v !== r.providerName && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>{r.providerName}</div>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: 'Fund provider',
                      dataIndex: 'providerName',
                      width: 130,
                      render: (v) => v || '—',
                    },
                    {
                      title: 'On profit',
                      render: (_, r) => (r.hasRule
                        ? `${r.profitProviderPercent}% provider · ${r.profitManagerPercent}% manager`
                        : <Tag color="warning">Not set</Tag>),
                    },
                    {
                      title: 'On loss',
                      render: (_, r) => (r.hasRule
                        ? `${r.lossProviderPercent}% provider · ${r.lossManagerPercent}% manager`
                        : '—'),
                    },
                    {
                      title: '',
                      width: 140,
                      render: (_, r) => (
                        <Space size="small">
                          <Button size="small" icon={<EditOutlined />} onClick={() => openEditRuleTemplate(r)}>
                            Edit
                          </Button>
                          <Popconfirm
                            title="Delete this rule from the list?"
                            onConfirm={() => onDeleteRuleTemplate(r.id)}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                  locale={{ emptyText: 'No rules yet — click Add rule' }}
                  {...tableDefaults}
                />
              </ContentCard>
            ),
          },
          {
            key: 'members',
            label: `Share rules (${members.length})`,
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Fund provider is part of each share rule"
                  description="This is who gets the provider % when IPO profit/loss is split — not who receives IPO distribute money (see Sub-groups for bulk pay to owner). Pick a rule from the list; the provider is inside that rule."
                />
                {!templateRuleOptions.length && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="No rules in the rule list yet"
                    description="Open the Rule list tab, set profit/loss % for each fund provider (e.g. Sagar Gupta). Then apply those rules to members here."
                  />
                )}
                <ContentCard
                  title="Member share rules"
                  extra={
                    <div className="profit-share-toolbar profit-share-toolbar--stacked">
                      <Typography.Text strong className="profit-share-toolbar__label">
                        Apply rule
                      </Typography.Text>
                      <Select
                        placeholder="Rule from list"
                        className="profit-share-toolbar__rule"
                        allowClear
                        value={bulkTemplateId}
                        onChange={(v) => setBulkTemplateId(normalizeTemplateId(v) ?? v)}
                        options={templateRuleOptions}
                        disabled={!templateRuleOptions.length}
                        showSearch
                        optionFilterProp="label"
                      />
                      <IpoScopeSelect
                        placeholder="All IPOs"
                        className="profit-share-toolbar__ipo"
                        value={bulkTemplateIpoId}
                        onChange={setBulkTemplateIpoId}
                        options={ipoOptions}
                      />
                      <Space wrap className="profit-share-toolbar__actions">
                        {normalizeMemberIds(selectedMemberIds).length > 0 && (
                          <>
                            <Typography.Text type="secondary">
                              {normalizeMemberIds(selectedMemberIds).length} selected
                            </Typography.Text>
                            <Button type="link" size="small" onClick={() => setSelectedMemberIds([])}>
                              Clear
                            </Button>
                          </>
                        )}
                        <Button
                          loading={ruleSaving}
                          disabled={!bulkTemplateId}
                          onClick={onApplyToNextMember}
                        >
                          Apply to next member
                        </Button>
                        <Button
                          loading={ruleSaving}
                          disabled={
                            !bulkTemplateId
                            || !normalizeMemberIds(selectedMemberIds).length
                          }
                          onClick={onApplySelectedOneByOne}
                        >
                          Apply one by one (selected)
                        </Button>
                        <Button
                          type="primary"
                          loading={ruleSaving}
                          disabled={
                            !bulkTemplateId
                            || !normalizeMemberIds(selectedMemberIds).length
                          }
                          onClick={onBulkApplyFromToolbar}
                        >
                          Bulk apply (all at once)
                        </Button>
                        <Button
                          disabled={!normalizeMemberIds(selectedMemberIds).length}
                          onClick={openBulkApplyForSelected}
                        >
                          Options…
                        </Button>
                      </Space>
                      <Typography.Text type="secondary" className="profit-share-toolbar__hint">
                        Or use <strong>Apply rule</strong> on each row. This tab stays open after each apply.
                      </Typography.Text>
                    </div>
                  }
                >
                  <div style={{ marginBottom: 12 }}>
                    <Segmented
                      value={membersFilter}
                      onChange={setMembersFilter}
                      options={[
                        { label: `All members (${members.length})`, value: 'all' },
                        { label: `Need rule (${unconfiguredMembers.length})`, value: 'needs-rule' },
                      ]}
                    />
                  </div>
                  <Table
                    rowKey="memberId"
                    className="profit-share-members-table"
                    columns={memberCols}
                    dataSource={filteredMembers}
                    scroll={{ x: 1000 }}
                    rowSelection={{
                      selectedRowKeys: selectedMemberIds,
                      onChange: (keys) => setSelectedMemberIds(normalizeMemberIds(keys)),
                      selections: [
                        Table.SELECTION_ALL,
                        Table.SELECTION_INVERT,
                        Table.SELECTION_NONE,
                      ],
                    }}
                    {...tableDefaults}
                  />
                </ContentCard>
              </>
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
        {manageMember && (
        <>
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
          <Space wrap>
            <Dropdown
              disabled={!templateRuleOptions.length || ruleSaving}
              menu={buildApplyRuleMenu(
                manageMember.memberId,
                manageMember.displayName,
                () => loadMemberRules(manageMember.memberId)
              )}
            >
              <Button type="primary" icon={<PlusOutlined />} loading={ruleSaving}>
                Apply from list
              </Button>
            </Dropdown>
            <Button type="link" onClick={() => openAddRuleForm([manageMember.memberId], manageMember.displayName, memberRules.length + 1)}>
              Custom rule
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          loading={rulesLoading}
          dataSource={memberRules}
          {...tableDefaults}
          size="small"
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
        </>
        )}
      </Modal>

      <Modal
        title={`Apply rule — ${templateApplyContext?.label || ''}`}
        open={templateApplyOpen}
        onCancel={() => { setTemplateApplyOpen(false); setTemplateApplyContext(null); }}
        onOk={() => templateApplyForm.submit()}
        confirmLoading={ruleSaving}
        destroyOnClose
        width={480}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Pick a rule from the list (configured under Rule list tab). IPO scope is optional.
        </Typography.Paragraph>
        <Form form={templateApplyForm} layout="vertical" onFinish={onApplyTemplateSubmit}>
          <Form.Item
            name="templateId"
            label="Rule from list"
            rules={[{ required: true, message: 'Select a rule' }]}
          >
            <Select placeholder="Pick a saved rule" options={templateRuleOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="ipoId" label="Applies to IPO" extra="Leave empty for all IPOs">
            <IpoScopeSelect options={ipoOptions} placeholder="All IPOs" />
          </Form.Item>
          <Form.Item name="ruleName" label="Rule name (optional)">
            <Input placeholder="Auto from provider name" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={ruleListEdit?.mode === 'edit' ? `Edit rule — ${ruleListEdit?.ruleName || ''}` : 'Add rule to list'}
        open={ruleListEditOpen}
        onCancel={() => { setRuleListEditOpen(false); setRuleListEdit(null); }}
        onOk={() => ruleListForm.submit()}
        confirmLoading={ruleSaving}
        destroyOnClose
        width={480}
      >
        <Form form={ruleListForm} layout="vertical" onFinish={onSaveRuleTemplate}>
          <Form.Item
            name="ruleName"
            label="Rule name"
            rules={[{ required: true, message: 'Enter a rule name' }]}
            extra="Shown in the rule list and when applying to members (e.g. Sagar standard, Sagar HNI)."
          >
            <Input placeholder="Rule name" />
          </Form.Item>
          <Form.Item
            name="fundProviderId"
            label="Fund provider"
            rules={[{ required: true, message: 'Select fund provider' }]}
          >
            <Select
              placeholder="Who receives the provider share?"
              options={providerOptions}
              disabled={ruleListEdit?.mode === 'edit'}
            />
          </Form.Item>
          <Divider orientation="left" plain>When member has profit</Divider>
          <SharePercentForm form={ruleListForm} prefix="profit" />
          <Divider orientation="left" plain>When member has loss</Divider>
          <SharePercentForm form={ruleListForm} prefix="loss" />
        </Form>
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
            <IpoScopeSelect options={ipoOptions} />
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
