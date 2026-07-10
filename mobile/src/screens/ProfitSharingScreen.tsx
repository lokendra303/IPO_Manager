import { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, TextInput } from 'react-native-paper';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import FilterChips from '../components/FilterChips';
import InfoCard from '../components/InfoCard';
import InfoLine from '../components/InfoLine';
import Banner from '../components/Banner';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import { formatCurrency, formatDateTime, formatPan, pnlColor } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { spacing } from '../theme';
import { ui } from '../styles/ui';

type Tab = 'totals' | 'rules' | 'members' | 'history' | 'pending';
type TotalsView = 'member' | 'provider' | 'manager';
type MembersFilter = 'all' | 'needs-rule';

const EMPTY_RULE_FORM = {
  ruleName: '',
  fundProviderId: '',
  ipoId: '',
  profitProviderPercent: '0',
  profitManagerPercent: '0',
  lossProviderPercent: '0',
  lossManagerPercent: '0',
};

function pctSummary(prov: number, mgr: number) {
  const p = Number(prov) || 0;
  const m = Number(mgr) || 0;
  return `${p}% / ${m}% (keeps ${Math.max(0, 100 - p - m)}%)`;
}

type CoreCache = {
  members: any[];
  providers: any[];
  templates: any[];
};

export default function ProfitSharingScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const [members, setMembers] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [ipos, setIpos] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [totalsLoaded, setTotalsLoaded] = useState(false);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('members');
  const [totalsView, setTotalsView] = useState<TotalsView>('member');
  const [membersFilter, setMembersFilter] = useState<MembersFilter>('all');
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState<number | null>(null);
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

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyMemberIds, setApplyMemberIds] = useState<number[]>([]);
  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null);
  const [applyIpoId, setApplyIpoId] = useState<number | null>(null);

  const applyCore = (core: CoreCache) => {
    setMembers(core.members);
    setProviders(core.providers);
    setTemplates(core.templates);
  };

  const loadCore = async () => {
    const [m, p, tpl] = await Promise.all([
      client.get('/profit-shares/members'),
      client.get('/fund-providers'),
      client.get('/profit-shares/rule-templates'),
    ]);
    const core: CoreCache = { members: m.data, providers: p.data, templates: tpl.data };
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
      const { data } = await client.get('/ipos');
      setIpos(data);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load IPOs'));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      await loadCore();
      await Promise.all([loadTotals(true), loadReport(true)]);
      await loadIpos();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load profit sharing'));
    } finally {
      setLoading(false);
    }
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

  const overall = totals?.overall ?? {};
  const distributions = report?.distributions ?? [];
  const pending = report?.pending ?? [];
  const unconfiguredMembers = members.filter((m) => !m.hasShareRule);
  const filteredMembers = membersFilter === 'needs-rule' ? unconfiguredMembers : members;

  const templateOptions = useMemo(
    () => templates.filter((t) => t.hasRule).map((t) => ({ value: t.id, label: `${t.ruleName} (${t.providerName})` })),
    [templates]
  );

  const loadMemberRules = async (memberId: number) => {
    setRulesLoading(true);
    try {
      const { data } = await client.get(`/profit-shares/members/${memberId}/rules`);
      setMemberRules(data.rules || []);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setRulesLoading(false);
    }
  };

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
    setRuleForm({ ...EMPTY_RULE_FORM, ruleName: `Rule ${memberIds.length > 1 ? '' : (memberRules.length + 1)}` });
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
    setApplyIpoId(null);
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
            profitProviderPercent: String(template.profitProviderPercent ?? 0),
            profitManagerPercent: String(template.profitManagerPercent ?? 0),
            lossProviderPercent: String(template.lossProviderPercent ?? 0),
            lossManagerPercent: String(template.lossManagerPercent ?? 0),
          }
        : { ...EMPTY_RULE_FORM }
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
        profitProviderPercent: Number(templateForm.profitProviderPercent ?? 0),
        profitManagerPercent: Number(templateForm.profitManagerPercent ?? 0),
        lossProviderPercent: Number(templateForm.lossProviderPercent ?? 0),
        lossManagerPercent: Number(templateForm.lossManagerPercent ?? 0),
      };
      if (templateEdit?.id) {
        await client.put(`/profit-shares/rule-templates/${templateEdit.id}`, payload);
      } else {
        await client.post('/profit-shares/rule-templates', payload);
      }
      setTemplateModalOpen(false);
      await reloadAfterChange();
      Alert.alert('Success', templateEdit ? 'Rule updated' : 'Rule added to list');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDeleteTemplate = async (templateId: number) => {
    try {
      await client.delete(`/profit-shares/rule-templates/${templateId}`);
      await reloadAfterChange();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  if (loading && !members.length) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Profit Sharing"
        subtitle="Configure share rules and view distribution history"
        extra={<Button compact mode="outlined" onPress={load}>Refresh</Button>}
      />

      {unconfiguredMembers.length > 0 && (
        <Banner variant="warn">
          {`${unconfiguredMembers.length} member(s) still need share rules before P&L can be distributed.`}
        </Banner>
      )}

      <View style={{ marginBottom: spacing.lg }}>
        {loadingTotals && !totalsLoaded ? (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator color="#0d9488" />
            <Text style={ui.muted}>Loading P&L summary…</Text>
          </View>
        ) : (
          <StatGrid>
            <PnlStatCard title="Gross IPO P&L" value={overall.grossIpoPnL ?? 0} formatted={formatCurrency(overall.grossIpoPnL ?? 0)} />
            <StatCard title="Provider share" value={formatCurrency(overall.providerShare ?? 0)} variant="info" />
            <StatCard title="Manager (you)" value={formatCurrency(overall.managerShare ?? 0)} variant="success" />
            <StatCard title="Members kept" value={formatCurrency(overall.memberShare ?? 0)} variant="default" />
          </StatGrid>
        )}
      </View>

      <View style={{ marginBottom: spacing.lg }}>
        <FilterChips
        value={tab}
        onChange={setTab}
        scrollable
        options={[
          { value: 'totals', label: 'P&L totals' },
          { value: 'rules', label: `Rules (${templates.length})` },
          { value: 'members', label: `Members (${members.length})` },
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
                  <InfoCard key={r.memberId} variant="muted" title={r.displayName} meta={`PAN ${formatPan(r.pan)} · ${r.ipoCount} IPOs`}>
                    <InfoLine label="Gross IPO P&L" value={formatCurrency(r.grossIpoPnL)} valueColor={pnlColor(r.grossIpoPnL)} />
                    <InfoLine label="Split (gross)" value={formatCurrency(r.grossDistributed)} />
                    <InfoLine label="Pending split" value={r.pendingGross ? formatCurrency(r.pendingGross) : '—'} />
                    <InfoLine label="Provider got" value={formatCurrency(r.providerShare)} />
                    <InfoLine label="Manager got" value={formatCurrency(r.managerShare)} />
                    <InfoLine label="Member keeps" value={formatCurrency(r.memberShare)} />
                  </InfoCard>
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
                  <InfoCard key={r.fundProviderId} variant="muted" title={r.providerName}>
                    <InfoLine label="Distributions" value={String(r.distributionCount)} />
                    <InfoLine label="Total share" value={formatCurrency(r.totalShare)} valueColor={pnlColor(r.totalShare)} />
                    <InfoLine label="From profits" value={formatCurrency(r.profitShare)} />
                    <InfoLine label="From losses" value={formatCurrency(r.lossShare)} />
                  </InfoCard>
                ))
              )}
            </>
          )}

          {totalsView === 'manager' && (
            <InfoCard variant="highlight">
              <InfoLine label="Your total share" value={formatCurrency(totals?.manager?.totalShare ?? 0)} valueColor={pnlColor(totals?.manager?.totalShare)} />
              <InfoLine label="Gross split (distributed)" value={formatCurrency(overall.grossDistributed ?? 0)} />
              <InfoLine label="Pending to split" value={`${formatCurrency(overall.grossPending ?? 0)} (${overall.pendingCount ?? 0} apps)`} />
              <InfoLine label="IPO profit (allotted)" value={formatCurrency(overall.ipoProfit ?? 0)} valueColor="#059669" />
              <InfoLine label="IPO loss (allotted)" value={formatCurrency(overall.ipoLoss ?? 0)} valueColor="#dc2626" />
              <InfoLine label="Splits done" value={String(overall.distributionCount ?? 0)} />
            </InfoCard>
          )}
            </>
          )}
        </ContentCard>
      )}

      {tab === 'rules' && (
        <ContentCard
          title="Share rule list"
          extra={<Button compact mode="contained" onPress={() => openTemplateModal()}>Add rule</Button>}
        >
          {templates.length === 0 ? (
            <Text style={ui.muted}>No rules yet — add one to apply to members</Text>
          ) : (
            templates.map((t) => (
              <InfoCard key={t.id} title={t.ruleName} meta={t.providerName}>
                <InfoLine
                  label="On profit"
                  value={t.hasRule ? `${t.profitProviderPercent}% provider · ${t.profitManagerPercent}% manager` : 'Not set'}
                />
                <InfoLine
                  label="On loss"
                  value={t.hasRule ? `${t.lossProviderPercent}% provider · ${t.lossManagerPercent}% manager` : '—'}
                />
                <View style={ui.rowActions}>
                  <Button compact onPress={() => openTemplateModal(t)}>Edit</Button>
                  <Button
                    compact
                    textColor="#dc2626"
                    onPress={() =>
                      Alert.alert('Delete rule?', '', [
                        { text: 'Cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => onDeleteTemplate(t.id) },
                      ])
                    }
                  >
                    Delete
                  </Button>
                </View>
              </InfoCard>
            ))
          )}
        </ContentCard>
      )}

      {tab === 'members' && (
        <ContentCard title="Member share rules">
          {templateOptions.length > 0 && (
            <View style={ui.bulkBar}>
              <Text style={ui.sectionLabel}>Quick apply rule</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={ui.chipRow}>
                  {templateOptions.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[ui.chip, bulkTemplateId === opt.value && ui.chipActive]}
                      onPress={() => setBulkTemplateId(opt.value)}
                    >
                      <Text style={[ui.chipText, bulkTemplateId === opt.value && ui.chipTextActive]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              {selectedMemberIds.length > 0 && bulkTemplateId && (
                <Button mode="contained" loading={saving} onPress={() => openApplyTemplate(selectedMemberIds)}>
                  Apply to {selectedMemberIds.length} selected
                </Button>
              )}
            </View>
          )}

          <FilterChips
            value={membersFilter}
            onChange={setMembersFilter}
            scrollable={false}
            options={[
              { value: 'all', label: `All (${members.length})` },
              { value: 'needs-rule', label: `Need rule (${unconfiguredMembers.length})` },
            ]}
          />

          {filteredMembers.map((m) => (
            <InfoCard key={m.memberId} variant={!m.hasShareRule ? 'warn' : 'default'}>
              <View style={ui.cardHeader}>
                <Checkbox
                  status={selectedMemberIds.includes(m.memberId) ? 'checked' : 'unchecked'}
                  onPress={() =>
                    setSelectedMemberIds((prev) =>
                      prev.includes(m.memberId) ? prev.filter((id) => id !== m.memberId) : [...prev, m.memberId]
                    )
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={ui.cardTitle}>{m.displayName}</Text>
                  <Text style={ui.cardMeta}>PAN {formatPan(m.pan)}</Text>
                  {m.effectiveProviderName ? (
                    <Text style={ui.cardMeta}>Fund provider: {m.effectiveProviderName}</Text>
                  ) : null}
                </View>
                {m.hasShareRule ? (
                  <Tag label={`${m.ruleCount} rules`} color="#059669" />
                ) : (
                  <Tag label="Need rule" color="#d97706" />
                )}
              </View>

              {m.hasShareRule ? (
                <>
                  <InfoLine label="Profit %" value={pctSummary(m.effectiveProfitProviderPercent, m.effectiveProfitManagerPercent)} />
                  <InfoLine label="Loss %" value={pctSummary(m.effectiveLossProviderPercent, m.effectiveLossManagerPercent)} />
                </>
              ) : null}

              <View style={ui.rowActions}>
                <Button compact mode="contained" onPress={() => openApplyTemplate([m.memberId])}>Apply rule</Button>
                <Button compact mode="outlined" onPress={() => openCreateRule([m.memberId])}>Custom</Button>
                {m.ruleCount > 0 && (
                  <Button compact onPress={() => openManageMember(m)}>Manage</Button>
                )}
              </View>
            </InfoCard>
          ))}
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
              <InfoCard key={r.id} title={r.display_name} meta={`${r.ipo_name} · ${formatDateTime(r.distributed_at)}`}>
                <Tag label={r.pnl_type === 'LOSS' ? 'Loss %' : 'Profit %'} color={r.pnl_type === 'LOSS' ? '#dc2626' : '#059669'} />
                <InfoLine label="Gross P&L" value={formatCurrency(r.gross_profit_loss)} valueColor={pnlColor(r.gross_profit_loss)} />
                <InfoLine label="Provider share" value={formatCurrency(r.provider_amount)} valueColor={pnlColor(r.provider_amount)} />
                <InfoLine label="Manager share" value={formatCurrency(r.manager_amount)} valueColor={pnlColor(r.manager_amount)} />
                <InfoLine label="Member share" value={formatCurrency(r.member_amount)} valueColor={pnlColor(r.member_amount)} />
              </InfoCard>
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
              <InfoCard key={r.id} title={r.display_name} meta={r.ipo_name}>
                <InfoLine label="P&L" value={formatCurrency(r.profit_loss)} valueColor={pnlColor(r.profit_loss)} />
              </InfoCard>
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
              <Button mode="outlined" onPress={() => openCreateRule([manageMember.memberId])}>Custom rule</Button>
              {memberRules.length > 0 && (
                <Button
                  textColor="#dc2626"
                  onPress={() =>
                    Alert.alert('Clear all rules?', '', [
                      { text: 'Cancel' },
                      { text: 'Clear', style: 'destructive', onPress: onClearMemberRules },
                    ])
                  }
                >
                  Clear all
                </Button>
              )}
            </View>

            {rulesLoading ? (
              <Loading fullScreen={false} />
            ) : memberRules.length === 0 ? (
              <Text style={ui.muted}>No rules yet</Text>
            ) : (
              memberRules.map((rule) => (
                <InfoCard key={rule.id} title={rule.ruleName}>
                  <Tag label={rule.ipoId ? (rule.ipoName || `IPO #${rule.ipoId}`) : 'All IPOs'} color={rule.ipoId ? '#7c3aed' : '#64748b'} />
                  <InfoLine label="Fund provider" value={rule.providerName || '—'} />
                  <InfoLine label="On profit" value={`${rule.profitProviderPercent}% / ${rule.profitManagerPercent}%`} />
                  <InfoLine label="On loss" value={`${rule.lossProviderPercent}% / ${rule.lossManagerPercent}%`} />
                  <View style={ui.rowActions}>
                    <Button compact onPress={() => openEditRule(rule)}>Edit</Button>
                    <Button
                      compact
                      textColor="#dc2626"
                      onPress={() =>
                        Alert.alert('Delete rule?', '', [
                          { text: 'Cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => onDeleteRule(rule.id) },
                        ])
                      }
                    >
                      Delete
                    </Button>
                  </View>
                </InfoCard>
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
            <Text style={ui.modalTitle}>{templateEdit ? 'Edit rule template' : 'Add rule to list'}</Text>
            <Button mode="text" onPress={() => setTemplateModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            <RuleFormFields form={templateForm} setForm={setTemplateForm} providers={providers} ipos={[]} showIpo={false} />
            <Button mode="contained" loading={saving} onPress={onSaveTemplate}>Save</Button>
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
});
