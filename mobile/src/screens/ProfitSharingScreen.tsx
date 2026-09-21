import { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Button, Checkbox, TextInput } from 'react-native-paper';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import FilterChips from '../components/FilterChips';
import Banner from '../components/Banner';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { openActionSheet } from '../utils/actionSheet';
import { colors, radii, spacing } from '../theme';
import { ui } from '../styles/ui';
import { isActiveMember, membersForRulePicker, mergeMemberDirectories, groupBulkSelectOptions, isGroupFullySelected, toggleGroupMemberIds, shareRuleLabel, shareRuleMemberIds, sharePackLabel, findShareRuleConflicts, formatShareRuleConflicts, nextShareRuleIdsWithoutConflict } from '../utils/shareRules';

type Tab = 'totals' | 'rules' | 'members' | 'history' | 'pending';
type TotalsView = 'member' | 'provider' | 'manager';
type MembersFilter = 'all' | 'needs-rule';

const EMPTY_RULE_FORM = {
  ruleName: '',
  fundProviderId: '',
  ipoId: '',
  memberIds: [] as number[],
  profitProviderPercent: '0',
  profitManagerPercent: '0',
  lossProviderPercent: '0',
  lossManagerPercent: '0',
};

const EMPTY_PACK_FORM = {
  packName: '',
  ruleIds: [] as number[],
};

function pctSummary(prov: number, mgr: number) {
  const p = Number(prov) || 0;
  const m = Number(mgr) || 0;
  return `${p}% / ${m}% (keeps ${Math.max(0, 100 - p - m)}%)`;
}

function isRuleActive(rule: any) {
  return rule?.isActive !== false && rule?.is_active !== 0;
}

function normalizeMemberRule(rule: any) {
  return { ...rule, isActive: isRuleActive(rule) };
}

function rulesByScope(rules: any[]) {
  const groups = new Map<string, { label: string; rules: any[] }>();
  for (const r of rules.filter(isRuleActive)) {
    const key = r.ipoId != null ? String(r.ipoId) : 'global';
    if (!groups.has(key)) {
      groups.set(key, {
        label: r.ipoId ? (r.ipoName || `IPO #${r.ipoId}`) : 'All IPOs',
        rules: [],
      });
    }
    groups.get(key)!.rules.push(r);
  }
  return [...groups.values()];
}

type CoreCache = {
  members: any[];
  providers: any[];
  templates: any[];
  groups: any[];
  packs: any[];
};

