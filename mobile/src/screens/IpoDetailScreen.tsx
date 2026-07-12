import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Checkbox, SegmentedButtons, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import FilterChips from '../components/FilterChips';
import ActionGrid, { ActionCell } from '../components/ActionGrid';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import AllotmentCheckModal from '../components/AllotmentCheckModal';
import Banner from '../components/Banner';
import InfoCard from '../components/InfoCard';
import { ui } from '../styles/ui';
import {
  categoryCompactOptionsForIpo,
  categoryOptionsForIpo,
  categoryTagColor,
  getLotAmountForCategory,
  ipoAllowsHni,
  ipoHasHniLot,
  parseAllowedCategories,
} from '../utils/ipoCategories';
import { formatCurrency, formatPan, pnlColor } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { colors } from '../theme';

const ALLOTMENT_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ALLOTED', label: 'Alloted' },
  { value: 'NOT_ALLOTED', label: 'Not alloted' },
  { value: 'NOT_APPLIED', label: 'Did not apply' },
];

type ReturnFilter = 'all' | 'returned' | 'pending' | 'not_applied' | 'allotted';

function isFundReturned(app: any) {
  return app.trns_received === 'Received';
}

export default function IpoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [ipo, setIpo] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberGroups, setMemberGroups] = useState<any[]>([]);
  const [ipoSummary, setIpoSummary] = useState<any>(null);
  const [wallet, setWallet] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editedRows, setEditedRows] = useState<Record<number, any>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [profitPreview, setProfitPreview] = useState<any[]>([]);
  const [profitLoading, setProfitLoading] = useState(false);
  const [allotmentCheckOpen, setAllotmentCheckOpen] = useState(false);
  const [hniModalOpen, setHniModalOpen] = useState(false);
  const [hniSaving, setHniSaving] = useState(false);
  const [enableHni, setEnableHni] = useState(false);
  const [lotAmountHni, setLotAmountHni] = useState('');
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>('all');
  const [selectedReceiveIds, setSelectedReceiveIds] = useState<number[]>([]);
  const [receiveAccountId, setReceiveAccountId] = useState<number | null>(null);
  const [receivingAppId, setReceivingAppId] = useState<number | null>(null);
  const [receivingBulk, setReceivingBulk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [step, setStep] = useState(0);
  const [distributeMode, setDistributeMode] = useState<'groups' | 'individual'>('groups');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedGroupBulkIds, setSelectedGroupBulkIds] = useState<number[]>([]);
  const [distributeCategory, setDistributeCategory] = useState('RII');
  const [markGiven, setMarkGiven] = useState(true);
  const [payMode, setPayMode] = useState<'single' | 'split'>('single');
  const [payAccountId, setPayAccountId] = useState<number | null>(null);
  const [paySplits, setPaySplits] = useState<Record<number, string>>({});

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [ipoRes, appsRes, membersRes, walletRes, groupsRes, summaryRes] = await Promise.all([
        client.get(`/ipos/${id}`),
        client.get(`/ipos/${id}/applications`),
        client.get('/members'),
        client.get('/wallet'),
        client.get('/member-groups'),
        client.get(`/summary/ipos/${id}`).catch(() => ({ data: null })),
      ]);
      setIpo(ipoRes.data);
      setApplications(appsRes.data);
      setIpoSummary(summaryRes.data);
      const activeMembers = membersRes.data.filter((m: any) => m.status === 'ACTIVE');
      setMembers([...new Map(activeMembers.map((m: any) => [m.id, m])).values()]);
      setMemberGroups(groupsRes.data);
      const accts = walletRes.data.accounts || [];
      setWallet(Number(walletRes.data.balance));
      setBankAccounts(accts);
      setReceiveAccountId(accts.find((a: any) => a.is_default)?.id ?? accts[0]?.id ?? null);
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setIpo(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshReceiveData = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      const [appsRes, walletRes, summaryRes] = await Promise.all([
        client.get(`/ipos/${id}/applications`),
        client.get('/wallet'),
        client.get(`/summary/ipos/${id}`).catch(() => ({ data: null })),
      ]);
      setApplications(appsRes.data);
      setIpoSummary(summaryRes.data);
      const accts = walletRes.data.accounts || [];
      setWallet(Number(walletRes.data.balance));
      setBankAccounts(accts);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to refresh'));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setEditedRows({});
    load();
  }, [id]);

  const isClosed = ipo?.status === 'CLOSED';
  const activeAccounts = bankAccounts.filter((a) => a.is_active);
  const appliedMemberIds = new Set(applications.map((a) => a.member_id));
  const availableMembers = members.filter((m) => !appliedMemberIds.has(m.id));
  const isMemberAvailable = (memberId: number) => availableMembers.some((m) => m.id === memberId);
  const getGroupMemberDistributeReason = (m: any): 'inactive' | 'applied' | null => {
    if (m.status === 'INACTIVE' || !members.some((am) => am.id === m.id)) return 'inactive';
    if (appliedMemberIds.has(m.id)) return 'applied';
    return null;
  };
  const ungroupedAvailable = availableMembers.filter((m) => !m.member_group_id);
  const riiLotAmount = getLotAmountForCategory(ipo, 'RII') ?? 0;
  const hniLotAmount = getLotAmountForCategory(ipo, 'HNI');
  const requiredFundForActiveRii = availableMembers.length * riiLotAmount;
  const requiredFundForActiveHni =
    hniLotAmount != null && ipoHasHniLot(ipo) ? availableMembers.length * hniLotAmount : null;

  const getAllotmentStatus = (app: any) =>
    editedRows[app.id]?.allotmentStatus ?? app.allotment_status;
  const isNotApplied = (app: any) => getAllotmentStatus(app) === 'NOT_APPLIED';
  const isAllotted = (app: any) => getAllotmentStatus(app) === 'ALLOTED';

  const returnedCount = applications.filter(isFundReturned).length;
  const pendingReturnCount = applications.length - returnedCount;
  const notAppliedCount = applications.filter(isNotApplied).length;
  const allottedCount = applications.filter(isAllotted).length;
  const notAppliedPendingReturn = applications.filter((app) => isNotApplied(app) && !isFundReturned(app));

  const filteredApplications = applications.filter((app) => {
    if (returnFilter === 'returned') return isFundReturned(app);
    if (returnFilter === 'pending') return !isFundReturned(app);
    if (returnFilter === 'not_applied') return isNotApplied(app);
    if (returnFilter === 'allotted') return isAllotted(app);
    return true;
  });

  const receivableSelectedIds = selectedReceiveIds.filter((appId) => {
    const app = applications.find((a) => a.id === appId);
    return app && !isFundReturned(app);
  });

  const groupAvailableIds = (group: any) =>
    group.members.filter((m: any) => isMemberAvailable(m.id)).map((m: any) => m.id);
  const isGroupBulkSelected = (groupId: number) => selectedGroupBulkIds.includes(groupId);

  const toggleGroupBulk = (group: any, checked: boolean) => {
    const ids = groupAvailableIds(group);
    setSelectedGroupBulkIds((prev) =>
      checked ? [...new Set([...prev, group.id])] : prev.filter((gid) => gid !== group.id)
    );
    if (checked) setSelectedIds((prev) => prev.filter((mid) => !ids.includes(mid)));
  };

  const toggleGroupSelection = (group: any, checked: boolean) => {
    if (isGroupBulkSelected(group.id)) return;
    const ids = groupAvailableIds(group);
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, ...ids])] : prev.filter((mid) => !ids.includes(mid))
    );
  };

  const toggleMemberSelection = (memberId: number, groupId?: number) => {
    if (!isMemberAvailable(memberId)) return;
    if (groupId && isGroupBulkSelected(groupId)) return;
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((mid) => mid !== memberId) : [...prev, memberId]
    );
  };

  const bulkMemberCount = selectedGroupBulkIds.reduce((sum, gid) => {
    const g = memberGroups.find((gr) => gr.id === gid);
    return sum + (g ? groupAvailableIds(g).length : 0);
  }, 0);
  const distributeSelectionCount = selectedIds.length + bulkMemberCount;

  const ipoCategoryOptions = categoryOptionsForIpo(ipo);
  const allowedCategoryTags = parseAllowedCategories(ipo);
  const lotForCategory = getLotAmountForCategory(ipo, distributeCategory);
  const hniLotMissing = distributeCategory === 'HNI' && lotForCategory == null;
  const totalNeeded = distributeSelectionCount * (lotForCategory ?? 0);

  const splitDebits = Object.entries(paySplits)
    .map(([bankAccountId, amount]) => ({ bankAccountId: Number(bankAccountId), amount: Number(amount) || 0 }))
    .filter((d) => d.amount > 0);
  const splitTotal = splitDebits.reduce((s, d) => s + d.amount, 0);
  const selectedPayAccount = activeAccounts.find((a) => a.id === payAccountId);
  const hasBankAccounts = activeAccounts.length > 0;
  const insufficientSingle =
    payMode === 'single' && selectedPayAccount && totalNeeded > Number(selectedPayAccount.balance);
  const insufficientSplit =
    payMode === 'split' &&
    (splitTotal !== totalNeeded ||
      splitDebits.some((d) => {
        const acc = activeAccounts.find((a) => a.id === d.bankAccountId);
        return !acc || d.amount > Number(acc.balance);
      }));
  const missingPayAccount = payMode === 'single' && hasBankAccounts && !payAccountId;
  const bankStepValid =
    hasBankAccounts &&
    (payMode === 'split'
      ? splitDebits.length > 0 && splitTotal === totalNeeded && !insufficientSplit
      : payAccountId != null && !insufficientSingle);
  const missingReceiveAccount = activeAccounts.length > 1 && !receiveAccountId;
  const unsavedRowCount = Object.keys(editedRows).length;

  const getRowVal = (record: any, field: string, dbField: string) => {
    const edited = editedRows[record.id];
    if (edited && edited[field] !== undefined) return edited[field];
    return record[dbField];
  };

  const updateRow = (appId: number, field: string, value: unknown) => {
    setEditedRows((prev) => ({
      ...prev,
      [appId]: { ...(prev[appId] || {}), id: appId, [field]: value },
    }));
  };

  const openHniSetup = () => {
    setEnableHni(ipoAllowsHni(ipo));
    setLotAmountHni(ipo?.lot_amount_hni != null ? String(ipo.lot_amount_hni) : '');
    setHniModalOpen(true);
  };

  const onSaveHniConfig = async () => {
    setHniSaving(true);
    try {
      const allowedCategories = enableHni ? ['RII', 'HNI'] : ['RII'];
      const body: Record<string, unknown> = { allowedCategories };
      if (enableHni && lotAmountHni !== '') body.lotAmountHni = Number(lotAmountHni);
      const { data } = await client.patch(`/ipos/${id}`, body);
      setIpo(data);
      setHniModalOpen(false);
      if (distributeCategory === 'HNI' && !ipoHasHniLot(data)) setDistributeCategory('RII');
      Alert.alert('Success', enableHni ? 'HNI settings updated' : 'HNI disabled for this IPO');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not save HNI settings'));
    } finally {
      setHniSaving(false);
    }
  };

  const openDistribute = async () => {
    setSelectedIds([]);
    setSelectedGroupBulkIds([]);
    setStep(0);
    const defaultCat = ipoCategoryOptions.some((o) => o.value === 'RII') ? 'RII' : ipoCategoryOptions[0]?.value || 'RII';
    setDistributeCategory(defaultCat);
    setDistributeMode(memberGroups.length ? 'groups' : 'individual');
    setPaySplits({});
    try {
      const { data } = await client.get('/wallet');
      const accts = (data.accounts || []).filter((a: any) => a.is_active);
      setBankAccounts(data.accounts || []);
      setWallet(Number(data.balance));
      if (!accts.length) setPayAccountId(null);
      else {
        setPayMode('single');
        const best = [...accts].sort((a, b) => Number(b.balance) - Number(a.balance))[0];
        setPayAccountId(best?.id ?? null);
      }
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load bank accounts'));
    }
    setDistributeOpen(true);
  };

  const onUndoChanges = () => {
    if (!unsavedRowCount) return;
    setEditedRows({});
    Alert.alert('Undone', 'Unsaved changes discarded');
  };

  const onSaveBulk = async () => {
    const updates = Object.entries(editedRows)
      .map(([appId, vals]) => {
        const update: any = { id: Number(appId) };
        if (vals.allotmentStatus !== undefined) update.allotmentStatus = vals.allotmentStatus;
        if (vals.profitLoss !== undefined) update.profitLoss = vals.profitLoss;
        if (vals.remarks !== undefined) update.remarks = vals.remarks;
        if (vals.amount !== undefined) update.amount = vals.amount;
        if (vals.investorCategory !== undefined) update.investorCategory = vals.investorCategory;
        return update;
      })
      .filter((u) => Object.keys(u).length > 1);

    if (!updates.length) {
      Alert.alert('Info', 'No changes to save');
      return;
    }

    for (const u of updates) {
      if (u.allotmentStatus === 'ALLOTED' && u.profitLoss === undefined) {
        const row = applications.find((a) => a.id === u.id);
        if (row?.allotment_status !== 'ALLOTED' && row?.profit_loss == null) {
          Alert.alert('Warning', 'Set P&L for newly allotted applications before saving');
          return;
        }
      }
      if (u.amount !== undefined && (u.amount == null || u.amount <= 0)) {
        Alert.alert('Error', 'Application amount must be greater than zero');
        return;
      }
    }

    try {
      const { data } = await client.patch('/ipo-applications/bulk', { updates });
      const auto = data.autoDistributions || [];
      const applied = auto.filter((r: any) => !r.skipped);
      setEditedRows({});
      load();
      if (applied.length) {
        Alert.alert('Success', `Saved. P&L share applied for ${applied.length} member(s).`);
      } else {
        Alert.alert('Success', 'Applications updated');
      }
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Update failed'));
    }
  };

  const onDistribute = async () => {
    if (!distributeSelectionCount) {
      Alert.alert('Warning', 'Select at least one member or sub-group bulk payment');
      return;
    }
    if (!hasBankAccounts) {
      Alert.alert('Warning', 'Add a bank account under Wallet before distributing');
      return;
    }
    if (payMode === 'single' && (!payAccountId || insufficientSingle)) {
      Alert.alert('Warning', insufficientSingle ? 'Selected account does not have enough balance' : 'Select bank account');
      return;
    }
    if (payMode === 'split' && (splitTotal !== totalNeeded || insufficientSplit)) {
      Alert.alert('Warning', 'Adjust split amounts to match total and account balances');
      return;
    }

    setDistributing(true);
    try {
      const body: Record<string, unknown> = {
        memberIds: selectedIds,
        groupBulks: selectedGroupBulkIds.map((groupId) => ({ groupId, investorCategory: distributeCategory })),
        markGiven,
        investorCategory: distributeCategory,
      };
      if (payMode === 'split' && splitDebits.length) body.accountDebits = splitDebits;
      else body.bankAccountId = payAccountId;

      await client.post(`/ipos/${id}/distribute`, body);
      setDistributeOpen(false);
      setSelectedIds([]);
      setSelectedGroupBulkIds([]);
      setStep(0);
      load();
      Alert.alert('Success', 'Funds distributed to team');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Distribution failed'));
    } finally {
      setDistributing(false);
    }
  };

  const onReceive = async (appId: number) => {
    if (missingReceiveAccount) {
      Alert.alert('Warning', 'Select which bank account should receive returned funds');
      return;
    }
    setReceivingAppId(appId);
    try {
      await client.post(`/ipos/applications/${appId}/receive`, {
        returnToWallet: true,
        bankAccountId: receiveAccountId,
      });
      setSelectedReceiveIds((prev) => prev.filter((aid) => aid !== appId));
      await refreshReceiveData();
      Alert.alert('Success', 'Marked as received — funds returned to wallet');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed'));
    } finally {
      setReceivingAppId(null);
    }
  };

  const onReceiveBulk = async () => {
    if (!receivableSelectedIds.length) {
      Alert.alert('Warning', 'Select members whose funds you have received back');
      return;
    }
    if (missingReceiveAccount) {
      Alert.alert('Warning', 'Select which bank account should receive returned funds');
      return;
    }
    setReceivingBulk(true);
    try {
      const { data } = await client.post('/ipos/applications/receive-bulk', {
        applicationIds: receivableSelectedIds,
        returnToWallet: true,
        bankAccountId: receiveAccountId,
      });
      const ok = data.receivedCount || 0;
      const fail = data.failed?.length || 0;
      if (ok) Alert.alert('Success', `Received funds for ${ok} member(s)`);
      if (fail) Alert.alert('Warning', `${fail} could not be received`);
      setSelectedReceiveIds([]);
      await refreshReceiveData();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Bulk receive failed'));
    } finally {
      setReceivingBulk(false);
    }
  };

  const onCloseIpo = async () => {
    setStatusLoading(true);
    try {
      const { data } = await client.post(`/ipos/${id}/close`);
      setIpo(data);
      Alert.alert('Success', 'IPO closed');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setStatusLoading(false);
    }
  };

  const onReopenIpo = async () => {
    setStatusLoading(true);
    try {
      const { data } = await client.post(`/ipos/${id}/reopen`);
      setIpo(data);
      Alert.alert('Success', 'IPO reopened');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
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
      if (!data.length) Alert.alert('Info', 'No pending allotted applications with P&L to distribute');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setProfitLoading(false);
    }
  };

  const onConfirmProfitShare = async () => {
    setProfitLoading(true);
    try {
      const { data } = await client.post('/profit-shares/distribute', { ipoId: Number(id) });
      setProfitModalOpen(false);
      load();
      Alert.alert('Success', `Distributed P&L for ${data.count} application(s)`);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setProfitLoading(false);
    }
  };

  const profitHasWarnings = profitPreview.some((r) => r.configWarning);

  if (loading && !ipo) return <Loading />;

  if (loadError && !loading) {
    return (
      <Screen>
        <ContentCard title="Could not load IPO">
          <Text style={styles.errorText}>{loadError}</Text>
          <Button mode="contained" onPress={() => router.back()}>Back to IPOs</Button>
        </ContentCard>
      </Screen>
    );
  }

  if (!ipo) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title={ipo.name}
        subtitle={
          `${ipo.ipo_segment} · ${isClosed ? 'Closed' : 'Open'} · Wallet ${formatCurrency(wallet)} · ${applications.length} apps\n` +
          `RII ${formatCurrency(getLotAmountForCategory(ipo, 'RII'))}` +
          (ipoAllowsHni(ipo)
            ? ` · HNI ${ipoHasHniLot(ipo) ? formatCurrency(getLotAmountForCategory(ipo, 'HNI')) : 'not set'}`
            : '')
        }
        extra={<Button compact mode="outlined" onPress={() => router.back()}>Back</Button>}
      />

      {allowedCategoryTags.length > 0 && (
        <View style={styles.tagRow}>
          {allowedCategoryTags.map((c) => (
            <Tag key={c} label={c} color={categoryTagColor(c)} />
          ))}
        </View>
      )}

      {unsavedRowCount > 0 && (
        <Banner variant="warn">{`${unsavedRowCount} unsaved change(s) — tap Save changes`}</Banner>
      )}

      {ipoSummary && (
        <ContentCard title="IPO summary">
          <StatGrid>
            <StatCard title="Members" value={ipoSummary.applicationCount} variant="info" />
            <StatCard title="Distributed" value={formatCurrency(ipoSummary.totalDistributed)} variant="primary" />
            <StatCard title="Returned" value={formatCurrency(ipoSummary.totalReturned)} variant="success" />
            <StatCard title="Pending return" value={formatCurrency(ipoSummary.pendingReturn)} variant="warning" />
            <StatCard
              title="Gross P&L"
              value={formatCurrency(ipoSummary.totalProfitLoss)}
              variant={Number(ipoSummary.totalProfitLoss) >= 0 ? 'success' : 'danger'}
            />
            <StatCard title="Manager share" value={formatCurrency(ipoSummary.shareManagerTotal)} variant="info" />
          </StatGrid>
          <Text style={styles.summaryMeta}>
            Alloted {ipoSummary.allottedCount} · Not alloted {ipoSummary.notAllottedCount} · Did not apply{' '}
            {ipoSummary.notAppliedCount} · Pending {ipoSummary.pendingAllotmentCount} · Returns{' '}
            {ipoSummary.returnedCount}/{ipoSummary.applicationCount}
          </Text>
        </ContentCard>
      )}

      {!isClosed && (
        <ContentCard title="Required fund (active members)">
          {availableMembers.length === 0 ? (
            <Text style={ui.hint}>All active members already have an application for this IPO.</Text>
          ) : (
            <>
              <Text style={styles.summaryMeta}>
                {availableMembers.length} available × {formatCurrency(riiLotAmount)} (RII) ={' '}
                <Text style={styles.bold}>{formatCurrency(requiredFundForActiveRii)}</Text>
              </Text>
              {requiredFundForActiveHni != null && (
                <Text style={styles.summaryMeta}>
                  {availableMembers.length} available × {formatCurrency(hniLotAmount)} (HNI) ={' '}
                  <Text style={styles.bold}>{formatCurrency(requiredFundForActiveHni)}</Text>
                </Text>
              )}
              <Text style={ui.hint}>
                Wallet {formatCurrency(wallet)}
                {wallet < requiredFundForActiveRii ? ' — short for full RII distribution' : ''}
              </Text>
            </>
          )}
        </ContentCard>
      )}

      <ContentCard title="Actions">
        <ActionGrid>
          {!isClosed && (
            <ActionCell>
              <Button mode="contained" disabled={!availableMembers.length} onPress={openDistribute} style={styles.fullBtn}>
                Distribute funds
              </Button>
            </ActionCell>
          )}
          <ActionCell>
            <Button mode="contained" onPress={onSaveBulk} disabled={!unsavedRowCount} style={styles.fullBtn}>
              Save changes{unsavedRowCount ? ` (${unsavedRowCount})` : ''}
            </Button>
          </ActionCell>
          <ActionCell>
            <Button mode="outlined" onPress={onUndoChanges} disabled={!unsavedRowCount} style={styles.fullBtn}>
              Undo changes
            </Button>
          </ActionCell>
          {applications.length > 0 && (
            <ActionCell>
              <Button mode="outlined" onPress={() => setAllotmentCheckOpen(true)} style={styles.fullBtn}>
                Check allotment
              </Button>
            </ActionCell>
          )}
          <ActionCell>
            <Button mode="outlined" loading={profitLoading} disabled={isClosed} onPress={onPreviewProfitShare} style={styles.fullBtn}>
              Distribute P&L
            </Button>
          </ActionCell>
          {!isClosed && (
            <ActionCell>
              <Button mode="outlined" onPress={openHniSetup} style={styles.fullBtn}>
                {ipoAllowsHni(ipo) ? 'HNI settings' : 'Set up HNI'}
              </Button>
            </ActionCell>
          )}
          <ActionCell>
            {isClosed ? (
              <Button loading={statusLoading} onPress={onReopenIpo} style={styles.fullBtn}>Reopen IPO</Button>
            ) : (
              <Button
                mode="outlined"
                textColor="#dc2626"
                loading={statusLoading}
                onPress={() =>
                  Alert.alert('Close IPO?', 'No wallet transactions until reopened.', [
                    { text: 'Cancel' },
                    { text: 'Close', style: 'destructive', onPress: onCloseIpo },
                  ])
                }
                style={styles.fullBtn}
              >
                Close IPO
              </Button>
            )}
          </ActionCell>
        </ActionGrid>
      </ContentCard>

      {!isClosed && !ipoAllowsHni(ipo) && (
        <View style={[ui.banner, ui.bannerInfo]}>
          <Text style={ui.bannerText}>HNI is optional. Enable HNI and set lot amount when needed.</Text>
          <Button compact mode="contained" onPress={openHniSetup}>Set up HNI</Button>
        </View>
      )}
      {!isClosed && ipoAllowsHni(ipo) && !ipoHasHniLot(ipo) && (
        <View style={[ui.banner, ui.bannerWarn]}>
          <Text style={ui.bannerText}>HNI enabled — lot amount not set yet.</Text>
          <Button compact mode="contained" onPress={openHniSetup}>Set HNI lot</Button>
        </View>
      )}
      {isClosed && (
        <Banner variant="warn">
          IPO is closed. You can still mark member returns. Reopen to distribute or run P&L splits.
        </Banner>
      )}
      {notAppliedPendingReturn.length > 0 && (
        <Banner variant="info">
          {`${notAppliedPendingReturn.length} member(s) did not apply — set allotment to Did not apply, save, then Receive when money is back.`}
        </Banner>
      )}

      {activeAccounts.length > 0 && (
        <ContentCard title="Member returns credit to">
          {activeAccounts.map((a) => (
            <Pressable
              key={a.id}
              style={[ui.accountOption, receiveAccountId === a.id && ui.accountOptionActive]}
              onPress={() => setReceiveAccountId(a.id)}
            >
              <Text>{a.label} — {formatCurrency(a.balance)}</Text>
            </Pressable>
          ))}
          {missingReceiveAccount && (
            <Text style={styles.warnText}>Select account before marking receive</Text>
          )}
        </ContentCard>
      )}

      <ContentCard
        title={`Applications (${filteredApplications.length}${returnFilter !== 'all' ? ` of ${applications.length}` : ''})`}
      >
        {applications.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <FilterChips
            value={returnFilter}
            onChange={setReturnFilter}
            options={[
              { value: 'all', label: `All (${applications.length})` },
              { value: 'returned', label: `Returned (${returnedCount})` },
              { value: 'pending', label: `Pending (${pendingReturnCount})` },
              { value: 'not_applied', label: `No apply (${notAppliedCount})` },
              { value: 'allotted', label: `Alloted (${allottedCount})` },
            ]}
            />
          </View>
        )}
        {receivableSelectedIds.length > 0 && (
          <Button mode="contained" loading={receivingBulk} onPress={onReceiveBulk} style={{ marginBottom: 12 }}>
            Receive selected ({receivableSelectedIds.length})
          </Button>
        )}

        {refreshing ? (
          <Loading fullScreen={false} />
        ) : filteredApplications.length === 0 ? (
          <Text style={ui.muted}>No applications in this filter</Text>
        ) : (
          filteredApplications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              ipo={ipo}
              isClosed={isClosed}
              getRowVal={getRowVal}
              updateRow={updateRow}
              selected={selectedReceiveIds.includes(app.id)}
              onToggleSelect={() =>
                !isFundReturned(app) &&
                setSelectedReceiveIds((prev) =>
                  prev.includes(app.id) ? prev.filter((aid) => aid !== app.id) : [...prev, app.id]
                )
              }
              onReceive={() => onReceive(app.id)}
              receiving={receivingAppId === app.id}
              canReceive={!isFundReturned(app)}
            />
          ))
        )}
      </ContentCard>

      {/* Distribute modal */}
      <Modal visible={distributeOpen} animationType="slide" onRequestClose={() => { setDistributeOpen(false); setStep(0); }}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>Distribute for IPO — step {step + 1}/3</Text>
            <Button mode="text" onPress={() => { setDistributeOpen(false); setStep(0); }}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            {step === 0 && (
              <>
                {memberGroups.length > 0 && (
                  <SegmentedButtons
                    value={distributeMode}
                    onValueChange={(v) => setDistributeMode(v as 'groups' | 'individual')}
                    buttons={[
                      { value: 'groups', label: 'By sub-group' },
                      { value: 'individual', label: 'All members' },
                    ]}
                    style={{ marginBottom: 12 }}
                  />
                )}

                {distributeMode === 'groups' && memberGroups.length > 0 ? (
                  memberGroups.map((group) => {
                    const groupAvailable = group.members.filter((m: any) => isMemberAvailable(m.id));
                    const bulkSelected = isGroupBulkSelected(group.id);
                    const selectedInGroup = groupAvailable.filter((m: any) => selectedIds.includes(m.id));
                    const allSelected = !bulkSelected && groupAvailable.length > 0 && selectedInGroup.length === groupAvailable.length;
                    const hasOwner = !!group.ownerMemberId;

                    return (
                      <View key={group.id} style={styles.groupBox}>
                        <Checkbox.Item
                          label={`${group.name} — bulk to owner${hasOwner ? ` (${group.ownerDisplayName})` : ' (set owner)'}`}
                          status={bulkSelected ? 'checked' : 'unchecked'}
                          disabled={!groupAvailable.length || !hasOwner}
                          onPress={() => toggleGroupBulk(group, !bulkSelected)}
                        />
                        {!bulkSelected && (
                          <>
                            <Checkbox.Item
                              label="Select all in group"
                              status={allSelected ? 'checked' : 'unchecked'}
                              disabled={!groupAvailable.length}
                              onPress={() => toggleGroupSelection(group, !allSelected)}
                            />
                            {group.members.map((m: any) => {
                              const available = isMemberAvailable(m.id);
                              const reason = getGroupMemberDistributeReason(m);
                              const suffix =
                                reason === 'inactive'
                                  ? ' — inactive'
                                  : reason === 'applied'
                                    ? ' — already applied'
                                    : '';
                              return (
                                <Checkbox.Item
                                  key={m.id}
                                  label={`${m.displayName} (${formatPan(m.pan)})${suffix}`}
                                  status={selectedIds.includes(m.id) ? 'checked' : 'unchecked'}
                                  disabled={!available}
                                  onPress={() => toggleMemberSelection(m.id, group.id)}
                                />
                              );
                            })}
                          </>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <>
                    {availableMembers.map((m) => (
                      <Checkbox.Item
                        key={m.id}
                        label={`${m.display_name} (${formatPan(m.pan)})`}
                        status={selectedIds.includes(m.id) ? 'checked' : 'unchecked'}
                        onPress={() => toggleMemberSelection(m.id)}
                      />
                    ))}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      <Button mode="text" onPress={() => setSelectedIds(availableMembers.map((m) => m.id))}>
                        Select all
                      </Button>
                      <Button
                        mode="text"
                        disabled={!selectedIds.length && !selectedGroupBulkIds.length}
                        onPress={() => {
                          setSelectedIds([]);
                          setSelectedGroupBulkIds([]);
                        }}
                      >
                        Deselect all
                      </Button>
                    </View>
                  </>
                )}

                {ungroupedAvailable.length > 0 && distributeMode === 'groups' && (
                  <>
                    <Text style={styles.sectionTitle}>No sub-group</Text>
                    {ungroupedAvailable.map((m) => (
                      <Checkbox.Item
                        key={m.id}
                        label={`${m.display_name} (${formatPan(m.pan)})`}
                        status={selectedIds.includes(m.id) ? 'checked' : 'unchecked'}
                        onPress={() => toggleMemberSelection(m.id)}
                      />
                    ))}
                  </>
                )}

                {distributeMode === 'groups' && memberGroups.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    <Button
                      mode="text"
                      onPress={() => {
                        setSelectedGroupBulkIds([]);
                        setSelectedIds(availableMembers.map((m) => m.id));
                      }}
                    >
                      Select all
                    </Button>
                    <Button
                      mode="text"
                      disabled={!selectedIds.length && !selectedGroupBulkIds.length}
                      onPress={() => {
                        setSelectedIds([]);
                        setSelectedGroupBulkIds([]);
                      }}
                    >
                      Deselect all
                    </Button>
                  </View>
                )}

                <Text style={ui.hint}>
                  Selected: {distributeSelectionCount} × {formatCurrency(lotForCategory)} = {formatCurrency(totalNeeded)}
                </Text>
                {availableMembers.length > 0 && (
                  <Text style={ui.hint}>
                    Full active list: {availableMembers.length} × {formatCurrency(lotForCategory)} ={' '}
                    {formatCurrency(availableMembers.length * (lotForCategory ?? 0))}
                  </Text>
                )}
                <Button mode="contained" disabled={!distributeSelectionCount} onPress={() => setStep(1)}>Next</Button>
              </>
            )}

            {step === 1 && (
              <>
                <Text style={styles.sectionTitle}>Application category</Text>
                <SegmentedButtons
                  value={distributeCategory}
                  onValueChange={setDistributeCategory}
                  buttons={ipoCategoryOptions.map((o) => ({ value: o.value, label: o.value }))}
                  style={{ marginBottom: 12 }}
                />
                {hniLotMissing && (
                  <Text style={styles.warnText}>Set HNI lot amount before distributing as HNI</Text>
                )}

                <View style={styles.switchRow}>
                  <Text>Mark as applied (Given)</Text>
                  <Switch value={markGiven} onValueChange={setMarkGiven} />
                </View>

                <Text style={styles.sectionTitle}>Pay from bank account</Text>
                <Text style={ui.hint}>Total needed: {formatCurrency(totalNeeded)} · Wallet: {formatCurrency(wallet)}</Text>

                {!hasBankAccounts ? (
                  <Text style={styles.warnText}>Add bank accounts under Wallet first</Text>
                ) : (
                  <>
                    {activeAccounts.length > 1 && (
                      <SegmentedButtons
                        value={payMode}
                        onValueChange={(v) => { setPayMode(v as 'single' | 'split'); if (v === 'split') setPaySplits({}); }}
                        buttons={[
                          { value: 'single', label: 'One account' },
                          { value: 'split', label: 'Split' },
                        ]}
                        style={{ marginBottom: 12 }}
                      />
                    )}

                    {payMode === 'single' ? (
                      activeAccounts.map((a) => {
                        const canAfford = Number(a.balance) >= totalNeeded;
                        return (
                          <Pressable
                            key={a.id}
                            style={[
                              ui.accountOption,
                              payAccountId === a.id && ui.accountOptionActive,
                              !canAfford && styles.accountDisabled,
                            ]}
                            onPress={() => canAfford && setPayAccountId(a.id)}
                          >
                            <Text>{a.label} — {formatCurrency(a.balance)}{!canAfford ? ' (insufficient)' : ''}</Text>
                          </Pressable>
                        );
                      })
                    ) : (
                      <>
                        {activeAccounts.map((a) => (
                          <View key={a.id} style={styles.splitRow}>
                            <Text style={{ flex: 1 }}>{a.label}</Text>
                            <TextInput
                              dense
                              mode="outlined"
                              keyboardType="numeric"
                              placeholder="₹0"
                              value={paySplits[a.id] || ''}
                              onChangeText={(v) => setPaySplits((prev) => ({ ...prev, [a.id]: v }))}
                              style={styles.splitInput}
                            />
                          </View>
                        ))}
                        <Text style={splitTotal !== totalNeeded ? styles.warnText : ui.muted}>
                          Split: {formatCurrency(splitTotal)} / {formatCurrency(totalNeeded)}
                        </Text>
                      </>
                    )}
                  </>
                )}

                <View style={ui.modalNav}>
                  <Button onPress={() => setStep(0)}>Back</Button>
                  <Button mode="contained" disabled={!bankStepValid || hniLotMissing} onPress={() => setStep(2)}>Next</Button>
                </View>
              </>
            )}

            {step === 2 && (
              <>
                <Text>Applications: <Text style={styles.bold}>{distributeSelectionCount}</Text></Text>
                <Text>Category: <Text style={styles.bold}>{distributeCategory}</Text></Text>
                <Text>Lot: <Text style={styles.bold}>{formatCurrency(lotForCategory)}</Text></Text>
                <Text>Total: <Text style={styles.bold}>{formatCurrency(totalNeeded)}</Text></Text>
                {payMode === 'single' && selectedPayAccount && (
                  <Text style={ui.hint}>Pay from {selectedPayAccount.label}</Text>
                )}
                {payMode === 'split' && splitDebits.map((d) => {
                  const acc = activeAccounts.find((a) => a.id === d.bankAccountId);
                  return <Text key={d.bankAccountId} style={ui.hint}>{acc?.label}: {formatCurrency(d.amount)}</Text>;
                })}
                <View style={ui.modalNav}>
                  <Button onPress={() => setStep(1)}>Back</Button>
                  <Button
                    mode="contained"
                    loading={distributing}
                    disabled={distributing || hniLotMissing || missingPayAccount || insufficientSingle || insufficientSplit}
                    onPress={onDistribute}
                  >
                    Confirm distribution
                  </Button>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* HNI modal */}
      <Modal visible={hniModalOpen} animationType="slide" transparent onRequestClose={() => setHniModalOpen(false)}>
        <View style={ui.modalBg}>
          <View style={ui.modalCard}>
            <Text style={ui.modalTitle}>HNI settings</Text>
            <Checkbox.Item
              label="Enable HNI applications for this IPO"
              status={enableHni ? 'checked' : 'unchecked'}
              onPress={() => setEnableHni(!enableHni)}
            />
            {enableHni && (
              <TextInput
                label="HNI lot amount (₹)"
                value={lotAmountHni}
                onChangeText={setLotAmountHni}
                keyboardType="numeric"
                mode="outlined"
                style={ui.input}
              />
            )}
            <Button mode="contained" loading={hniSaving} onPress={onSaveHniConfig}>Save</Button>
            <Button mode="text" onPress={() => setHniModalOpen(false)}>Cancel</Button>
          </View>
        </View>
      </Modal>

      {/* Profit modal */}
      <Modal visible={profitModalOpen} animationType="slide" onRequestClose={() => setProfitModalOpen(false)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>Distribute P&L (by %)</Text>
            <Button mode="text" onPress={() => setProfitModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody}>
            {profitHasWarnings && (
              <Banner variant="warn">Some members need share rules under Profit Sharing before confirming.</Banner>
            )}
            {profitPreview.map((row) => (
              <View key={row.applicationId} style={styles.profitRow}>
                <Text style={styles.bold}>{row.memberName}</Text>
                <Text style={{ color: pnlColor(row.grossProfitLoss) }}>Gross: {formatCurrency(row.grossProfitLoss)}</Text>
                {row.configWarning ? (
                  <Tag label={row.configWarning} color="#dc2626" />
                ) : (
                  <Text style={ui.muted}>
                    Provider {formatCurrency(row.providerAmount)} · Manager {formatCurrency(row.managerAmount)} · Member keeps {formatCurrency(row.memberAmount)}
                  </Text>
                )}
              </View>
            ))}
            <Button
              mode="contained"
              loading={profitLoading}
              disabled={!profitPreview.length || profitHasWarnings}
              onPress={onConfirmProfitShare}
            >
              Confirm distribution
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <AllotmentCheckModal
        ipoId={Number(id)}
        visible={allotmentCheckOpen}
        onClose={() => setAllotmentCheckOpen(false)}
        onApplyStatus={(appId, status) => {
          updateRow(appId, 'allotmentStatus', status);
          if (status === 'NOT_ALLOTED') updateRow(appId, 'profitLoss', null);
        }}
      />
    </Screen>
  );
}

function ApplicationCard({
  app,
  ipo,
  isClosed,
  getRowVal,
  updateRow,
  selected,
  onToggleSelect,
  onReceive,
  receiving,
  canReceive,
}: any) {
  const status = getRowVal(app, 'allotmentStatus', 'allotment_status');
  const pnl = getRowVal(app, 'profitLoss', 'profit_loss');
  const amount = getRowVal(app, 'amount', 'amount');
  const category = getRowVal(app, 'investorCategory', 'investor_category') || 'RII';
  const remarks = getRowVal(app, 'remarks', 'remarks') ?? '';
  const categoryOptions = categoryCompactOptionsForIpo(ipo);

  return (
    <InfoCard variant="muted">
      <View style={ui.cardHeader}>
        {!isFundReturned(app) && (
          <Checkbox status={selected ? 'checked' : 'unchecked'} onPress={onToggleSelect} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.bold}>{app.display_name}</Text>
          <Text style={ui.muted}>PAN {formatPan(app.pan)}</Text>
        </View>
        {isFundReturned(app) ? (
          <Tag label="Returned" color="#059669" />
        ) : (
          <Tag label="Pending return" color="#64748b" />
        )}
      </View>

      <View style={styles.metaRow}>
        {app.member_group_name ? <Tag label={app.member_group_name} color="#3b82f6" /> : null}
        {app.paid_to_member_id && app.paid_to_member_id !== app.member_id ? (
          <Tag label={`To ${app.paid_to_display_name}`} color="#d97706" />
        ) : (
          <Text style={ui.muted}>Direct payment</Text>
        )}
        {app.trns_given ? <Tag label={app.trns_given} color="#3b82f6" /> : null}
      </View>

      <Text style={styles.sectionTitle}>Category</Text>
      {categoryOptions.length > 1 ? (
        <View style={ui.chipRow}>
          {categoryOptions.map((opt) => (
            <Pressable
              key={opt.value}
              style={[ui.chip, category === opt.value && ui.chipActive, isClosed && ui.chipDisabled]}
              onPress={() => !isClosed && updateRow(app.id, 'investorCategory', opt.value)}
            >
              <Text style={[ui.chipText, category === opt.value && ui.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Tag label={category} color={categoryTagColor(category)} />
      )}

      <TextInput
        dense
        label="Amount (₹)"
        value={String(amount ?? '')}
        onChangeText={(v) => updateRow(app.id, 'amount', v === '' ? null : Number(v))}
        keyboardType="numeric"
        mode="outlined"
        disabled={isClosed}
        style={ui.input}
      />

      <Text style={styles.sectionTitle}>Allotment</Text>
      <View style={ui.chipRow}>
        {ALLOTMENT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[ui.chip, status === opt.value && ui.chipActive]}
            onPress={() => {
              if (isClosed) return;
              updateRow(app.id, 'allotmentStatus', opt.value);
              if (opt.value === 'NOT_ALLOTED' || opt.value === 'NOT_APPLIED') {
                updateRow(app.id, 'profitLoss', null);
              }
            }}
          >
            <Text style={[ui.chipText, status === opt.value && ui.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {status === 'ALLOTED' && (
        <TextInput
          dense
          label="P&L (+ profit / − loss)"
          value={pnl != null ? String(pnl) : ''}
          onChangeText={(v) => updateRow(app.id, 'profitLoss', v === '' ? null : Number(v))}
          keyboardType="numeric"
          mode="outlined"
          disabled={isClosed}
          style={ui.input}
        />
      )}

      {app.profit_share_distribution_id ? (
        <Tag label="P&L split done" color="#7c3aed" />
      ) : status === 'ALLOTED' && pnl != null && Number(pnl) !== 0 ? (
        <Tag label="P&L splits on save" color="#d97706" />
      ) : null}

      <TextInput
        dense
        label="Remarks"
        value={remarks}
        onChangeText={(v) => updateRow(app.id, 'remarks', v)}
        mode="outlined"
        disabled={isClosed}
        style={ui.input}
      />

      {canReceive ? (
        <Button compact mode="contained" loading={receiving} onPress={onReceive}>
          Receive — return to wallet
        </Button>
      ) : (
        <Tag label="Settled" color="#059669" />
      )}
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  warnText: { color: '#dc2626', fontSize: 13, marginTop: 4 },
  errorText: { color: '#dc2626', marginBottom: 12 },
  summaryMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 12, lineHeight: 18 },
  fullBtn: { width: '100%' },
  accountDisabled: { opacity: 0.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  sectionTitle: { fontWeight: '600', fontSize: 13, marginTop: 4, color: colors.text },
  bold: { fontWeight: '600' },
  groupBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, marginBottom: 12, padding: 4, backgroundColor: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  splitInput: { width: 120 },
  profitRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
    gap: 4,
  },
});
