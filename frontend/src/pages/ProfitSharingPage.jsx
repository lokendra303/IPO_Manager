import { useEffect, useState, useMemo, useRef } from 'react';
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
import { isActiveMember, mergeMemberDirectories, groupBulkSelectOptions, groupedMemberSelectOptions, isGroupFullySelected, toggleGroupMemberIds, shareRuleLabel, shareRuleMemberIds, sharePackLabel, findShareRuleConflicts, formatShareRuleConflicts, ruleConflictsWithSelected } from '../utils/shareRules';

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
  const [shareRules, setShareRules] = useState([]);
  const [sharePacks, setSharePacks] = useState([]);
  const [ipos, setIpos] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
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
  const [packEditOpen, setPackEditOpen] = useState(false);
  const [packEdit, setPackEdit] = useState(null);
  const [packForm] = Form.useForm();
  const [bulkTemplateId, setBulkTemplateId] = useState(null);
  const [bulkTemplateIpoId, setBulkTemplateIpoId] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState('rule-list');
  const [membersFilter, setMembersFilter] = useState('all');
  const extrasLoadingRef = useRef(false);
  const extrasLoadedRef = useRef(false);

  const renderAmt = (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span>;

  const loadCore = async () => {
    const { data } = await client.get('/profit-shares/setup');
    setMembers(mergeMemberDirectories(
      Array.isArray(data?.members) ? data.members : [],
      [],
    ));
    setMemberGroups(Array.isArray(data?.groups) ? data.groups : []);
    setFundProviders(Array.isArray(data?.providers) ? data.providers : []);
    setRuleTemplates(Array.isArray(data?.ruleTemplates) ? data.ruleTemplates : []);
    setShareRules(Array.isArray(data?.rules) ? data.rules : []);
    setSharePacks(Array.isArray(data?.packs) ? data.packs : []);
    return data?.members;
  };

  const loadExtras = async ({ force = false } = {}) => {
    if (!force && extrasLoadedRef.current) return;
    if (extrasLoadingRef.current) return;
    extrasLoadingRef.current = true;
    try {
      const [ipoRes, repRes, totalsRes] = await Promise.all([
        client.get('/ipos', { params: { namesOnly: 1 } }).catch(() => ({ data: [] })),
        client.get('/profit-shares/report').catch(() => ({ data: null })),
        client.get('/profit-shares/totals').catch(() => ({ data: null })),
      ]);
      setIpos(Array.isArray(ipoRes.data) ? ipoRes.data : []);
      if (repRes.data) setReport(repRes.data);
      if (totalsRes.data) setPnlTotals(totalsRes.data);
      extrasLoadedRef.current = true;
    } finally {
      extrasLoadingRef.current = false;
    }
  };

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      await loadCore();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      if (!silent) setLoading(false);
    }
    loadExtras({ force: true });
  };

  const refreshAfterRuleChange = async () => {
    setActiveTabKey('members');
    await loadCore();
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (['totals', 'history', 'pending'].includes(activeTabKey)) {
      loadExtras();
    }
  }, [activeTabKey]);

  useEffect(() => {
    if ((templateApplyOpen || ruleFormOpen) && !ipos.length) {
      loadExtras();
    }
  }, [templateApplyOpen, ruleFormOpen, ipos.length]);

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
    setActiveTabKey('rule-list');
    message.info(
      `Create or edit share rules, then select them on ${location.state?.presetIpoName || 'the IPO'} before distribute or P&L. Rules on one IPO cannot share a member.`
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

  const memberRuleMap = useMemo(() => {
    const map = new Map();
    for (const rule of shareRules) {
      for (const memberId of shareRuleMemberIds(rule)) {
        const list = map.get(memberId) || [];
        list.push(rule);
        map.set(memberId, list);
      }
    }
    return map;
  }, [shareRules]);

  const activeMembers = useMemo(
    () => members.filter(isActiveMember),
    [members]
  );

  const editingRuleMemberIds = Form.useWatch('memberIds', ruleListForm) || [];
  const memberSelectOptions = useMemo(
    () => groupedMemberSelectOptions(members, editingRuleMemberIds, memberGroups),
    [members, editingRuleMemberIds, memberGroups]
  );
  const memberGroupBulkOptions = useMemo(
    () => groupBulkSelectOptions(members, memberGroups),
    [members, memberGroups]
  );
  const editingPackRuleIds = Form.useWatch('ruleIds', packForm) || [];

  const toggleRuleMembersByGroup = (groupMemberIds) => {
    ruleListForm.setFieldsValue({
      memberIds: toggleGroupMemberIds(editingRuleMemberIds, groupMemberIds),
    });
  };

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
      memberIds: [],
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
      memberIds: shareRuleMemberIds(row),
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
        await client.post('/profit-shares/rules', values);
        message.success('Share rule created');
      } else {
        await client.put(`/profit-shares/rules/${ruleListEdit.id}`, values);
        message.success('Share rule updated');
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
      await client.delete(`/profit-shares/rules/${templateId}`);
      message.success('Share rule deleted');
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const openAddPack = () => {
    if (!shareRules.length) {
      message.warning('Create a share rule first, then group rules into a template');
      return;
    }
    setPackEdit({ mode: 'create' });
    packForm.setFieldsValue({ packName: '', ruleIds: [] });
    setPackEditOpen(true);
  };

  const openEditPack = (row) => {
    setPackEdit({ mode: 'edit', id: row.id, packName: row.packName });
    packForm.setFieldsValue({
      packName: row.packName,
      ruleIds: row.ruleIds || [],
    });
    setPackEditOpen(true);
  };

  const onSavePack = async (values) => {
    if (!packEdit) return;
    const selected = shareRules.filter((r) => (values.ruleIds || []).includes(r.id));
    const conflicts = findShareRuleConflicts(selected);
    if (conflicts.length) {
      message.error(formatShareRuleConflicts(conflicts));
      return;
    }
    setRuleSaving(true);
    try {
      if (packEdit.mode === 'create') {
        await client.post('/profit-shares/packs', values);
        message.success('Share template created');
      } else {
        await client.put(`/profit-shares/packs/${packEdit.id}`, values);
        message.success('Share template updated');
      }
      setPackEditOpen(false);
      setPackEdit(null);
      await refreshAfterRuleChange();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRuleSaving(false);
    }
  };

  const onDeletePack = async (packId) => {
    try {
      await client.delete(`/profit-shares/packs/${packId}`);
      message.success('Share template deleted');
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
  const unconfiguredMembers = activeMembers.filter((m) => !(memberRuleMap.get(m.memberId) || []).length);
  const filteredMembers = membersFilter === 'needs-rule'
    ? unconfiguredMembers
    : activeMembers;
  const selectedCount = normalizeMemberIds(selectedMemberIds).length;
  const pendingCount = report?.pending?.length || 0;
  const historyCount = report?.distributions?.length || 0;
  const configuredCount = activeMembers.length - unconfiguredMembers.length;

  const tabs = [
    { key: 'rule-list', label: 'Templates', count: sharePacks.length || shareRules.length },
    { key: 'members', label: 'Members', count: activeMembers.length },
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
          <p className="dash-hello">Share templates</p>
          <h1>Profit sharing</h1>
          <p className="dash-lead">
            A rule is a reusable deal: who is in it and what % they keep. Group rules into a template (no overlapping members). Each IPO picks one template.
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/profit-analysis" className="dash-btn">Analysis</Link>
          <button type="button" className="dash-btn" onClick={load}>
            <ReloadOutlined /> Refresh
          </button>
          <button type="button" className="dash-btn" onClick={openAddRuleTemplate}>
            <PlusOutlined /> Add rule
          </button>
          <button type="button" className="dash-btn dash-btn--primary" onClick={openAddPack}>
            <PlusOutlined /> Add template
          </button>
        </div>
      </header>

      {shareRules.length === 0 && (
        <button
          type="button"
          className="dash-alert dash-alert--warn"
          onClick={() => { setActiveTabKey('rule-list'); openAddRuleTemplate(); }}
        >
          <WarningOutlined />
          <span>
            Create share rules (members + %), group them into a template, then pick that template on each IPO. A member cannot appear on two rules in the same template.
          </span>
        </button>
      )}
      {shareRules.length > 0 && unconfiguredMembers.length > 0 && (
        <button
          type="button"
          className="dash-alert dash-alert--warn"
          onClick={() => goMembers('needs-rule')}
        >
          <WarningOutlined />
          <span>
            {unconfiguredMembers.length} member{unconfiguredMembers.length === 1 ? '' : 's'} are not on any share rule.
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
          label="On a rule"
          value={configuredCount}
          hint="Members on a share rule"
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
          label="Templates"
          value={sharePacks.length}
          hint="Groups of share rules"
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
          <section className="dash-card pshare-apply">
            <div className="dash-card-head">
              <h2>Who is on which rule</h2>
            </div>
            <p className="pshare-apply-hint">
              Members get P&amp;L only when they are on a rule inside the template selected for that IPO. A template can hold several rules if they do not share members.
            </p>
          </section>

          <div className="mem-chips pshare-chips">
            <button
              type="button"
              className={`mem-chip${membersFilter === 'all' ? ' is-on' : ''}`}
              onClick={() => setMembersFilter('all')}
            >
              All ({activeMembers.length})
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
                onClick={() => setActiveTabKey('rule-list')}
              >
                Manage on Share rules
              </button>
            )}
          </div>

          {filteredMembers.length === 0 ? (
            <div className="mem-empty">
              <p>{membersFilter === 'needs-rule' ? 'Every active member already has a share rule.' : 'No active members yet.'}</p>
            </div>
          ) : (
            <ul className="pshare-list">
              {filteredMembers.map((r) => {
                const onRules = memberRuleMap.get(r.memberId) || [];
                return (
                  <li key={r.memberId}>
                    <article className={`pshare-person${!(memberRuleMap.get(r.memberId) || []).length ? ' needs-rule' : ''}`}>
                      <span className={`mem-avatar mem-avatar--${avatarTone(r.memberId)}`}>
                        {initials(r.displayName)}
                      </span>
                      <div className="pshare-person-main">
                        <div className="pshare-person-top">
                          <strong>{r.displayName}</strong>
                          { (memberRuleMap.get(r.memberId) || []).length ? (
                            <span className="mem-status is-on">{(memberRuleMap.get(r.memberId) || []).length} rule{(memberRuleMap.get(r.memberId) || []).length === 1 ? '' : 's'}</span>
                          ) : (
                            <span className="mem-share-miss">Not on a rule</span>
                          )}
                        </div>
                        <p className="mem-person-meta">
                          <span>{formatPan(r.pan) || 'No PAN'}</span>
                          {r.effectiveProviderName ? <span>{r.effectiveProviderName}</span> : null}
                          {!r.effectiveProviderName && r.memberFundProviderName ? (
                            <span>Profile default: {r.memberFundProviderName}</span>
                          ) : null}
                        </p>
                        {(memberRuleMap.get(r.memberId) || []).length ? (
                          <div className="pshare-person-splits">
                            {(memberRuleMap.get(r.memberId) || []).map((rule) => (
                              <Tag key={rule.id}>{shareRuleLabel(rule, { compact: true })}</Tag>
                            ))}
                          </div>
                        ) : (
                          <p className="pshare-person-empty">Add this member to a share rule, then pick that rule on the IPO.</p>
                        )}
                      </div>
                      <div className="pshare-person-actions">
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => {
                            if (onRules[0]) openEditRuleTemplate(onRules[0]);
                            else {
                              setActiveTabKey('rule-list');
                              openAddRuleTemplate();
                            }
                          }}
                        >
                          {onRules.length ? 'Edit rule' : 'Add to rule'}
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
        <>
        <section className="dash-card">
          <div className="dash-card-head">
            <h2>Share templates</h2>
            <button type="button" className="dash-btn dash-btn--primary" onClick={openAddPack}>
              <PlusOutlined /> Add template
            </button>
          </div>
          {sharePacks.length === 0 ? (
            <p className="dash-empty">No templates yet — group one or more share rules (no overlapping members). Each IPO picks one template.</p>
          ) : (
            <ul className="pshare-rules">
              {sharePacks.map((p) => (
                <li key={p.id} className="pshare-rule">
                  <div className="pshare-rule-head">
                    <div>
                      <strong>{p.packName}</strong>
                      <span>{sharePackLabel(p)}</span>
                    </div>
                    <Space size="small">
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditPack(p)}>
                        Edit
                      </Button>
                      <Popconfirm title="Delete this template? IPOs using it will need a new template." onConfirm={() => onDeletePack(p.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                  {(p.rules || []).length > 0 ? (
                    <p className="mem-person-meta" style={{ marginTop: 8 }}>
                      {(p.rules || []).map((r) => r.ruleName || r.providerName).join(', ')}
                    </p>
                  ) : (
                    <Tag color="warning">No rules selected</Tag>
                  )}
                  {p.hasConflicts ? (
                    <Tag color="error" style={{ marginTop: 8 }}>Members overlap</Tag>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="dash-card">
          <div className="dash-card-head">
            <h2>Share rules</h2>
            <button type="button" className="dash-btn dash-btn--primary" onClick={openAddRuleTemplate}>
              <PlusOutlined /> Add rule
            </button>
          </div>
          {shareRules.length === 0 ? (
            <p className="dash-empty">No share rules yet — add a rule, pick members, then group it into a template for IPOs.</p>
          ) : (
            <ul className="pshare-rules">
              {shareRules.map((r) => (
                <li key={r.id} className="pshare-rule">
                  <div className="pshare-rule-head">
                    <div>
                      <strong>{r.ruleName || r.providerName}</strong>
                      <span>{r.providerName || 'No provider'} · {r.memberCount || 0} member{(r.memberCount || 0) === 1 ? '' : 's'} · member keeps {r.profitMemberPercent ?? memberKeep(r.profitProviderPercent, r.profitManagerPercent)}%</span>
                    </div>
                    <Space size="small">
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditRuleTemplate(r)}>
                        Edit
                      </Button>
                      <Popconfirm title="Delete this share rule? IPOs using it will need a new rule." onConfirm={() => onDeleteRuleTemplate(r.id)}>
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
                  {(r.members || []).length > 0 ? (
                    <p className="mem-person-meta" style={{ marginTop: 8 }}>
                      {(r.members || []).map((m) => m.displayName).join(', ')}
                    </p>
                  ) : (
                    <Tag color="warning">No members selected</Tag>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        </>
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
        title={ruleListEdit?.mode === 'edit' ? `Edit share rule — ${ruleListEdit?.ruleName || ''}` : 'Create share rule'}
        open={ruleListEditOpen}
        onCancel={() => { setRuleListEditOpen(false); setRuleListEdit(null); }}
        onOk={() => ruleListForm.submit()}
        confirmLoading={ruleSaving}
        destroyOnClose
        width={560}
      >
        <Form form={ruleListForm} layout="vertical" onFinish={onSaveRuleTemplate}>
          <Form.Item
            name="ruleName"
            label="Rule name"
            rules={[{ required: true, message: 'Enter a rule name' }]}
            extra="Shown when picking a rule on an IPO (e.g. Rinku 30%, Ungrouped 50%)."
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
            />
          </Form.Item>
          <div>
            <p className="ant-form-item-label" style={{ marginBottom: 4 }}>
              <label>Members on this rule</label>
            </p>
            {memberGroupBulkOptions.length > 0 && (
              <div className="mem-chips" style={{ marginBottom: 8 }}>
                {memberGroupBulkOptions.map((opt) => {
                  const on = isGroupFullySelected(editingRuleMemberIds, opt.ids);
                  return (
                    <button
                      type="button"
                      key={opt.key}
                      className={`mem-chip${on ? ' is-on' : ''}`}
                      onClick={() => toggleRuleMembersByGroup(opt.ids)}
                    >
                      {opt.label} ({opt.ids.length})
                    </button>
                  );
                })}
              </div>
            )}
            <Form.Item
              name="memberIds"
              extra="Tap a sub-group to add or remove everyone in it. Inactive members already on this rule stay visible."
            >
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder="Select active members, or pick a sub-group above"
                optionFilterProp="label"
                options={memberSelectOptions}
              />
            </Form.Item>
          </div>
          <Divider orientation="left" plain>When member has profit</Divider>
          <SharePercentForm form={ruleListForm} prefix="profit" />
          <Divider orientation="left" plain>When member has loss</Divider>
          <SharePercentForm form={ruleListForm} prefix="loss" />
        </Form>
      </Modal>

      <Modal
        title={packEdit?.mode === 'edit' ? `Edit template — ${packEdit?.packName || ''}` : 'Create share template'}
        open={packEditOpen}
        onCancel={() => { setPackEditOpen(false); setPackEdit(null); }}
        onOk={() => packForm.submit()}
        confirmLoading={ruleSaving}
        destroyOnClose
        width={560}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Group one or more share rules. A member cannot appear on two rules in the same template. Each IPO picks this template instead of picking rules one by one.
        </Typography.Paragraph>
        <Form form={packForm} layout="vertical" onFinish={onSavePack}>
          <Form.Item
            name="packName"
            label="Template name"
            rules={[{ required: true, message: 'Enter a template name' }]}
          >
            <Input placeholder="e.g. Retail + HNI" />
          </Form.Item>
          <Form.Item
            name="ruleIds"
            label="Share rules"
            rules={[
              { required: true, type: 'array', min: 1, message: 'Select at least one share rule' },
              {
                validator: (_, ids) => {
                  const selected = shareRules.filter((r) => (ids || []).includes(r.id));
                  const conflicts = findShareRuleConflicts(selected);
                  if (conflicts.length) return Promise.reject(new Error(formatShareRuleConflicts(conflicts)));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Pick rules that do not share members"
              options={shareRules.map((r) => ({
                value: r.id,
                label: shareRuleLabel(r),
                disabled: ruleConflictsWithSelected(r, editingPackRuleIds, shareRules),
              }))}
            />
          </Form.Item>
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
