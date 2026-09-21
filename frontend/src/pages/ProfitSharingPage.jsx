import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Table, Button, Form, InputNumber, Input, Select, message, Modal, Tag, Space, Divider, Segmented, Popconfirm, Typography, Dropdown, Alert, Checkbox,
} from 'antd';
import {
  SaveOutlined, EditOutlined, ReloadOutlined, WarningOutlined, PlusOutlined, DeleteOutlined,
  UnorderedListOutlined, DownOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

const AVATAR_TONES = ['teal', 'slate', 'blue', 'amber', 'rose', 'violet'];

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}

function avatarTone(id) {
  return AVATAR_TONES[Math.abs(Number(id) || 0) % AVATAR_TONES.length];
}

function memberKeep(provider, manager) {
  return Math.max(0, 100 - (Number(provider) || 0) - (Number(manager) || 0));
}

function SplitBar({ provider, manager, compact, label }) {
  const p = Number(provider) || 0;
  const g = Number(manager) || 0;
  const mem = memberKeep(p, g);
  const overflow = p + g > 100;
  const segs = [
    { key: 'provider', pct: p, name: 'Provider' },
    { key: 'member', pct: mem, name: 'Member' },
    { key: 'manager', pct: g, name: 'You' },
  ];
  return (
    <div className={`pshare-split${compact ? ' pshare-split--compact' : ''}${overflow ? ' is-over' : ''}`}>
      {label ? <div className="pshare-split-kicker">{label}</div> : null}
      <div className="pshare-split-chips">
        {segs.map((s) => (
          <span key={s.key} className={`pshare-chip pshare-chip--${s.key}`}>
            {s.name} <b>{s.pct}%</b>
          </span>
        ))}
      </div>
      <div className="pshare-split-track" role="img" aria-label={segs.map((s) => `${s.name} ${s.pct}%`).join(', ')}>
        {segs.map((s) => (
          s.pct > 0 ? (
            <span
              key={s.key}
              className={`pshare-split-seg pshare-split-seg--${s.key}`}
              style={{ flexGrow: s.pct, flexBasis: 0 }}
            />
          ) : null
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone = 'neutral', active, onClick }) {
  return (
    <button
      type="button"
      className={`dash-kpi-a mem-kpi-btn${active ? ' is-on' : ''}`}
      onClick={onClick}
    >
      <article className={`dash-kpi dash-kpi--${tone}`}>
        <span className="dash-kpi-label">{label}</span>
        <strong className="dash-kpi-value">{value}</strong>
        {hint ? <span className="dash-kpi-hint">{hint}</span> : null}
      </article>
    </button>
  );
}

function RuleOption({ rule, compact }) {
  if (!rule) return compact ? <span className="pshare-opt-placeholder">Pick a rule</span> : null;
  const profitMember = memberKeep(rule.profitProviderPercent, rule.profitManagerPercent);
  const lossMember = memberKeep(rule.lossProviderPercent, rule.lossManagerPercent);
  const title = rule.ruleName || rule.providerName || 'Rule';
  return (
    <div className={`pshare-opt${compact ? ' pshare-opt--compact' : ''}`}>
      <div className="pshare-opt-copy">
        <strong>{title}</strong>
        {!compact && rule.providerName && rule.providerName !== title ? (
          <span>{rule.providerName}</span>
        ) : null}
      </div>
      <div className="pshare-opt-stats">
        <span className="pshare-opt-stat">
          Profit <b>{rule.profitProviderPercent} / {profitMember} / {rule.profitManagerPercent}</b>
        </span>
        <span className="pshare-opt-stat pshare-opt-stat--loss">
          Loss <b>{rule.lossProviderPercent} / {lossMember} / {rule.lossManagerPercent}</b>
        </span>
      </div>
    </div>
  );
}

function ruleSelectProps(rules) {
  return {
    optionRender: (option) => <RuleOption rule={option.data?.rule || option.rule} />,
    labelRender: (props) => {
      if (props.value == null || props.value === '') return props.label;
      const rule = rules.find((t) => Number(t.id) === Number(props.value));
      return rule ? <RuleOption rule={rule} compact /> : props.label;
    },
    popupClassName: 'pshare-rule-dropdown',
    listHeight: 360,
    optionFilterProp: 'label',
    showSearch: true,
  };
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
      <div className="pshare-percent-fields">
        <Form.Item name={`${prefix}ProviderPercent`} label="Provider %" rules={[{ required: true }]}>
          <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
        </Form.Item>
        <Form.Item
          name={`${prefix}ManagerPercent`}
          label="Manager (you) %"
          rules={[{ required: true }]}
          extra="Your cut only — member share is the remainder below."
        >
          <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
        </Form.Item>
      </div>
      <Form.Item shouldUpdate>
        {() => {
          const provider = form.getFieldValue(`${prefix}ProviderPercent`);
          const manager = form.getFieldValue(`${prefix}ManagerPercent`);
          const over = Number(provider || 0) + Number(manager || 0) > 100;
          return (
            <div className="pshare-form-preview">
              <SplitBar provider={provider} manager={manager} />
              {over ? (
                <Tag color="error">Provider + manager cannot exceed 100%</Tag>
              ) : (
                <span className="pshare-keep">Member keeps {memberKeep(provider, manager)}%</span>
              )}
            </div>
          );
        }}
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
    if (editId && members.length) {
      const m = members.find((x) => x.memberId === editId);
      if (m) {
        setActiveTabKey('members');
        openManageMember(m);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.editMemberId, members]);

  useEffect(() => {
    const presetIpoId = location.state?.presetIpoId;
    if (!presetIpoId) return;
    setBulkTemplateIpoId(Number(presetIpoId));
    setActiveTabKey('members');
    message.info(
      `Configure share rules for ${location.state?.presetIpoName || 'this IPO'} — choose IPO scope when adding rules`
    );
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.presetIpoId]);

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
        label: `${t.ruleName || ''} ${t.providerName || ''}`.trim(),
        rule: t,
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
    className: 'pshare-apply-menu',
    items: templateRuleOptions.map((o) => ({
      key: String(o.value),
      label: <RuleOption rule={o.rule} />,
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
    for (const r of rules.filter((x) => x.isActive !== false)) {
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

  const onActivateRule = async (ruleId) => {
    if (!manageMember) return;
    try {
      await client.post(`/profit-shares/members/${manageMember.memberId}/rules/${ruleId}/activate`);
      message.success('Rule set as active for this IPO scope');
      await loadMemberRules(manageMember.memberId);
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
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

  const onRevokeProfitSplit = async (applicationId) => {
    try {
      await client.post('/profit-shares/revoke', { applicationId });
      message.success('P&L split revoked — wallet and provider accruals reversed');
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const onResplitProfit = async (applicationId) => {
    try {
      const { data } = await client.post('/profit-shares/distribute', { applicationIds: [applicationId] });
      const count = data.count || 0;
      if (count) message.success('P&L re-split with current rules');
      else message.info(data.skipped?.[0]?.reason || 'Nothing to re-split');
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

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
    {
      title: 'Status',
      width: 120,
      render: (_, r) => (r.needsResplit ? <Tag color="warning">Rule changed</Tag> : <Tag>Current</Tag>),
    },
    {
      title: 'Actions',
      width: 200,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small" wrap>
          {r.needsResplit && (
            <Popconfirm
              title="Re-split with current rules?"
              description="Reverses the old split and applies your updated share rules."
              onConfirm={() => onResplitProfit(r.ipo_application_id)}
            >
              <Button size="small" type="primary">Re-split</Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="Revoke this P&L split?"
            description="Reverses wallet manager share and provider accrual. P&L stays on the application."
            onConfirm={() => onRevokeProfitSplit(r.ipo_application_id)}
          >
            <Button size="small" danger>Revoke</Button>
          </Popconfirm>
        </Space>
      ),
    },
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

  const overall = pnlTotals?.overall || {};
  const unconfiguredMembers = members.filter((m) => !m.hasShareRule);
  const filteredMembers = membersFilter === 'needs-rule'
    ? members.filter((m) => !m.hasShareRule)
    : members;
  const selectedCount = normalizeMemberIds(selectedMemberIds).length;
  const pendingCount = report?.pending?.length || 0;
  const historyCount = report?.distributions?.length || 0;
  const configuredCount = members.length - unconfiguredMembers.length;

  const tabs = [
    { key: 'members', label: 'Members', count: members.length },
    { key: 'rule-list', label: 'Rule list', count: ruleTemplates.length },
    { key: 'totals', label: 'P&L totals' },
    { key: 'history', label: 'History', count: historyCount },
    { key: 'pending', label: 'Pending', count: pendingCount },
  ];

  const goMembers = (filter = 'all') => {
    setMembersFilter(filter);
    setActiveTabKey('members');
  };

  return (
    <div className="pshare">
      <header className="dash-head">
        <div>
          <p className="dash-hello">P&amp;L rules</p>
          <h1>Profit sharing</h1>
          <p className="dash-lead">
            Set who keeps what on IPO profit and loss. Rules can cover all IPOs or one IPO.
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/profit-analysis" className="dash-btn">Analysis</Link>
          <button type="button" className="dash-btn" onClick={load}>
            <ReloadOutlined /> Refresh
          </button>
          <button type="button" className="dash-btn dash-btn--primary" onClick={openAddRuleTemplate}>
            <PlusOutlined /> Add rule
          </button>
        </div>
      </header>

      {unconfiguredMembers.length > 0 && (
        <button
          type="button"
          className="dash-alert dash-alert--warn"
          onClick={() => goMembers('needs-rule')}
        >
          <WarningOutlined />
          <span>
            {unconfiguredMembers.length} member{unconfiguredMembers.length === 1 ? '' : 's'} still need a share rule before you can split P&amp;L.
          </span>
        </button>
      )}

      <div className="pshare-money">
        <div className="pshare-money-cell pshare-money-cell--main">
          <span>Gross IPO P&amp;L</span>
          <strong>{formatCurrency(overall.grossIpoPnL)}</strong>
          <em>All allotted applications</em>
        </div>
        <div className="pshare-money-cell">
          <span>Providers</span>
          <strong>{formatCurrency(overall.providerShare)}</strong>
          <em>Fund provider share</em>
        </div>
        <div className="pshare-money-cell pshare-money-cell--up">
          <span>Manager</span>
          <strong>{formatCurrency(overall.managerShare)}</strong>
          <em>Your cut</em>
        </div>
        <div className="pshare-money-cell">
          <span>Members</span>
          <strong>{formatCurrency(overall.memberShare)}</strong>
          <em>Kept by members</em>
        </div>
      </div>

      <section className="dash-kpi-grid pshare-kpis">
        <Kpi
          label="Need a rule"
          value={unconfiguredMembers.length}
          hint="Click to filter"
          tone={unconfiguredMembers.length > 0 ? 'warn' : 'up'}
          active={activeTabKey === 'members' && membersFilter === 'needs-rule'}
          onClick={() => goMembers('needs-rule')}
        />
        <Kpi
          label="Rules set"
          value={configuredCount}
          hint="Members with a share %"
          tone="teal"
          active={activeTabKey === 'members' && membersFilter === 'all'}
          onClick={() => goMembers('all')}
        />
        <Kpi
          label="Pending split"
          value={pendingCount}
          hint="Allotted, not distributed"
          tone={pendingCount > 0 ? 'warn' : 'neutral'}
          active={activeTabKey === 'pending'}
          onClick={() => setActiveTabKey('pending')}
        />
        <Kpi
          label="Rule templates"
          value={ruleTemplates.length}
          hint="Reusable share recipes"
          tone="info"
          active={activeTabKey === 'rule-list'}
          onClick={() => setActiveTabKey('rule-list')}
        />
      </section>

      <nav className="pshare-tabs" role="tablist" aria-label="Profit sharing sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTabKey === tab.key}
            className={`pshare-tab${activeTabKey === tab.key ? ' is-on' : ''}`}
            onClick={() => setActiveTabKey(tab.key)}
          >
            {tab.label}
            {tab.count != null ? <b>{tab.count}</b> : null}
          </button>
        ))}
      </nav>

      {activeTabKey === 'members' && (
        <>
          {!templateRuleOptions.length && (
            <Alert
              type="warning"
              showIcon
              className="pshare-alert"
              message="No share recipes yet"
              description="Add a rule first (who gets provider % vs your % vs the member). Then apply it to people below."
            />
          )}
          <section className="dash-card pshare-apply">
            <div className="dash-card-head">
              <h2>Apply a rule</h2>
            </div>
            <p className="pshare-apply-hint">
              The fund provider sits inside the rule — that is who gets the provider cut on P&amp;L, not who receives IPO cash (use Sub-groups for bulk pay).
            </p>
            <div className="pshare-apply-row">
              <Select
                placeholder="Pick a rule"
                className="pshare-apply-rule"
                allowClear
                value={bulkTemplateId}
                onChange={(v) => setBulkTemplateId(normalizeTemplateId(v) ?? v)}
                options={templateRuleOptions}
                disabled={!templateRuleOptions.length}
                size="large"
                {...ruleSelectProps(ruleTemplates)}
              />
              <IpoScopeSelect
                placeholder="All IPOs"
                className="pshare-apply-ipo"
                value={bulkTemplateIpoId}
                onChange={setBulkTemplateIpoId}
                options={ipoOptions}
                size="large"
              />
            </div>
            <div className="pshare-apply-actions">
              {selectedCount > 0 && (
                <span className="pshare-selected">{selectedCount} selected</span>
              )}
              {selectedCount > 0 && (
                <button type="button" className="dash-btn" onClick={() => setSelectedMemberIds([])}>
                  Clear
                </button>
              )}
              <Button loading={ruleSaving} disabled={!bulkTemplateId} onClick={onApplyToNextMember}>
                Next member without a rule
              </Button>
              <Button
                loading={ruleSaving}
                disabled={!bulkTemplateId || !selectedCount}
                onClick={onApplySelectedOneByOne}
              >
                Apply one by one
              </Button>
              <Button
                type="primary"
                loading={ruleSaving}
                disabled={!bulkTemplateId || !selectedCount}
                onClick={onBulkApplyFromToolbar}
              >
                Bulk apply
              </Button>
              <Button disabled={!selectedCount} onClick={openBulkApplyForSelected}>
                Options
              </Button>
            </div>
          </section>

          <div className="mem-chips pshare-chips">
            <button
              type="button"
              className={`mem-chip${membersFilter === 'all' ? ' is-on' : ''}`}
              onClick={() => setMembersFilter('all')}
            >
              All ({members.length})
            </button>
            <button
              type="button"
              className={`mem-chip${membersFilter === 'needs-rule' ? ' is-on' : ''}`}
              onClick={() => setMembersFilter('needs-rule')}
            >
              Need a rule ({unconfiguredMembers.length})
            </button>
            {filteredMembers.length > 0 && (
              <button
                type="button"
                className="mem-chip"
                onClick={() => {
                  const visible = filteredMembers.map((m) => m.memberId);
                  const allOn = visible.every((id) => selectedMemberIds.includes(id));
                  setSelectedMemberIds(allOn ? [] : normalizeMemberIds(visible));
                }}
              >
                {filteredMembers.every((m) => selectedMemberIds.includes(m.memberId))
                  ? 'Unselect visible'
                  : 'Select visible'}
              </button>
            )}
          </div>

          {filteredMembers.length === 0 ? (
            <div className="mem-empty">
              <p>{membersFilter === 'needs-rule' ? 'Every member already has a share rule.' : 'No members yet.'}</p>
            </div>
          ) : (
            <ul className="pshare-list">
              {filteredMembers.map((r) => {
                const checked = selectedMemberIds.includes(r.memberId);
                return (
                  <li key={r.memberId}>
                    <article className={`pshare-person${!r.hasShareRule ? ' needs-rule' : ''}${checked ? ' is-picked' : ''}`}>
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          setSelectedMemberIds((prev) => {
                            const next = new Set(normalizeMemberIds(prev));
                            if (e.target.checked) next.add(r.memberId);
                            else next.delete(r.memberId);
                            return [...next];
                          });
                        }}
                      />
                      <span className={`mem-avatar mem-avatar--${avatarTone(r.memberId)}`}>
                        {initials(r.displayName)}
                      </span>
                      <div className="pshare-person-main">
                        <div className="pshare-person-top">
                          <strong>{r.displayName}</strong>
                          {r.hasShareRule ? (
                            <span className="mem-status is-on">{r.ruleCount} rule{r.ruleCount === 1 ? '' : 's'}</span>
                          ) : (
                            <span className="mem-share-miss">Needs rule</span>
                          )}
                          {r.hasIpoSpecificRules ? <Tag color="purple">IPO override</Tag> : null}
                        </div>
                        <p className="mem-person-meta">
                          <span>{formatPan(r.pan) || 'No PAN'}</span>
                          {r.effectiveProviderName ? <span>{r.effectiveProviderName}</span> : null}
                          {!r.effectiveProviderName && r.memberFundProviderName ? (
                            <span>Profile default: {r.memberFundProviderName}</span>
                          ) : null}
                        </p>
                        {r.hasShareRule ? (
                          <div className="pshare-person-splits">
                            <SplitBar
                              label="Profit"
                              provider={r.effectiveProfitProviderPercent}
                              manager={r.effectiveProfitManagerPercent}
                            />
                            <SplitBar
                              label="Loss"
                              provider={r.effectiveLossProviderPercent}
                              manager={r.effectiveLossManagerPercent}
                            />
                          </div>
                        ) : (
                          <p className="pshare-person-empty">Apply a rule so this member can take a P&amp;L split.</p>
                        )}
                      </div>
                      <div className="pshare-person-actions">
                        <Dropdown
                          disabled={!templateRuleOptions.length || ruleSaving}
                          menu={buildApplyRuleMenu(r.memberId, r.displayName)}
                          trigger={['click']}
                        >
                          <Button size="small" type="primary" loading={ruleSaving}>
                            Apply <DownOutlined />
                          </Button>
                        </Dropdown>
                        <Button size="small" onClick={() => openCustomRuleForMember(r)}>
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
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {activeTabKey === 'rule-list' && (
        <section className="dash-card">
          <div className="dash-card-head">
            <h2>Share recipes</h2>
            <button type="button" className="dash-btn dash-btn--primary" onClick={openAddRuleTemplate}>
              <PlusOutlined /> Add rule
            </button>
          </div>
          {ruleTemplates.length === 0 ? (
            <p className="dash-empty">No rules yet — add one for each fund provider split you reuse.</p>
          ) : (
            <ul className="pshare-rules">
              {ruleTemplates.map((r) => (
                <li key={r.id} className="pshare-rule">
                  <div className="pshare-rule-head">
                    <div>
                      <strong>{r.ruleName || r.providerName}</strong>
                      <span>{r.providerName || 'No provider'}</span>
                    </div>
                    <Space size="small">
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditRuleTemplate(r)}>
                        Edit
                      </Button>
                      <Popconfirm title="Delete this rule from the list?" onConfirm={() => onDeleteRuleTemplate(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                  {r.hasRule ? (
                    <>
                      <div className="pshare-rule-split">
                        <span>On profit</span>
                        <SplitBar provider={r.profitProviderPercent} manager={r.profitManagerPercent} />
                      </div>
                      <div className="pshare-rule-split">
                        <span>On loss</span>
                        <SplitBar provider={r.lossProviderPercent} manager={r.lossManagerPercent} />
                      </div>
                    </>
                  ) : (
                    <Tag color="warning">Percentages not set</Tag>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTabKey === 'totals' && (
        <section className="dash-card">
          <div className="dash-card-head">
            <h2>P&amp;L totals</h2>
            <Segmented
              value={totalsView}
              onChange={setTotalsView}
              options={[
                { label: 'By member', value: 'member' },
                { label: 'By provider', value: 'provider' },
                { label: 'Manager', value: 'manager' },
              ]}
            />
          </div>
          {totalsView === 'member' && (
            <Table
              rowKey="memberId"
              columns={memberTotalCols}
              dataSource={pnlTotals?.byMember || []}
              scroll={{ x: 1100 }}
              locale={{ emptyText: 'No allotted IPO P&L yet' }}
              className="pro-table"
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
              className="pro-table"
              {...tableDefaults}
            />
          )}
          {totalsView === 'manager' && (
            <div className="pshare-manager">
              <div className="pshare-money pshare-money--nested">
                <div className="pshare-money-cell pshare-money-cell--main">
                  <span>Your total share</span>
                  <strong>{formatCurrency(pnlTotals?.manager?.totalShare)}</strong>
                  <em>Across all IPOs</em>
                </div>
                <div className="pshare-money-cell">
                  <span>Already split</span>
                  <strong>{formatCurrency(overall.grossDistributed)}</strong>
                  <em>Gross distributed</em>
                </div>
                <div className={`pshare-money-cell${Number(overall.grossPending) ? ' pshare-money-cell--warn' : ''}`}>
                  <span>Pending split</span>
                  <strong>{formatCurrency(overall.grossPending)}</strong>
                  <em>{overall.pendingCount || 0} application(s)</em>
                </div>
              </div>
              <div className="pshare-kpi-grid">
                <article className="pshare-mini pshare-mini--up">
                  <span>IPO profit</span>
                  <strong className="amount-positive">{formatCurrency(overall.ipoProfit)}</strong>
                </article>
                <article className="pshare-mini pshare-mini--down">
                  <span>IPO loss</span>
                  <strong className="amount-negative">{formatCurrency(overall.ipoLoss)}</strong>
                </article>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTabKey === 'history' && (
        <section className="dash-card">
          <div className="dash-card-head">
            <h2>Distributed P&amp;L</h2>
          </div>
          <Table
            rowKey="id"
            columns={distCols}
            dataSource={report?.distributions || []}
            scroll={{ x: 1200 }}
            className="pro-table"
            locale={{ emptyText: 'No distributions yet' }}
            {...tableDefaults}
          />
        </section>
      )}

      {activeTabKey === 'pending' && (
        <section className="dash-card">
          <div className="dash-card-head">
            <h2>Waiting to split</h2>
          </div>
          {(report?.pending || []).length === 0 ? (
            <p className="dash-empty">All caught up — no allotted P&amp;L waiting to distribute.</p>
          ) : (
            <ul className="pshare-pending">
              {(report.pending || []).map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.display_name}</strong>
                    <span>{row.ipo_name}</span>
                  </div>
                  <b className={pnlClassName(row.profit_loss)}>
                    {formatCurrency(row.profit_loss)}
                    {Number(row.profit_loss) < 0 ? ' loss' : Number(row.profit_loss) > 0 ? ' profit' : ''}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal
        className="pshare-modal"
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
        {rulesLoading ? <div className="pshare-manage-loading">Loading rules…</div> : null}
        <div className="pshare-manage-head">
          <div className="pshare-manage-scopes">
            {rulesByScope(memberRules).map((scope) => (
              <div key={scope.label} className="pshare-scope">
                <Tag color={scope.label === 'All IPOs' ? 'default' : 'purple'}>{scope.label}</Tag>
                <div className="pshare-scope-bars">
                  <div>
                    <span>Profit {scope.profitP + scope.profitM}%</span>
                    <SplitBar label="Profit" compact provider={scope.profitP} manager={scope.profitM} />
                  </div>
                  <div>
                    <span>Loss {scope.lossP + scope.lossM}%</span>
                    <SplitBar label="Loss" compact provider={scope.lossP} manager={scope.lossM} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Space wrap>
            <Dropdown
              disabled={!templateRuleOptions.length || ruleSaving}
              trigger={['click']}
              menu={buildApplyRuleMenu(
                manageMember.memberId,
                manageMember.displayName,
                () => loadMemberRules(manageMember.memberId)
              )}
            >
              <Button type="primary" icon={<PlusOutlined />} loading={ruleSaving}>
                Apply from list <DownOutlined />
              </Button>
            </Dropdown>
            <Button type="link" onClick={() => openAddRuleForm([manageMember.memberId], manageMember.displayName, memberRules.length + 1)}>
              Custom rule
            </Button>
          </Space>
        </div>
        <Alert
          type="info"
          showIcon
          className="pshare-alert"
          message="One active rule per IPO scope"
          description="You can save several rules, but only one is active for All IPOs or for each specific IPO."
        />
        {memberRules.length === 0 ? (
          <p className="dash-empty">No rules on this member yet.</p>
        ) : (
          <ul className="pshare-manage-list">
            {memberRules.map((r) => (
              <li key={r.id} className={`pshare-manage-rule${r.isActive === false ? ' is-off' : ''}`}>
                <div className="pshare-rule-head">
                  <div>
                    <strong>
                      {r.ruleName}
                      {r.isActive === false ? <em>Inactive</em> : <em className="is-live">Active</em>}
                    </strong>
                    <span>{r.providerName} · <IpoScopeTag rule={r} /></span>
                  </div>
                  <Space>
                    {r.isActive === false && (
                      <Button size="small" type="link" onClick={() => onActivateRule(r.id)}>
                        Set active
                      </Button>
                    )}
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditRuleForm(r)} />
                    <Popconfirm title="Delete this rule?" onConfirm={() => onDeleteRule(r.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
                <div className="pshare-rule-split">
                  <span>On profit</span>
                  <SplitBar provider={r.profitProviderPercent} manager={r.profitManagerPercent} />
                </div>
                <div className="pshare-rule-split">
                  <span>On loss</span>
                  <SplitBar provider={r.lossProviderPercent} manager={r.lossManagerPercent} />
                </div>
              </li>
            ))}
          </ul>
        )}
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
            <Select
              placeholder="Pick a saved rule"
              options={templateRuleOptions}
              {...ruleSelectProps(ruleTemplates)}
            />
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
            This rule will be added to each selected member and become the active rule for the chosen IPO scope.
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