export default function ProfitSharingScreen() {
  const { presetIpoId, presetIpoName } = useLocalSearchParams<{ presetIpoId?: string; presetIpoName?: string }>();
  const { user } = useAuth();
  const userId = user?.id;
  const [members, setMembers] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [ipos, setIpos] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [packs, setPacks] = useState<any[]>([]);
  const [memberGroups, setMemberGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [totalsLoaded, setTotalsLoaded] = useState(false);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('rules');
  const [totalsView, setTotalsView] = useState<TotalsView>('member');
  const [membersFilter, setMembersFilter] = useState<MembersFilter>('all');
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState<number | null>(null);
  const [bulkIpoId, setBulkIpoId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [manageMember, setManageMember] = useState<any>(null);
  const [memberRules, setMemberRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleContext, setRuleContext] = useState<{ mode: 'create' | 'edit'; memberIds: number[]; ruleId?: number } | null>(null);
  const [ruleForm, setRuleForm] = useState<any>(EMPTY_RULE_FORM);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateEdit, setTemplateEdit] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState<any>(EMPTY_RULE_FORM);

  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packEdit, setPackEdit] = useState<any>(null);
  const [packForm, setPackForm] = useState<any>(EMPTY_PACK_FORM);

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyMemberIds, setApplyMemberIds] = useState<number[]>([]);
  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null);
  const [applyIpoId, setApplyIpoId] = useState<number | null>(null);

  const applyCore = (core: CoreCache) => {
    setMembers(core.members);
    setProviders(core.providers);
    setTemplates(core.templates);
    setPacks(core.packs || []);
    setMemberGroups(core.groups || []);
  };

  const loadCore = async () => {
    const { data } = await client.get('/profit-shares/setup');
    const core: CoreCache = {
      members: mergeMemberDirectories(
        Array.isArray(data?.members) ? data.members : [],
        [],
      ),
      providers: Array.isArray(data?.providers) ? data.providers : [],
      templates: Array.isArray(data?.rules) ? data.rules : [],
      groups: Array.isArray(data?.groups) ? data.groups : [],
      packs: Array.isArray(data?.packs) ? data.packs : [],
    };
    applyCore(core);
  };

  const loadTotals = async (force = false) => {
    if (!force && totalsLoaded) return;
    setLoadingTotals(true);
    try {
      const { data } = await client.get('/profit-shares/totals');
      setTotals(data);
      setTotalsLoaded(true);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load P&L totals'));
    } finally {
      setLoadingTotals(false);
    }
  };

  const loadReport = async (force = false) => {
    if (!force && reportLoaded) return;
    setLoadingReport(true);
    try {
      const { data } = await client.get('/profit-shares/report');
      setReport(data);
      setReportLoaded(true);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load distribution history'));
    } finally {
      setLoadingReport(false);
    }
  };

  const loadIpos = async () => {
    if (ipos.length) return;
    try {
      const { data } = await client.get('/ipos', { params: { namesOnly: 1 } });
      setIpos(data);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load IPOs'));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      await loadCore();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load profit sharing'));
    } finally {
      setLoading(false);
    }
    loadTotals(true);
    loadReport(true);
  };

  const reloadAfterChange = async () => {
    try {
      await loadCore();
      if (totalsLoaded) await loadTotals(true);
      if (reportLoaded) await loadReport(true);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not refresh'));
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadCore();
      } catch (err) {
        if (!cancelled) Alert.alert('Error', getErrorMessage(err, 'Could not load profit sharing'));
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) loadTotals();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (tab === 'members' && !ipos.length) {
      loadIpos();
    }
  }, [tab, ipos.length]);

  useEffect(() => {
    if (tab === 'totals' && !totalsLoaded && !loadingTotals) {
      loadTotals();
    }
    if ((tab === 'history' || tab === 'pending') && !reportLoaded && !loadingReport) {
      loadReport();
    }
  }, [tab, totalsLoaded, reportLoaded, loadingTotals, loadingReport]);

  useEffect(() => {
    if (applyModalOpen) {
      loadIpos();
    }
  }, [applyModalOpen]);

  useEffect(() => {
    if (!presetIpoId) return;
    const id = Number(presetIpoId);
    if (Number.isInteger(id) && id > 0) {
      setBulkIpoId(id);
    }
    setTab('rules');
    Alert.alert(
      'Share rule for IPO',
      `Create or edit share rules, then select them on ${presetIpoName || 'the IPO'} before distribute or P&L. Rules on one IPO cannot share a member.`
    );
  }, [presetIpoId, presetIpoName]);

  const overall = totals?.overall ?? {};
  const distributions = report?.distributions ?? [];
  const pending = report?.pending ?? [];
  const memberRuleMap = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const rule of templates) {
      for (const memberId of shareRuleMemberIds(rule)) {
        const list = map.get(memberId) || [];
        list.push(rule);
        map.set(memberId, list);
      }
    }
    return map;
  }, [templates]);
  const activeMembers = useMemo(() => members.filter(isActiveMember), [members]);
  const pickerMembers = useMemo(
    () => membersForRulePicker(members, templateForm.memberIds || []),
    [members, templateForm.memberIds]
  );
  const memberGroupBulkOptions = useMemo(
    () => groupBulkSelectOptions(members, memberGroups),
    [members, memberGroups]
  );
  const unconfiguredMembers = activeMembers.filter((m) => !(memberRuleMap.get(m.memberId) || []).length);
  const filteredMembers = membersFilter === 'needs-rule' ? unconfiguredMembers : activeMembers;

  const templateOptions = useMemo(
    () => templates.map((t) => ({ value: t.id, label: shareRuleLabel(t, true) })),
    [templates]
  );

  const loadMemberRules = async (memberId: number) => {
    setRulesLoading(true);
    try {
      const { data } = await client.get(`/profit-shares/members/${memberId}/rules`);
      const rules = (data.rules || []).map(normalizeMemberRule);
      setMemberRules(rules);
      return rules;
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
      return [];
    } finally {
      setRulesLoading(false);
    }
  };

  const activeScopeSummaries = useMemo(() => rulesByScope(memberRules), [memberRules]);

  const openManageMember = async (member: any) => {
    setManageMember(member);
    await loadMemberRules(member.memberId);
  };

  const rulePayload = (form: any) => ({
    ruleName: form.ruleName?.trim(),
    fundProviderId: Number(form.fundProviderId),
    ipoId: form.ipoId ? Number(form.ipoId) : null,
    profitProviderPercent: Number(form.profitProviderPercent ?? 0),
    profitManagerPercent: Number(form.profitManagerPercent ?? 0),
    lossProviderPercent: Number(form.lossProviderPercent ?? 0),
    lossManagerPercent: Number(form.lossManagerPercent ?? 0),
  });

  const openCreateRule = (memberIds: number[]) => {
    setRuleContext({ mode: 'create', memberIds });
    setRuleForm({
      ...EMPTY_RULE_FORM,
      ruleName: `Rule ${memberIds.length > 1 ? '' : (memberRules.length + 1)}`,
      ipoId: presetIpoId ? String(presetIpoId) : '',
    });
    setRuleModalOpen(true);
  };

  const openEditRule = (rule: any) => {
    if (!manageMember) return;
    setRuleContext({ mode: 'edit', memberIds: [manageMember.memberId], ruleId: rule.id });
    setRuleForm({
      ruleName: rule.ruleName,
      fundProviderId: String(rule.fundProviderId),
      ipoId: rule.ipoId ? String(rule.ipoId) : '',
      profitProviderPercent: String(rule.profitProviderPercent),
      profitManagerPercent: String(rule.profitManagerPercent),
      lossProviderPercent: String(rule.lossProviderPercent),
      lossManagerPercent: String(rule.lossManagerPercent),
    });
    setRuleModalOpen(true);
  };

  const onSaveRule = async () => {
    if (!ruleContext) return;
    if (!ruleForm.ruleName?.trim() || !ruleForm.fundProviderId) {
      Alert.alert('Error', 'Rule name and fund provider are required');
      return;
    }
    setSaving(true);
    try {
      const payload = rulePayload(ruleForm);
      if (ruleContext.mode === 'edit' && ruleContext.ruleId) {
        await client.put(`/profit-shares/members/${ruleContext.memberIds[0]}/rules/${ruleContext.ruleId}`, payload);
        Alert.alert('Success', 'Rule updated');
      } else if (ruleContext.memberIds.length === 1) {
        await client.post(`/profit-shares/members/${ruleContext.memberIds[0]}/rules`, payload);
        Alert.alert('Success', 'Rule added');
      } else {
        const { data } = await client.post('/profit-shares/members/bulk-rules', {
          memberIds: ruleContext.memberIds,
          ...payload,
        });
        Alert.alert('Success', `Applied to ${data.appliedCount || 0} member(s)`);
        setSelectedMemberIds([]);
      }
      setRuleModalOpen(false);
      setRuleContext(null);
      if (manageMember) await loadMemberRules(manageMember.memberId);
      await reloadAfterChange();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDeleteRule = async (ruleId: number) => {
    if (!manageMember) return;
    try {
      await client.delete(`/profit-shares/members/${manageMember.memberId}/rules/${ruleId}`);
      await loadMemberRules(manageMember.memberId);
      await reloadAfterChange();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const onActivateRule = async (ruleId: number) => {
    if (!manageMember) return;
    try {
      await client.post(`/profit-shares/members/${manageMember.memberId}/rules/${ruleId}/activate`);
      await loadMemberRules(manageMember.memberId);
      await reloadAfterChange();
      Alert.alert('Success', 'Rule is now active for this IPO scope');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const ruleActionItems = (rule: any) => {
    const items: { text: string; onPress: () => void; style?: 'destructive' }[] = [
      { text: 'Edit', onPress: () => openEditRule(rule) },
    ];
    if (!isRuleActive(rule)) {
      items.push({ text: 'Set active', onPress: () => onActivateRule(rule.id) });
    }
    items.push({
      text: 'Delete',
      style: 'destructive',
      onPress: () =>
        Alert.alert('Delete rule?', '', [
          { text: 'Cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDeleteRule(rule.id) },
        ]),
    });
    return items;
  };

  const onClearMemberRules = async () => {
    if (!manageMember) return;
    try {
      await client.delete(`/profit-shares/members/${manageMember.memberId}`);
      setManageMember(null);
      setMemberRules([]);
      await reloadAfterChange();
      Alert.alert('Success', 'All share rules removed');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const openApplyTemplate = (memberIds: number[]) => {
    if (!templateOptions.length) {
      Alert.alert('No rules', 'Add a rule in the Rule list tab first');
      return;
    }
    setApplyMemberIds(memberIds);
    setApplyTemplateId(bulkTemplateId);
    const presetId = presetIpoId ? Number(presetIpoId) : null;
    setApplyIpoId(
      bulkIpoId ?? (Number.isInteger(presetId) && presetId! > 0 ? presetId : null)
    );
    setApplyModalOpen(true);
  };

  const onApplyTemplate = async () => {
    if (!applyTemplateId || !applyMemberIds.length) return;
    const tpl = templates.find((t) => t.id === applyTemplateId);
    if (!tpl) return;
    setSaving(true);
    try {
      const payload = {
        ruleName: tpl.ruleName,
        fundProviderId: tpl.fundProviderId,
        ipoId: applyIpoId,
        profitProviderPercent: tpl.profitProviderPercent,
        profitManagerPercent: tpl.profitManagerPercent,
        lossProviderPercent: tpl.lossProviderPercent,
        lossManagerPercent: tpl.lossManagerPercent,
      };
      if (applyMemberIds.length === 1) {
        await client.post(`/profit-shares/members/${applyMemberIds[0]}/rules`, payload);
      } else {
        await client.post('/profit-shares/members/bulk-rules', { memberIds: applyMemberIds, ...payload });
      }
      setApplyModalOpen(false);
      setSelectedMemberIds([]);
      if (manageMember && applyMemberIds.includes(manageMember.memberId)) {
        await loadMemberRules(manageMember.memberId);
      }
      await reloadAfterChange();
      Alert.alert('Success', 'Rule applied');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openTemplateModal = (template?: any) => {
    setTemplateEdit(template || null);
    setTemplateForm(
      template
        ? {
            ruleName: template.ruleName,
            fundProviderId: String(template.fundProviderId),
            memberIds: shareRuleMemberIds(template),
            profitProviderPercent: String(template.profitProviderPercent ?? 0),
            profitManagerPercent: String(template.profitManagerPercent ?? 0),
            lossProviderPercent: String(template.lossProviderPercent ?? 0),
            lossManagerPercent: String(template.lossManagerPercent ?? 0),
          }
        : { ...EMPTY_RULE_FORM, memberIds: [] }
    );
    setTemplateModalOpen(true);
  };

  const onSaveTemplate = async () => {
    if (!templateForm.ruleName?.trim() || !templateForm.fundProviderId) {
      Alert.alert('Error', 'Rule name and fund provider are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ruleName: templateForm.ruleName.trim(),
        fundProviderId: Number(templateForm.fundProviderId),
        memberIds: templateForm.memberIds || [],
        profitProviderPercent: Number(templateForm.profitProviderPercent ?? 0),
        profitManagerPercent: Number(templateForm.profitManagerPercent ?? 0),
        lossProviderPercent: Number(templateForm.lossProviderPercent ?? 0),
        lossManagerPercent: Number(templateForm.lossManagerPercent ?? 0),
      };
      if (templateEdit?.id) {
        await client.put(`/profit-shares/rules/${templateEdit.id}`, payload);
      } else {
        await client.post('/profit-shares/rules', payload);
      }
      setTemplateModalOpen(false);
      await reloadAfterChange();
      Alert.alert('Success', templateEdit ? 'Share rule updated' : 'Share rule created');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDeleteTemplate = async (templateId: number) => {
    try {
      await client.delete(`/profit-shares/rules/${templateId}`);
      await reloadAfterChange();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const openPackModal = (pack?: any) => {
    if (!pack && !templates.length) {
      Alert.alert('Create a share rule first', 'Add a rule, then group rules into a template');
      return;
    }
    setPackEdit(pack || null);
    setPackForm(
      pack
        ? { packName: pack.packName || '', ruleIds: pack.ruleIds || [] }
        : { ...EMPTY_PACK_FORM }
    );
    setPackModalOpen(true);
  };

  const onSavePack = async () => {
    if (!packForm.packName?.trim()) {
      Alert.alert('Error', 'Template name is required');
      return;
    }
    if (!packForm.ruleIds?.length) {
      Alert.alert('Error', 'Select at least one share rule');
      return;
    }
    const selected = templates.filter((r: any) => packForm.ruleIds.includes(Number(r.id)));
    const conflicts = findShareRuleConflicts(selected);
    if (conflicts.length) {
      Alert.alert('Rules contradict', formatShareRuleConflicts(conflicts));
      return;
    }
    setSaving(true);
    try {
      const payload = { packName: packForm.packName.trim(), ruleIds: packForm.ruleIds };
      if (packEdit?.id) {
        await client.put(`/profit-shares/packs/${packEdit.id}`, payload);
      } else {
        await client.post('/profit-shares/packs', payload);
      }
      setPackModalOpen(false);
      await reloadAfterChange();
      Alert.alert('Success', packEdit ? 'Share template updated' : 'Share template created');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDeletePack = async (packId: number) => {
    try {
      await client.delete(`/profit-shares/packs/${packId}`);
      await reloadAfterChange();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const openPackMore = (p: any) => {
    openActionSheet(p.packName, [
      { text: 'Edit', onPress: () => openPackModal(p) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete template?', 'IPOs using it will need a new template.', [
            { text: 'Cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDeletePack(p.id) },
          ]),
      },
    ], sharePackLabel(p));
  };

  const openHeaderMore = () => {
    openActionSheet('Profit Sharing', [
      { text: 'Refresh', onPress: load },
      { text: 'Add template', onPress: () => openPackModal() },
      { text: 'Add rule', onPress: () => openTemplateModal() },
    ]);
  };

  const openMemberMore = (m: any) => {
    const items: { text: string; onPress: () => void }[] = [
      { text: 'Manage rules', onPress: () => openManageMember(m) },
      { text: 'Custom rule', onPress: () => openCreateRule([m.memberId]) },
    ];
    openActionSheet(
      m.displayName,
      items,
      m.hasShareRule
        ? `Profit ${pctSummary(m.effectiveProfitProviderPercent, m.effectiveProfitManagerPercent)}`
        : 'No active share rule yet'
    );
  };

  const openTemplateMore = (t: any) => {
    openActionSheet(t.ruleName, [
      { text: 'Edit', onPress: () => openTemplateModal(t) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete rule?', '', [
            { text: 'Cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDeleteTemplate(t.id) },
          ]),
      },
    ], t.providerName);
  };

  const openDistributionMore = (r: any) => {
    openActionSheet(r.display_name, [
      {
        text: 'View details',
        onPress: () =>
          Alert.alert(
            r.ipo_name,
            [
              `Gross P&L: ${formatCurrency(r.gross_profit_loss)}`,
              `Provider: ${formatCurrency(r.provider_amount)}`,
              `Manager: ${formatCurrency(r.manager_amount)}`,
              `Member: ${formatCurrency(r.member_amount)}`,
              formatDateTime(r.distributed_at),
            ].join('\n')
          ),
      },
    ], `${r.ipo_name} · ${formatDateTime(r.distributed_at)}`);
  };

  const openMemberTotalsMore = (r: any) => {
    openActionSheet(r.displayName, [
      {
        text: 'View breakdown',
        onPress: () =>
          Alert.alert(
            r.displayName,
            [
              `Gross IPO P&L: ${formatCurrency(r.grossIpoPnL)}`,
              `Split: ${formatCurrency(r.grossDistributed)}`,
              `Pending: ${r.pendingGross ? formatCurrency(r.pendingGross) : '—'}`,
              `Provider: ${formatCurrency(r.providerShare)}`,
              `Manager: ${formatCurrency(r.managerShare)}`,
              `Member keeps: ${formatCurrency(r.memberShare)}`,
            ].join('\n')
          ),
      },
    ], `PAN ${formatPan(r.pan)} · ${r.ipoCount} IPOs`);
  };

  if (loading && !members.length) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Profit Sharing"
        subtitle={`${activeMembers.length} active members · ${distributions.length} splits`}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />

      {unconfiguredMembers.length > 0 && (
        <Banner variant="warn">
          {`${unconfiguredMembers.length} member(s) are not on any share rule.`}
        </Banner>
      )}

      <View style={{ marginBottom: spacing.md }}>
        {loadingTotals && !totalsLoaded ? (
          <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
            <ActivityIndicator color="#0d9488" />
            <Text style={ui.muted}>Loading P&L…</Text>
          </View>
        ) : (
          <View style={ui.statRow}>
            <PnlStatCard title="Gross P&L" value={overall.grossIpoPnL ?? 0} formatted={formatCurrency(overall.grossIpoPnL ?? 0)} />
            <StatCard title="Manager (you)" value={formatCurrency(overall.managerShare ?? 0)} variant="success" />
            <StatCard title="Members kept" value={formatCurrency(overall.memberShare ?? 0)} variant="default" />
          </View>
        )}
      </View>

      <View style={{ marginBottom: spacing.lg }}>
        <FilterChips
        value={tab}
        onChange={setTab}
        scrollable
        options={[
          { value: 'rules', label: `Templates (${packs.length})` },
          { value: 'totals', label: 'P&L totals' },
          { value: 'members', label: `Members (${activeMembers.length})` },
          { value: 'history', label: `History (${distributions.length})` },
          { value: 'pending', label: `Pending (${pending.length})` },
        ]}
        />
      </View>

      {tab === 'totals' && (
        <ContentCard title="Total profit & loss">
          {loadingTotals && !totals ? (
            <Loading fullScreen={false} />
          ) : (
            <>
          <FilterChips
            value={totalsView}
            onChange={setTotalsView}
            scrollable={false}
            options={[
              { value: 'member', label: 'By member' },
              { value: 'provider', label: 'By provider' },
              { value: 'manager', label: 'Manager' },
            ]}
          />

          {totalsView === 'member' && (
            <>
              {(totals?.byMember || []).length === 0 ? (
                <Text style={ui.muted}>No allotted IPO P&L yet</Text>
              ) : (
                totals.byMember.map((r: any) => (
                  <View key={r.memberId} style={styles.compactRow}>
                    <View style={styles.compactRowMain}>
                      <ListRow
                        title={r.displayName}
                        subtitle={`${formatCurrency(r.grossIpoPnL)} gross · ${formatCurrency(r.memberShare)} kept`}
                        onPress={() => openMemberTotalsMore(r)}
                        right={<Tag label={`${r.ipoCount} IPOs`} color="#64748b" />}
                      />
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {totalsView === 'provider' && (
            <>
              {(totals?.byProvider || []).length === 0 ? (
                <Text style={ui.muted}>No provider shares recorded yet</Text>
              ) : (
                totals.byProvider.map((r: any) => (
                  <ListRow
                    key={r.fundProviderId}
                    title={r.providerName}
                    subtitle={`${formatCurrency(r.totalShare)} total · ${r.distributionCount} splits`}
                    onPress={() =>
                      openActionSheet(r.providerName, [], `Profit ${formatCurrency(r.profitShare)} · Loss ${formatCurrency(r.lossShare)}`)
                    }
                  />
                ))
              )}
            </>
          )}

          {totalsView === 'manager' && (
            <ListRow
              title="Your total share"
              subtitle={`${formatCurrency(totals?.manager?.totalShare ?? 0)} · ${overall.distributionCount ?? 0} splits done`}
              onPress={() =>
                openActionSheet('Manager totals', [], [
                  `Distributed: ${formatCurrency(overall.grossDistributed ?? 0)}`,
                  `Pending: ${formatCurrency(overall.grossPending ?? 0)} (${overall.pendingCount ?? 0} apps)`,
                  `IPO profit: ${formatCurrency(overall.ipoProfit ?? 0)}`,
                  `IPO loss: ${formatCurrency(overall.ipoLoss ?? 0)}`,
                ].join('\n'))
              }
            />
          )}
            </>
          )}
        </ContentCard>
      )}

      {tab === 'rules' && (
        <>
        <ContentCard
          title="Share templates"
          extra={<Button compact mode="contained" onPress={() => openPackModal()}>Add template</Button>}
        >
          {packs.length === 0 ? (
            <Text style={ui.muted}>No templates yet — group one or more share rules (no overlapping members). Each IPO picks one template.</Text>
          ) : (
            packs.map((p) => (
              <View key={p.id} style={styles.compactRow}>
                <View style={styles.compactRowMain}>
                  <ListRow
                    title={p.packName}
                    subtitle={sharePackLabel(p)}
                    onPress={() => openPackMore(p)}
                  />
                </View>
                <Pressable hitSlop={12} onPress={() => openPackMore(p)} style={styles.moreBtn}>
                  <Text style={styles.moreText}>···</Text>
                </Pressable>
              </View>
            ))
          )}
        </ContentCard>
        <ContentCard
          title="Share rules"
          extra={<Button compact mode="contained" onPress={() => openTemplateModal()}>Add rule</Button>}
        >
          {templates.length === 0 ? (
            <Text style={ui.muted}>No share rules yet — add a rule, pick members, then group it into a template for IPOs.</Text>
          ) : (
            templates.map((t) => (
              <View key={t.id} style={styles.compactRow}>
                <View style={styles.compactRowMain}>
                  <ListRow
                    title={t.ruleName}
                    subtitle={shareRuleLabel(t)}
                    onPress={() => openTemplateMore(t)}
                  />
                </View>
                <Pressable hitSlop={12} onPress={() => openTemplateMore(t)} style={styles.moreBtn}>
                  <Text style={styles.moreText}>···</Text>
                </Pressable>
              </View>
            ))
          )}
        </ContentCard>
        </>
      )}

      {tab === 'members' && (
        <ContentCard title="Who is on which rule">
          <Text style={ui.muted}>Members get P&L only when they are on a rule inside the template selected for that IPO. A template can hold several rules if they do not share members.</Text>
          <FilterChips
            value={membersFilter}
            onChange={setMembersFilter}
            scrollable={false}
            options={[
              { value: 'all', label: `All (${activeMembers.length})` },
              { value: 'needs-rule', label: `Need rule (${unconfiguredMembers.length})` },
            ]}
          />

          {filteredMembers.map((m) => {
            const onRules = memberRuleMap.get(m.memberId) || [];
            return (
            <View key={m.memberId} style={[styles.compactRow, !onRules.length && styles.compactRowWarn]}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={m.displayName}
                  subtitle={[
                    formatPan(m.pan),
                    onRules.length ? onRules.map((r: any) => r.ruleName).join(', ') : 'Not on a rule',
                  ].filter(Boolean).join(' · ')}
                  right={
                    onRules.length ? (
                      <Tag label={`${onRules.length} rule${onRules.length === 1 ? '' : 's'}`} color="#059669" />
                    ) : (
                      <Tag label="Need rule" color="#d97706" />
                    )
                  }
                />
                <View style={styles.memberRowActions}>
                <Button
                  compact
                  mode="contained"
                  onPress={() => {
                    if (onRules[0]) openTemplateModal(onRules[0]);
                    else {
                      setTab('rules');
                      openTemplateModal();
                    }
                  }}
                  style={styles.primaryBtn}
                >
                  {onRules.length ? 'Edit rule' : 'Add to rule'}
                </Button>
                </View>
              </View>
            </View>
            );
          })}
        </ContentCard>
      )}

      {tab === 'history' && (
        <ContentCard title="Distributed P&L">
          {loadingReport && !report ? (
            <Loading fullScreen={false} />
          ) : distributions.length === 0 ? (
            <Text style={ui.muted}>No distributions yet</Text>
          ) : (
            distributions.map((r: any) => (
              <View key={r.id} style={styles.compactRow}>
                <View style={styles.compactRowMain}>
                  <ListRow
                    title={r.display_name}
                    subtitle={`${formatCurrency(r.gross_profit_loss)} · ${r.ipo_name}`}
                    onPress={() => openDistributionMore(r)}
                    right={
                      <Tag
                        label={r.pnl_type === 'LOSS' ? 'Loss' : 'Profit'}
                        color={r.pnl_type === 'LOSS' ? '#dc2626' : '#059669'}
                      />
                    }
                  />
                </View>
                <Pressable hitSlop={12} onPress={() => openDistributionMore(r)} style={styles.moreBtn}>
                  <Text style={styles.moreText}>···</Text>
                </Pressable>
              </View>
            ))
          )}
        </ContentCard>
      )}

      {tab === 'pending' && (
        <ContentCard title="Alloted with P&L — not yet distributed">
          {loadingReport && !report ? (
            <Loading fullScreen={false} />
          ) : pending.length === 0 ? (
            <Text style={ui.muted}>All caught up</Text>
          ) : (
            pending.map((r: any) => (
              <ListRow
                key={r.id}
                title={r.display_name}
                subtitle={`${formatCurrency(r.profit_loss)} · ${r.ipo_name}`}
              />
            ))
          )}
        </ContentCard>
      )}

      {/* Manage member rules */}
      <Modal visible={!!manageMember} animationType="slide" onRequestClose={() => setManageMember(null)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>Rules — {manageMember?.displayName}</Text>
            <Button mode="text" onPress={() => setManageMember(null)}>Close</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody}>
            <View style={ui.rowActions}>
              <Button mode="contained" onPress={() => openApplyTemplate([manageMember.memberId])}>Apply from list</Button>
              <Button
                mode="outlined"
                onPress={() =>
                  openActionSheet(`Rules — ${manageMember.displayName}`, [
                    { text: 'Custom rule', onPress: () => openCreateRule([manageMember.memberId]) },
                    ...(memberRules.length > 0
                      ? [{
                          text: 'Clear all rules',
                          style: 'destructive' as const,
                          onPress: () =>
                            Alert.alert('Clear all rules?', '', [
                              { text: 'Cancel' },
                              { text: 'Clear', style: 'destructive', onPress: onClearMemberRules },
                            ]),
                        }]
                      : []),
                  ])
                }
              >
                More
              </Button>
            </View>

            <Banner variant="info">
              One active rule per IPO scope. Applying or adding a rule makes it active and deactivates others for the same scope (All IPOs or a specific IPO).
            </Banner>

            {activeScopeSummaries.length > 0 && (
              <View style={styles.scopeTagRow}>
                {activeScopeSummaries.map((scope) => (
                  <Tag key={scope.label} label={scope.label} color={scope.label === 'All IPOs' ? '#64748b' : '#7c3aed'} />
                ))}
              </View>
            )}

            {rulesLoading ? (
              <Loading fullScreen={false} />
            ) : memberRules.length === 0 ? (
              <Text style={ui.muted}>No rules yet</Text>
            ) : (
              memberRules.map((rule) => (
                <View
                  key={rule.id}
                  style={[styles.compactRow, !isRuleActive(rule) && styles.compactRowInactive]}
                >
                  <View style={styles.compactRowMain}>
                    <ListRow
                      title={rule.ruleName}
                      subtitle={`${rule.profitProviderPercent}/${rule.profitManagerPercent}% profit · ${rule.providerName || '—'}`}
                      onPress={() =>
                        openActionSheet(
                          rule.ruleName,
                          ruleActionItems(rule),
                          rule.ipoId ? (rule.ipoName || `IPO #${rule.ipoId}`) : 'All IPOs'
                        )
                      }
                      right={
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Tag
                            label={isRuleActive(rule) ? 'Active' : 'Inactive'}
                            color={isRuleActive(rule) ? '#059669' : '#94a3b8'}
                          />
                          <Tag
                            label={rule.ipoId ? (rule.ipoName || `IPO #${rule.ipoId}`) : 'All IPOs'}
                            color={rule.ipoId ? '#7c3aed' : '#64748b'}
                          />
                        </View>
                      }
                    />
                  </View>
                  <Pressable
                    hitSlop={12}
                    onPress={() => openActionSheet(rule.ruleName, ruleActionItems(rule))}
                    style={styles.moreBtn}
                  >
                    <Text style={styles.moreText}>···</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Rule form */}
      <Modal visible={ruleModalOpen} animationType="slide" onRequestClose={() => setRuleModalOpen(false)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>{ruleContext?.mode === 'edit' ? 'Edit rule' : 'Add rule'}</Text>
            <Button mode="text" onPress={() => setRuleModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            <RuleFormFields
              form={ruleForm}
              setForm={setRuleForm}
              providers={providers}
              ipos={ipos}
              showIpo
            />
            <Button mode="contained" loading={saving} onPress={onSaveRule}>Save rule</Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Template form */}
      <Modal visible={templateModalOpen} animationType="slide" onRequestClose={() => setTemplateModalOpen(false)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>{templateEdit ? 'Edit share rule' : 'Create share rule'}</Text>
            <Button mode="text" onPress={() => setTemplateModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            <RuleFormFields form={templateForm} setForm={setTemplateForm} providers={providers} ipos={[]} showIpo={false} />
            <Text style={ui.sectionLabel}>Active members on this rule</Text>
            {memberGroupBulkOptions.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {memberGroupBulkOptions.map((opt) => {
                  const on = isGroupFullySelected(templateForm.memberIds || [], opt.ids);
                  return (
                    <Pressable
                      key={opt.key}
                      style={[ui.accountOption, on && ui.accountOptionActive, { paddingVertical: 8, paddingHorizontal: 12 }]}
                      onPress={() =>
                        setTemplateForm({
                          ...templateForm,
                          memberIds: toggleGroupMemberIds(templateForm.memberIds || [], opt.ids),
                        })
                      }
                    >
                      <Text>{opt.label} ({opt.ids.length})</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {pickerMembers.map((m) => {
              const selected = (templateForm.memberIds || []).includes(m.memberId);
              return (
                <Checkbox.Item
                  key={m.memberId}
                  label={isActiveMember(m) ? m.displayName : `${m.displayName} (inactive)`}
                  status={selected ? 'checked' : 'unchecked'}
                  onPress={() => {
                    const current = templateForm.memberIds || [];
                    setTemplateForm({
                      ...templateForm,
                      memberIds: selected
                        ? current.filter((id: number) => id !== m.memberId)
                        : [...current, m.memberId],
                    });
                  }}
                />
              );
            })}
            <Button mode="contained" loading={saving} onPress={onSaveTemplate}>Save</Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={packModalOpen} animationType="slide" onRequestClose={() => setPackModalOpen(false)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>{packEdit ? 'Edit template' : 'Create share template'}</Text>
            <Button mode="text" onPress={() => setPackModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            <TextInput
              label="Template name"
              value={packForm.packName || ''}
              onChangeText={(v) => setPackForm({ ...packForm, packName: v })}
              mode="outlined"
              style={ui.input}
            />
            <Text style={ui.sectionLabel}>Share rules</Text>
            <Text style={ui.muted}>Pick rules that do not share members. Each IPO will use this whole template.</Text>
            {templates.map((r: any) => {
              const selectedIds = (packForm.ruleIds || []).map(Number);
              const checked = selectedIds.includes(Number(r.id));
              return (
                <Checkbox.Item
                  key={r.id}
                  label={shareRuleLabel(r, true)}
                  status={checked ? 'checked' : 'unchecked'}
                  onPress={() => {
                    const { ids, error } = nextShareRuleIdsWithoutConflict(selectedIds, Number(r.id), templates);
                    if (error) {
                      Alert.alert('Rules contradict', error);
                      return;
                    }
                    setPackForm({ ...packForm, ruleIds: ids });
                  }}
                />
              );
            })}
            <Button mode="contained" loading={saving} onPress={onSavePack}>Save template</Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Apply template */}
      <Modal visible={applyModalOpen} animationType="slide" transparent onRequestClose={() => setApplyModalOpen(false)}>
        <View style={ui.modalBg}>
          <View style={ui.modalCard}>
            <Text style={ui.modalTitle}>Apply rule</Text>
            <Text style={ui.muted}>Pick a saved rule from the list</Text>
            {templateOptions.map((opt) => (
              <Pressable
                key={opt.value}
                style={[ui.accountOption, applyTemplateId === opt.value && ui.accountOptionActive]}
                onPress={() => setApplyTemplateId(opt.value)}
              >
                <Text>{opt.label}</Text>
              </Pressable>
            ))}
            <Text style={ui.sectionLabel}>IPO scope (optional)</Text>
            <Pressable
              style={[ui.accountOption, !applyIpoId && ui.accountOptionActive]}
              onPress={() => setApplyIpoId(null)}
            >
              <Text>All IPOs</Text>
            </Pressable>
            {ipos.map((ipo) => (
              <Pressable
                key={ipo.id}
                style={[ui.accountOption, applyIpoId === ipo.id && ui.accountOptionActive]}
                onPress={() => setApplyIpoId(ipo.id)}
              >
                <Text>{ipo.name}</Text>
              </Pressable>
            ))}
            <Button mode="contained" loading={saving} disabled={!applyTemplateId} onPress={onApplyTemplate}>Apply</Button>
            <Button mode="text" onPress={() => setApplyModalOpen(false)}>Cancel</Button>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function RuleFormFields({
  form,
  setForm,
  providers,
  ipos,
  showIpo,
}: {
  form: any;
  setForm: (f: any) => void;
  providers: any[];
  ipos: any[];
  showIpo: boolean;
}) {
  const keepsProfit = Math.max(0, 100 - (Number(form.profitProviderPercent) || 0) - (Number(form.profitManagerPercent) || 0));
  const keepsLoss = Math.max(0, 100 - (Number(form.lossProviderPercent) || 0) - (Number(form.lossManagerPercent) || 0));

  return (
    <>
      <TextInput label="Rule name" value={form.ruleName || ''} onChangeText={(v) => setForm({ ...form, ruleName: v })} mode="outlined" style={ui.input} />

      <Text style={ui.sectionLabel}>Fund provider</Text>
      {providers.map((p) => (
        <Pressable
          key={p.id}
          style={[ui.accountOption, String(form.fundProviderId) === String(p.id) && ui.accountOptionActive]}
          onPress={() => setForm({ ...form, fundProviderId: String(p.id) })}
        >
          <Text>{p.name}</Text>
        </Pressable>
      ))}

      {showIpo && (
        <>
          <Text style={ui.sectionLabel}>Applies to IPO</Text>
          <Text style={[ui.muted, { marginBottom: 8 }]}>
            Leave as All IPOs for default rules, or pick one IPO. Only one active rule per scope.
          </Text>
          <Pressable
            style={[ui.accountOption, !form.ipoId && ui.accountOptionActive]}
            onPress={() => setForm({ ...form, ipoId: '' })}
          >
            <Text>All IPOs</Text>
          </Pressable>
          {ipos.map((ipo) => (
            <Pressable
              key={ipo.id}
              style={[ui.accountOption, String(form.ipoId) === String(ipo.id) && ui.accountOptionActive]}
              onPress={() => setForm({ ...form, ipoId: String(ipo.id) })}
            >
              <Text>{ipo.name}</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={ui.sectionLabel}>When member has profit</Text>
      <View style={styles.percentRow}>
        <TextInput label="Provider %" value={String(form.profitProviderPercent ?? '')} onChangeText={(v) => setForm({ ...form, profitProviderPercent: v })} keyboardType="numeric" mode="outlined" style={styles.percentInput} />
        <TextInput label="Manager %" value={String(form.profitManagerPercent ?? '')} onChangeText={(v) => setForm({ ...form, profitManagerPercent: v })} keyboardType="numeric" mode="outlined" style={styles.percentInput} />
      </View>
      <Text style={ui.muted}>Member keeps {keepsProfit}%</Text>

      <Text style={ui.sectionLabel}>When member has loss</Text>
      <View style={styles.percentRow}>
        <TextInput label="Provider %" value={String(form.lossProviderPercent ?? '')} onChangeText={(v) => setForm({ ...form, lossProviderPercent: v })} keyboardType="numeric" mode="outlined" style={styles.percentInput} />
        <TextInput label="Manager %" value={String(form.lossManagerPercent ?? '')} onChangeText={(v) => setForm({ ...form, lossManagerPercent: v })} keyboardType="numeric" mode="outlined" style={styles.percentInput} />
      </View>
      <Text style={ui.muted}>Member keeps {keepsLoss}%</Text>
    </>
  );
}

const styles = StyleSheet.create({
  percentRow: { flexDirection: 'row', gap: 8 },
  percentInput: { flex: 1, marginBottom: 4 },
  compactRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  compactRowInactive: { opacity: 0.55 },
  compactRowWarn: { backgroundColor: colors.warningLight, borderRadius: radii.md, paddingRight: 4 },
  compactRowMain: { flex: 1 },
  memberRowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginLeft: spacing.sm, marginBottom: spacing.sm },
  scopeTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  primaryBtn: { alignSelf: 'flex-start', marginLeft: spacing.sm, marginBottom: spacing.sm },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.md },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
