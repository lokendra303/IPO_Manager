import { useEffect, useState, useMemo } from 'react';
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
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import AllotmentCheckModal from '../components/AllotmentCheckModal';
import Banner from '../components/Banner';
import InfoCard from '../components/InfoCard';
import { ui } from '../styles/ui';
import {
  categoryCompactOptionsForIpo,
  categoryOptionsForIpo,
  getLotAmountForCategory,
  ipoAllowsHni,
  ipoHasHniLot,
} from '../utils/ipoCategories';
import { formatCurrency, formatPan, pnlColor } from '../utils/format';
import { computeProfitFromWithdrawal, getApplicationProfit, ipoIsListed } from '../utils/ipoProfit';
import { getErrorMessage, getUndoSettleBlockedModal } from '../utils/errors';
import { colors } from '../theme';

const ALLOTMENT_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ALLOTED', label: 'Alloted' },
  { value: 'NOT_ALLOTED', label: 'Not alloted' },
  { value: 'NOT_APPLIED', label: 'Did not apply' },
];

type ReturnFilter = 'all' | 'returned' | 'pending' | 'not_applied' | 'allotted' | 'not_allotted';

function toIsoDateInput(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function formatIpoDate(value: unknown): string {
  const iso = toIsoDateInput(value);
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isFundReturned(app: any) {
  return app.trns_received === 'Received';
}

function remainingAppPrincipal(app: any) {
  return Math.max(0, Number(app?.amount || 0) - Number(app?.adjusted_out_amount || 0));
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
  const [editIpoModalOpen, setEditIpoModalOpen] = useState(false);
  const [editIpoSaving, setEditIpoSaving] = useState(false);
  const [editIpoName, setEditIpoName] = useState('');
  const [editOpenDate, setEditOpenDate] = useState('');
  const [editLastApplyDate, setEditLastApplyDate] = useState('');
  const [editListingDate, setEditListingDate] = useState('');
  const [listingSaving, setListingSaving] = useState(false);
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>('all');
  const [selectedReceiveIds, setSelectedReceiveIds] = useState<number[]>([]);
  const [receiveAccountId, setReceiveAccountId] = useState<number | null>(null);
  const [receivingAppId, setReceivingAppId] = useState<number | null>(null);
  const [receivingBulk, setReceivingBulk] = useState(false);
  const [bulkAllotting, setBulkAllotting] = useState(false);
  const [receiveByGroupOpen, setReceiveByGroupOpen] = useState(false);
  const [selectedReceiveGroupIds, setSelectedReceiveGroupIds] = useState<number[]>([]);
  const [receivingByGroup, setReceivingByGroup] = useState(false);
  const [undistributingAppId, setUndistributingAppId] = useState<number | null>(null);
  const [undoingAppId, setUndoingAppId] = useState<number | null>(null);
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
      const accts = (walletRes.data.accounts || []).filter((a: any) => a.purpose !== 'MANAGER');
      setWallet(Number(walletRes.data.providerBalance ?? walletRes.data.balance));
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
      const accts = (walletRes.data.accounts || []).filter((a: any) => a.purpose !== 'MANAGER');
      setWallet(Number(walletRes.data.providerBalance ?? walletRes.data.balance));
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
  const isInvalid = !!ipo?.is_invalid;
  const isFrozen = isClosed || isInvalid;
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
  const requiredFundForActiveRii = availableMembers.length * riiLotAmount;

  const getAllotmentStatus = (app: any) =>
    editedRows[app.id]?.allotmentStatus ?? app.allotment_status;
  const isNotApplied = (app: any) => getAllotmentStatus(app) === 'NOT_APPLIED';
  const isAllotted = (app: any) => getAllotmentStatus(app) === 'ALLOTED';
  const isNotAllotted = (app: any) => getAllotmentStatus(app) === 'NOT_ALLOTED';
  const ipoListed = ipoIsListed(ipo);
  const isWaitingListing = (app: any) => isAllotted(app) && !ipoListed;
  const canReceiveApp = (app: any) => app && !isFundReturned(app) && !isWaitingListing(app);

  const returnedCount = applications.filter(isFundReturned).length;
  const pendingReturnCount = applications.length - returnedCount;
  const notAppliedCount = applications.filter(isNotApplied).length;
  const allottedCount = applications.filter(isAllotted).length;
  const notAllottedCount = applications.filter(isNotAllotted).length;
  const notAppliedPendingReturn = applications.filter((app) => isNotApplied(app) && !isFundReturned(app));

  const filteredApplications = applications.filter((app) => {
    if (returnFilter === 'returned') return isFundReturned(app);
    if (returnFilter === 'pending') return !isFundReturned(app);
    if (returnFilter === 'not_applied') return isNotApplied(app);
    if (returnFilter === 'allotted') return isAllotted(app);
    if (returnFilter === 'not_allotted') return isNotAllotted(app);
    return true;
  });

  const receivableSelectedIds = selectedReceiveIds.filter((appId) => {
    const app = applications.find((a) => a.id === appId);
    return canReceiveApp(app);
  });

  const receivableGroups = useMemo(() => {
    const pendingByGroup = new Map<number, { count: number; amount: number; name: string }>();
    for (const app of applications) {
      if (!canReceiveApp(app)) continue;
      const gid = app.member_group_id;
      if (gid == null) continue;
      const cur = pendingByGroup.get(gid) || {
        count: 0,
        amount: 0,
        name: app.member_group_name || `Group #${gid}`,
      };
      cur.count += 1;
      cur.amount += remainingAppPrincipal(app);
      pendingByGroup.set(gid, cur);
    }
    return memberGroups
      .map((g) => {
        const pending = pendingByGroup.get(g.id);
        if (!pending?.count) return null;
        return {
          id: g.id,
          name: g.name,
          ownerDisplayName: g.ownerDisplayName as string | null | undefined,
          pendingCount: pending.count,
          pendingAmount: pending.amount,
        };
      })
      .filter(Boolean) as Array<{
      id: number;
      name: string;
      ownerDisplayName?: string | null;
      pendingCount: number;
      pendingAmount: number;
    }>;
  }, [applications, memberGroups, editedRows, ipoListed]);

  const selectedReceiveGroupPendingCount = selectedReceiveGroupIds.reduce((sum, gid) => {
    const g = receivableGroups.find((x) => x.id === gid);
    return sum + (g?.pendingCount || 0);
  }, 0);

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

  const displaySummary = useMemo(() => {
    if (!ipoSummary && !applications.length) return null;

    let hasPnL = false;
    const totalProfitLoss = applications.reduce((sum, app) => {
      const edited = editedRows[app.id];
      const pl = getApplicationProfit({
        ...app,
        withdrawalMoney: edited?.withdrawalMoney,
        profitLoss: edited?.profitLoss,
        amount: edited?.amount !== undefined ? edited.amount : app.amount,
      });
      if (pl == null) return sum;
      hasPnL = true;
      return sum + pl;
    }, 0);

    let pendingFundTotal = 0;
    let pendingAfterAdjust = 0;
    for (const app of applications) {
      if (isFundReturned(app)) continue;
      const remaining = remainingAppPrincipal(app);
      pendingFundTotal += remaining;
      if (Number(app.adjusted_out_amount || 0) > 0) {
        pendingAfterAdjust += remaining;
      }
    }
    pendingFundTotal = Math.round(pendingFundTotal * 100) / 100;
    pendingAfterAdjust = Math.round(pendingAfterAdjust * 100) / 100;

    return {
      ...(ipoSummary || {}),
      applicationCount: ipoSummary?.applicationCount ?? applications.length,
      returnedCount:
        ipoSummary?.returnedCount ?? applications.filter((a) => isFundReturned(a)).length,
      pendingFundTotal: ipoSummary?.pendingFundTotal ?? pendingFundTotal,
      pendingAfterAdjust: ipoSummary?.pendingAfterAdjust ?? pendingAfterAdjust,
      pendingReturn: ipoSummary?.pendingReturn ?? pendingAfterAdjust,
      totalProfitLoss: hasPnL ? totalProfitLoss : ipoSummary?.totalProfitLoss ?? null,
    };
  }, [ipoSummary, applications, editedRows]);

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

  const updateWithdrawal = (record: any, withdrawalVal: number | null) => {
    const distributed = getRowVal(record, 'amount', 'amount');
    const profit = withdrawalVal == null || withdrawalVal === ('' as any)
      ? null
      : computeProfitFromWithdrawal(withdrawalVal, distributed);
    setEditedRows((prev) => ({
      ...prev,
      [record.id]: {
        ...(prev[record.id] || {}),
        id: record.id,
        withdrawalMoney: withdrawalVal,
        profitLoss: profit,
      },
    }));
  };

  const updateAmount = (record: any, amountVal: number | null) => {
    const withdrawal = getRowVal(record, 'withdrawalMoney', 'withdrawal_money');
    const profit = withdrawal != null && withdrawal !== ''
      ? computeProfitFromWithdrawal(withdrawal, amountVal)
      : editedRows[record.id]?.profitLoss;
    setEditedRows((prev) => ({
      ...prev,
      [record.id]: {
        ...(prev[record.id] || {}),
        id: record.id,
        amount: amountVal,
        ...(withdrawal != null && withdrawal !== '' ? { profitLoss: profit } : {}),
      },
    }));
  };

  const clearAllotmentPnL = (appId: number) => {
    setEditedRows((prev) => ({
      ...prev,
      [appId]: {
        ...(prev[appId] || {}),
        id: appId,
        profitLoss: null,
        withdrawalMoney: null,
      },
    }));
  };

  const getComputedProfit = (record: any) => {
    const edited = editedRows[record.id];
    return getApplicationProfit({
      ...record,
      withdrawalMoney: edited?.withdrawalMoney,
      profitLoss: edited?.profitLoss,
      amount: edited?.amount !== undefined ? edited.amount : record.amount,
    });
  };

  const openHniSetup = () => {
    setEnableHni(ipoAllowsHni(ipo));
    setLotAmountHni(ipo?.lot_amount_hni != null ? String(ipo.lot_amount_hni) : '');
    setHniModalOpen(true);
  };

  const openEditIpo = () => {
    setEditIpoName(ipo?.name || '');
    setEditOpenDate(toIsoDateInput(ipo?.open_date));
    setEditLastApplyDate(toIsoDateInput(ipo?.last_apply_date));
    setEditListingDate(toIsoDateInput(ipo?.listing_date));
    setEditIpoModalOpen(true);
  };

  const onSaveEditIpo = async () => {
    const name = editIpoName.trim();
    if (!name) {
      Alert.alert('Error', 'Enter IPO name');
      return;
    }
    setEditIpoSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        openDate: editOpenDate.trim() || null,
        lastApplyDate: editLastApplyDate.trim() || null,
        listingDate: editListingDate.trim() || null,
      };
      const { data } = await client.patch(`/ipos/${id}`, body);
      setIpo(data);
      setEditIpoModalOpen(false);
      Alert.alert('Success', 'IPO updated');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not update IPO'));
    } finally {
      setEditIpoSaving(false);
    }
  };

  const onMarkListed = async () => {
    setListingSaving(true);
    try {
      const today = new Date();
      const listingDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-');
      const { data } = await client.patch(`/ipos/${id}`, { listingDate });
      setIpo(data);
      Alert.alert('Listed', 'Enter withdrawal money for allotted members, then Save for P&L.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not mark IPO as listed'));
    } finally {
      setListingSaving(false);
    }
  };

  const onUndoMarkListed = () => {
    Alert.alert(
      'Undo mark listed?',
      'Allotted members go back to waiting for listing. Withdrawal and P&L stay saved but stay hidden until you mark listed again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo listed',
          style: 'destructive',
          onPress: async () => {
            setListingSaving(true);
            try {
              const { data } = await client.patch(`/ipos/${id}`, { listingDate: null });
              setIpo(data);
              Alert.alert('Done', 'Listing undone. Allotted members wait for listing again.');
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err, 'Could not undo listing'));
            } finally {
              setListingSaving(false);
            }
          },
        },
      ]
    );
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
      const accts = (data.accounts || []).filter(
        (a: any) => a.is_active && a.purpose !== 'MANAGER'
      );
      setBankAccounts((data.accounts || []).filter((a: any) => a.purpose !== 'MANAGER'));
      setWallet(Number(data.providerBalance ?? data.balance));
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
        if (vals.withdrawalMoney !== undefined) update.withdrawalMoney = vals.withdrawalMoney;
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

  const onBulkSetAllotment = (status: 'ALLOTED' | 'NOT_ALLOTED') => {
    const ids = selectedReceiveIds.filter((appId) => applications.some((a) => a.id === appId));
    if (!ids.length) {
      Alert.alert('Warning', 'Select at least one application');
      return;
    }
    const label = status === 'ALLOTED' ? 'Alloted' : 'Not alloted';
    const run = async () => {
      setBulkAllotting(true);
      try {
        const updates = ids.map((appId) => ({ id: appId, allotmentStatus: status }));
        const { data } = await client.patch('/ipo-applications/bulk', { updates });
        const auto = data.autoDistributions || [];
        const applied = auto.filter((r: any) => !r.skipped);
        setApplications((prev) =>
          prev.map((a) => {
            if (!ids.includes(a.id)) return a;
            const next = { ...a, allotment_status: status };
            if (status === 'NOT_ALLOTED') {
              next.profit_loss = null;
              next.withdrawal_money = null;
            }
            return next;
          })
        );
        setEditedRows((prev) => {
          const next = { ...prev };
          for (const appId of ids) {
            if (!next[appId]) continue;
            const { allotmentStatus: _as, profitLoss: _pl, withdrawalMoney: _wm, ...rest } = next[appId];
            if (Object.keys(rest).length <= 1) delete next[appId];
            else next[appId] = { ...rest, id: appId };
          }
          return next;
        });
        setSelectedReceiveIds([]);
        void refreshReceiveData();
        const extra = applied.length ? `\nP&L share applied for ${applied.length}.` : '';
        const tip =
          status === 'ALLOTED' && !ipoListed
            ? '\nAllotted members wait for listing. Mark listed before withdrawal and P&L.'
            : '';
        Alert.alert('Success', `Set ${ids.length} member(s) to ${label}.${extra}${tip}`);
      } catch (err) {
        Alert.alert('Error', getErrorMessage(err, 'Could not update allotment'));
      } finally {
        setBulkAllotting(false);
      }
    };

    if (status === 'NOT_ALLOTED') {
      Alert.alert(
        'Set Not alloted?',
        `Use Not allotted only if money is unblocked. If still blocked, keep Pending. Clears withdrawal and P&L for ${ids.length} member(s).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set Not alloted', style: 'destructive', onPress: () => void run() },
        ]
      );
      return;
    }
    void run();
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
    const app = applications.find((a) => a.id === appId);
    if (app && isWaitingListing(app)) {
      Alert.alert('Waiting for listing', 'Allotted members wait for listing before you can receive funds.');
      return;
    }
    if (missingReceiveAccount) {
      Alert.alert('Warning', 'Select which bank account should receive returned funds');
      return;
    }
    setReceivingAppId(appId);
    try {
      const { data } = await client.post(`/ipos/applications/${appId}/receive`, {
        returnToWallet: true,
        bankAccountId: receiveAccountId,
      });
      const nowIso = new Date().toISOString();
      setApplications((prev) =>
        prev.map((a) =>
          a.id === appId
            ? {
                ...a,
                ...data,
                trns_received: 'Received',
                date_received: data.date_received || a.date_received || nowIso,
              }
            : a
        )
      );
      if (data.walletBalance != null) {
        setWallet(Number(data.walletBalance));
      }
      if (receiveAccountId != null && data.walletAmount != null) {
        const credited = Number(data.walletAmount);
        setBankAccounts((prev) =>
          prev.map((a) =>
            a.id === receiveAccountId
              ? { ...a, balance: Math.round((Number(a.balance) + credited) * 100) / 100 }
              : a
          )
        );
      }
      setSelectedReceiveIds((prev) => prev.filter((aid) => aid !== appId));
      Alert.alert('Success', 'Marked as received — funds returned to wallet');
      void refreshReceiveData();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed'));
    } finally {
      setReceivingAppId(null);
    }
  };

  const onUndoReceive = (appId: number, revokeProfitSplit = false) => {
    Alert.alert(
      revokeProfitSplit ? 'Undo settle + P&L split?' : 'Undo settle?',
      revokeProfitSplit
        ? 'Reverses fund return to wallet and revokes the profit split. Blocked if wallet does not have enough cash (e.g. provider already repaid).'
        : 'Reverses wallet credit and member RECEIVED ledger. Blocked if wallet does not have enough cash (e.g. provider already repaid).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: revokeProfitSplit ? 'Undo all' : 'Undo settle',
          style: 'destructive',
          onPress: async () => {
            setUndoingAppId(appId);
            try {
              const { data } = await client.post(`/ipos/applications/${appId}/undo-receive`, {
                revokeProfitSplit,
              });
              await refreshReceiveData();
              Alert.alert(
                'Done',
                revokeProfitSplit && data.profitRevoked
                  ? 'Settle undone and P&L split revoked'
                  : 'Settle undone — wallet and ledger reversed'
              );
            } catch (err) {
              const info = getUndoSettleBlockedModal(err);
              Alert.alert(
                info.title,
                [
                  info.summary,
                  '',
                  ...info.rows.map((r) => `${r.label}: ${r.value}`),
                  '',
                  'What to do:',
                  ...info.steps.map((s, i) => `${i + 1}. ${s}`),
                ].join('\n')
              );
            } finally {
              setUndoingAppId(null);
            }
          },
        },
      ]
    );
  };

  const onUndistribute = (app: any) => {
    Alert.alert(
      'Undistribute member?',
      `${app.display_name || 'This member'}: ${formatCurrency(app.amount)} will return to wallet and the application will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undistribute',
          style: 'destructive',
          onPress: async () => {
            setUndistributingAppId(app.id);
            try {
              const { data } = await client.post(`/ipos/applications/${app.id}/undistribute`);
              setSelectedReceiveIds((prev) => prev.filter((aid) => aid !== app.id));
              await refreshReceiveData();
              Alert.alert(
                'Done',
                `Undistributed ${data.memberName} — ${formatCurrency(data.amount)} returned to wallet`
              );
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err, 'Failed to undistribute'));
            } finally {
              setUndistributingAppId(null);
            }
          },
        },
      ]
    );
  };

  const onRevokeProfitSplit = (appId: number) => {
    Alert.alert(
      'Revoke P&L profit split?',
      'Removes the split and reverses provider accruals. Does not undo fund settle.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke split',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.post('/profit-shares/revoke', { applicationId: appId });
              await refreshReceiveData();
              Alert.alert('Done', 'P&L split revoked');
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err, 'Could not revoke P&L split'));
            }
          },
        },
      ]
    );
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
      const receivedIds = new Set((data.received || []).map((r: { appId: number }) => r.appId));
      const nowIso = new Date().toISOString();
      if (receivedIds.size) {
        setApplications((prev) =>
          prev.map((a) =>
            receivedIds.has(a.id)
              ? { ...a, trns_received: 'Received', date_received: a.date_received || nowIso }
              : a
          )
        );
      }
      if (data.walletBalance != null) {
        setWallet(Number(data.walletBalance));
      }
      if (receiveAccountId != null && data.received?.length) {
        const credited = data.received.reduce(
          (sum: number, r: { walletAmount?: number }) => sum + Number(r.walletAmount || 0),
          0
        );
        setBankAccounts((prev) =>
          prev.map((a) =>
            a.id === receiveAccountId
              ? { ...a, balance: Math.round((Number(a.balance) + credited) * 100) / 100 }
              : a
          )
        );
      }
      if (ok) Alert.alert('Success', `Received funds for ${ok} member(s)`);
      if (fail) Alert.alert('Warning', `${fail} could not be received`);
      setSelectedReceiveIds([]);
      void refreshReceiveData();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Bulk receive failed'));
    } finally {
      setReceivingBulk(false);
    }
  };

  const openReceiveByGroup = () => {
    if (!receivableGroups.length) {
      Alert.alert('Info', 'No sub-groups have pending returns for this IPO');
      return;
    }
    if (missingReceiveAccount) {
      Alert.alert('Warning', 'Select which bank account should receive returned funds');
      return;
    }
    setSelectedReceiveGroupIds(receivableGroups.map((g) => g.id));
    setReceiveByGroupOpen(true);
  };

  const onReceiveByGroups = async () => {
    if (!selectedReceiveGroupIds.length) {
      Alert.alert('Warning', 'Select at least one sub-group');
      return;
    }
    if (missingReceiveAccount) {
      Alert.alert('Warning', 'Select which bank account should receive returned funds');
      return;
    }
    setReceivingByGroup(true);
    try {
      const { data } = await client.post(`/ipos/${id}/receive-by-groups`, {
        groupIds: selectedReceiveGroupIds,
        returnToWallet: true,
        bankAccountId: receiveAccountId,
      });
      const ok = data.receivedCount || 0;
      const fail = data.failed?.length || 0;
      const receivedIds = new Set((data.received || []).map((r: { appId: number }) => r.appId));
      const nowIso = new Date().toISOString();
      if (receivedIds.size) {
        setApplications((prev) =>
          prev.map((a) =>
            receivedIds.has(a.id)
              ? { ...a, trns_received: 'Received', date_received: a.date_received || nowIso }
              : a
          )
        );
      }
      if (data.walletBalance != null) {
        setWallet(Number(data.walletBalance));
      }
      if (receiveAccountId != null && data.received?.length) {
        const credited = data.received.reduce(
          (sum: number, r: { walletAmount?: number }) => sum + Number(r.walletAmount || 0),
          0
        );
        setBankAccounts((prev) =>
          prev.map((a) =>
            a.id === receiveAccountId
              ? { ...a, balance: Math.round((Number(a.balance) + credited) * 100) / 100 }
              : a
          )
        );
      }
      if (ok) {
        Alert.alert(
          'Success',
          `Received ${ok} member(s) from ${selectedReceiveGroupIds.length} group(s)`
        );
      }
      if (fail) Alert.alert('Warning', `${fail} could not be received`);
      setReceiveByGroupOpen(false);
      setSelectedReceiveGroupIds([]);
      setSelectedReceiveIds([]);
      void refreshReceiveData();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Group receive failed'));
    } finally {
      setReceivingByGroup(false);
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
          `${isInvalid ? 'Invalid' : isClosed ? 'Closed' : 'Open'}` +
          ` · Open ${formatIpoDate(ipo.open_date)} · Close ${formatIpoDate(ipo.last_apply_date)}` +
          ` · Listing ${ipoListed ? formatIpoDate(ipo.listing_date) : 'waiting'}` +
          ` · ${formatCurrency(getLotAmountForCategory(ipo, 'RII'))}` +
          (ipoAllowsHni(ipo) && ipoHasHniLot(ipo)
            ? ` · HNI ${formatCurrency(getLotAmountForCategory(ipo, 'HNI'))}`
            : '')
        }
        extra={
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            <Button compact mode="outlined" onPress={openEditIpo}>Edit</Button>
            {!ipoListed && !isInvalid ? (
              <Button compact mode="contained" loading={listingSaving} onPress={onMarkListed}>
                Mark listed
              </Button>
            ) : null}
            {ipoListed && !isInvalid ? (
              <Button compact mode="outlined" textColor="#dc2626" loading={listingSaving} onPress={onUndoMarkListed}>
                Undo listed
              </Button>
            ) : null}
            <Button compact mode="text" onPress={() => router.back()}>Back</Button>
          </View>
        }
      />

      {unsavedRowCount > 0 && (
        <Banner variant="warn">{`${unsavedRowCount} unsaved — tap Save`}</Banner>
      )}

      {!ipoListed && applications.some((a) => getAllotmentStatus(a) === 'ALLOTED') && (
        <Banner variant="info">
          Allotted members wait for listing. Mark listed to enter withdrawal and P&L.
        </Banner>
      )}

      {isInvalid && (
        <Banner variant="warn">Hidden from main list. Use More to restore or delete.</Banner>
      )}

      {displaySummary && (
        <ContentCard title="IPO Summary">
          <StatGrid>
            <StatCard title="Members" value={displaySummary.applicationCount} variant="info" />
            <StatCard
              title="Total pending fund"
              value={formatCurrency(displaySummary.pendingFundTotal ?? 0)}
              variant={Number(displaySummary.pendingFundTotal ?? 0) > 0 ? 'danger' : 'success'}
            />
            <StatCard
              title="Pending after adjust"
              value={formatCurrency(displaySummary.pendingAfterAdjust ?? 0)}
              variant={Number(displaySummary.pendingAfterAdjust ?? 0) > 0 ? 'warning' : 'success'}
            />
            <StatCard
              title="P&L"
              value={displaySummary.totalProfitLoss == null ? '—' : formatCurrency(displaySummary.totalProfitLoss)}
              variant={
                displaySummary.totalProfitLoss == null
                  ? 'info'
                  : Number(displaySummary.totalProfitLoss) >= 0
                    ? 'success'
                    : 'danger'
              }
            />
            <StatCard
              title="Provider share"
              value={formatCurrency(displaySummary.shareProviderTotal ?? 0)}
              variant="primary"
            />
            <StatCard
              title="Returned"
              value={`${displaySummary.returnedCount}/${displaySummary.applicationCount}`}
              variant="primary"
            />
          </StatGrid>
        </ContentCard>
      )}

      {!isFrozen && availableMembers.length > 0 && (
        <ContentCard>
          <Text style={styles.summaryMeta}>
            Need <Text style={styles.bold}>{formatCurrency(requiredFundForActiveRii)}</Text>
            {' '}for {availableMembers.length} more
            {wallet < requiredFundForActiveRii ? ' · wallet short' : ''}
          </Text>
        </ContentCard>
      )}

      <ContentCard title="Actions">
        <View style={styles.primaryActions}>
          {!isFrozen && (
            <Button mode="contained" disabled={!availableMembers.length} onPress={openDistribute} style={styles.primaryBtn}>
              Distribute
            </Button>
          )}
          <Button mode="contained" onPress={onSaveBulk} disabled={!unsavedRowCount} style={styles.primaryBtn}>
            Save{unsavedRowCount ? ` (${unsavedRowCount})` : ''}
          </Button>
        </View>
        {!isFrozen && (
          <Button
            mode="contained-tonal"
            style={{ marginTop: 8 }}
            onPress={() => router.push(`/(manager)/ipos/${id}/adjust`)}
          >
            Reuse leftover funds
          </Button>
        )}
        {!isFrozen && (
          <Button
            mode="outlined"
            style={{ marginTop: 8 }}
            onPress={() => router.push('/(manager)/adjust-combine')}
          >
            Reuse on several IPOs
          </Button>
        )}
        <Button
          mode="outlined"
          style={{ marginTop: 8 }}
          onPress={() => router.push('/(manager)/group-leader-wallets')}
        >
          Leader wallets
        </Button>
        <Button
          mode="outlined"
          style={{ marginTop: 8 }}
          loading={statusLoading || profitLoading}
          onPress={() => {
            const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
            if (unsavedRowCount) buttons.push({ text: 'Undo changes', onPress: onUndoChanges });
            if (applications.length > 0) {
              if (ipo?.allotmentCheckReady === false) {
                buttons.push({
                  text: 'Check allotment (not open yet)',
                  onPress: () =>
                    Alert.alert(
                      'Allotment not open yet',
                      ipo.allotmentCheckBlockedReason
                        || 'NSE/BSE has not published allotment for this IPO yet.',
                    ),
                });
              } else {
                buttons.push({ text: 'Check allotment', onPress: () => setAllotmentCheckOpen(true) });
              }
            }
            if (!isFrozen) {
              buttons.push({ text: 'Distribute P&L', onPress: onPreviewProfitShare });
            }
            buttons.push({
              text: 'Share rules',
              onPress: () =>
                router.push({
                  pathname: '/(manager)/profit-sharing',
                  params: { presetIpoId: String(id), presetIpoName: ipo?.name || '' },
                }),
            });
            if (!isFrozen) {
              buttons.push({
                text: ipoAllowsHni(ipo) ? 'HNI settings' : 'Set up HNI',
                onPress: openHniSetup,
              });
            }
            if (isInvalid) {
              buttons.push({
                text: 'Restore',
                onPress: async () => {
                  setStatusLoading(true);
                  try {
                    const { data } = await client.post(`/ipos/${id}/restore`);
                    setIpo(data);
                  } catch (err) {
                    Alert.alert('Error', getErrorMessage(err));
                  } finally {
                    setStatusLoading(false);
                  }
                },
              });
              buttons.push({
                text: 'Delete',
                style: 'destructive',
                onPress: () =>
                  Alert.alert('Delete IPO?', 'Only empty invalid IPOs. Cannot undo.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        setStatusLoading(true);
                        try {
                          await client.delete(`/ipos/${id}`);
                          router.replace('/(manager)/ipos');
                        } catch (err) {
                          Alert.alert('Error', getErrorMessage(err));
                        } finally {
                          setStatusLoading(false);
                        }
                      },
                    },
                  ]),
              });
            } else if (isClosed) {
              buttons.push({ text: 'Reopen', onPress: onReopenIpo });
            } else {
              buttons.push({
                text: 'Close',
                style: 'destructive',
                onPress: () =>
                  Alert.alert('Close IPO?', 'Status only.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Close', style: 'destructive', onPress: onCloseIpo },
                  ]),
              });
              buttons.push({
                text: 'Mark invalid',
                style: 'destructive',
                onPress: () =>
                  Alert.alert('Mark invalid?', 'Hides from main list.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Invalid',
                      style: 'destructive',
                      onPress: async () => {
                        setStatusLoading(true);
                        try {
                          const { data } = await client.post(`/ipos/${id}/invalidate`);
                          setIpo(data);
                        } catch (err) {
                          Alert.alert('Error', getErrorMessage(err));
                        } finally {
                          setStatusLoading(false);
                        }
                      },
                    },
                  ]),
              });
            }
            buttons.push({ text: 'Cancel', style: 'cancel' });
            Alert.alert('More', undefined, buttons);
          }}
        >
          More…
        </Button>
      </ContentCard>

      {!isFrozen && ipoAllowsHni(ipo) && !ipoHasHniLot(ipo) && (
        <Banner variant="warn">HNI on — set lot to distribute as HNI.</Banner>
      )}
      {isClosed && <Banner variant="warn">Closed — you can still mark returns.</Banner>}
      {notAppliedPendingReturn.length > 0 && (
        <Banner variant="info">{`${notAppliedPendingReturn.length} did not apply — still pending return.`}</Banner>
      )}

      {activeAccounts.length > 0 && (
        <ContentCard title="Credit returns to">
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
            <Text style={styles.warnText}>Select account before receive</Text>
          )}
        </ContentCard>
      )}

      <ContentCard
        title={`Apps (${filteredApplications.length}${returnFilter !== 'all' ? `/${applications.length}` : ''})`}
      >
        {applications.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <FilterChips
              value={returnFilter}
              onChange={setReturnFilter}
              options={[
                { value: 'all', label: `All (${applications.length})` },
                { value: 'pending', label: `Pending (${pendingReturnCount})` },
                { value: 'returned', label: `Returned (${returnedCount})` },
                { value: 'allotted', label: `Alloted (${allottedCount})` },
                { value: 'not_allotted', label: `Not (${notAllottedCount})` },
                { value: 'not_applied', label: `No apply (${notAppliedCount})` },
              ]}
            />
          </View>
        )}
        {selectedReceiveIds.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Button
              mode="outlined"
              loading={bulkAllotting}
              onPress={() => onBulkSetAllotment('ALLOTED')}
              compact
            >
              Set Alloted ({selectedReceiveIds.length})
            </Button>
            <Button
              mode="outlined"
              loading={bulkAllotting}
              onPress={() => onBulkSetAllotment('NOT_ALLOTED')}
              compact
            >
              Set Not alloted ({selectedReceiveIds.length})
            </Button>
          </View>
        )}
        {receivableSelectedIds.length > 0 && (
          <Button mode="contained" loading={receivingBulk} onPress={onReceiveBulk} style={{ marginBottom: 12 }}>
            Receive ({receivableSelectedIds.length})
          </Button>
        )}
        {receivableGroups.length > 0 && (
          <Button mode="outlined" onPress={openReceiveByGroup} style={{ marginBottom: 12 }}>
            Receive by group ({receivableGroups.length})
          </Button>
        )}

        {refreshing ? (
          <Loading fullScreen={false} />
        ) : filteredApplications.length === 0 ? (
          <Text style={ui.muted}>No apps in this filter</Text>
        ) : (
          filteredApplications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              ipo={ipo}
              isClosed={isFrozen}
              getRowVal={getRowVal}
              updateRow={updateRow}
              updateWithdrawal={updateWithdrawal}
              updateAmount={updateAmount}
              clearAllotmentPnL={clearAllotmentPnL}
              getComputedProfit={getComputedProfit}
              selected={selectedReceiveIds.includes(app.id)}
              onToggleSelect={() =>
                setSelectedReceiveIds((prev) =>
                  prev.includes(app.id) ? prev.filter((aid) => aid !== app.id) : [...prev, app.id]
                )
              }
              onReceive={() => onReceive(app.id)}
              onUndistribute={() => onUndistribute(app)}
              onUndoReceive={() => onUndoReceive(app.id, false)}
              onUndoReceiveWithProfit={() => onUndoReceive(app.id, true)}
              onRevokeProfitSplit={() => onRevokeProfitSplit(app.id)}
              receiving={receivingAppId === app.id}
              undistributing={undistributingAppId === app.id}
              undoing={undoingAppId === app.id}
              canReceive={canReceiveApp(app)}
              waitingForListing={isWaitingListing(app)}
              canUndistribute={
                !Number(app.adjusted_out_amount || 0) && !app.adjusted_from_application_id
              }
              hasProfitSplit={Boolean(app.profit_share_distribution_id)}
            />
          ))
        )}
      </ContentCard>

      <Modal
        visible={receiveByGroupOpen}
        animationType="slide"
        onRequestClose={() => {
          setReceiveByGroupOpen(false);
          setSelectedReceiveGroupIds([]);
        }}
      >
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>Receive by sub-group</Text>
            <Button
              mode="text"
              onPress={() => {
                setReceiveByGroupOpen(false);
                setSelectedReceiveGroupIds([]);
              }}
            >
              Cancel
            </Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={ui.hint}>
              Collect returned funds from the group owner, then mark the whole sub-group received.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Button
                compact
                mode="outlined"
                onPress={() => setSelectedReceiveGroupIds(receivableGroups.map((g) => g.id))}
              >
                Select all
              </Button>
              <Button compact mode="text" onPress={() => setSelectedReceiveGroupIds([])}>
                Clear
              </Button>
            </View>
            {receivableGroups.map((g) => (
              <Checkbox.Item
                key={g.id}
                label={`${g.name}${g.ownerDisplayName ? ` · ${g.ownerDisplayName}` : ''} — ${g.pendingCount} pending · ${formatCurrency(g.pendingAmount)}`}
                status={selectedReceiveGroupIds.includes(g.id) ? 'checked' : 'unchecked'}
                onPress={() =>
                  setSelectedReceiveGroupIds((prev) =>
                    prev.includes(g.id) ? prev.filter((gid) => gid !== g.id) : [...prev, g.id]
                  )
                }
              />
            ))}
            <Button
              mode="contained"
              loading={receivingByGroup}
              disabled={!selectedReceiveGroupIds.length || receivingByGroup}
              onPress={onReceiveByGroups}
              style={{ marginTop: 16 }}
            >
              Receive {selectedReceiveGroupPendingCount} member{selectedReceiveGroupPendingCount !== 1 ? 's' : ''}
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

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
                    const hasOwner = Boolean(
                      group.ownerMemberId || (group.ownerExternalName && String(group.ownerExternalName).trim())
                    );
                    const noAvailableLabel = !groupAvailable.length
                      ? group.members.every((m: any) => getGroupMemberDistributeReason(m) === 'inactive')
                        ? ' · no active members'
                        : group.members.some((m: any) => getGroupMemberDistributeReason(m) === 'inactive')
                          ? ' · no available members'
                          : ' · all already applied'
                      : '';

                    return (
                      <View key={group.id} style={styles.groupBox}>
                        <Checkbox.Item
                          label={`${group.name} — bulk to owner${hasOwner ? ` (${group.ownerDisplayName})` : ' (set owner)'}${noAvailableLabel}`}
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

                {availableMembers.length > 0 && (
                  <View style={styles.selectActions}>
                    <Button
                      mode="text"
                      compact
                      onPress={() => {
                        setSelectedGroupBulkIds([]);
                        setSelectedIds(availableMembers.map((m) => m.id));
                      }}
                    >
                      Select all
                    </Button>
                    <Button
                      mode="text"
                      compact
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

      {/* Edit IPO name modal */}
      <Modal visible={editIpoModalOpen} animationType="slide" transparent onRequestClose={() => setEditIpoModalOpen(false)}>
        <View style={ui.modalBg}>
          <View style={ui.modalCard}>
            <Text style={ui.modalTitle}>Edit IPO</Text>
            <TextInput
              label="IPO name"
              value={editIpoName}
              onChangeText={setEditIpoName}
              mode="outlined"
              style={ui.input}
              maxLength={120}
            />
            <TextInput
              label="Open date (YYYY-MM-DD)"
              value={editOpenDate}
              onChangeText={setEditOpenDate}
              placeholder="2026-07-28"
              mode="outlined"
              style={ui.input}
              autoCapitalize="none"
            />
            <TextInput
              label="Close date / last apply (YYYY-MM-DD)"
              value={editLastApplyDate}
              onChangeText={setEditLastApplyDate}
              placeholder="2026-07-30"
              mode="outlined"
              style={ui.input}
              autoCapitalize="none"
            />
            <TextInput
              label="Listing date (YYYY-MM-DD)"
              value={editListingDate}
              onChangeText={setEditListingDate}
              placeholder="Leave blank until listed"
              mode="outlined"
              style={ui.input}
              autoCapitalize="none"
            />
            <Button mode="contained" loading={editIpoSaving} onPress={onSaveEditIpo}>Save</Button>
            <Button mode="text" onPress={() => setEditIpoModalOpen(false)}>Cancel</Button>
          </View>
        </View>
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
        onChecked={() => load()}
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
  updateWithdrawal,
  updateAmount,
  clearAllotmentPnL,
  getComputedProfit,
  selected,
  onToggleSelect,
  onReceive,
  onUndistribute,
  onUndoReceive,
  onUndoReceiveWithProfit,
  onRevokeProfitSplit,
  receiving,
  undistributing,
  undoing,
  canReceive,
  waitingForListing,
  canUndistribute,
  hasProfitSplit,
}: any) {
  const status = getRowVal(app, 'allotmentStatus', 'allotment_status');
  const pnl = getComputedProfit(app);
  const withdrawal = getRowVal(app, 'withdrawalMoney', 'withdrawal_money');
  const amount = getRowVal(app, 'amount', 'amount');
  const category = getRowVal(app, 'investorCategory', 'investor_category') || 'RII';
  const remarks = getRowVal(app, 'remarks', 'remarks') ?? '';
  const categoryOptions = categoryCompactOptionsForIpo(ipo);
  const adjustedOut = Number(app.adjusted_out_amount || 0);
  const remaining = remainingAppPrincipal(app);
  const amountLocked = isClosed || adjustedOut > 0 || Boolean(app.adjusted_from_application_id);

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
        ) : adjustedOut > 0 ? (
          <Tag label={`Pending ${formatCurrency(remaining)}`} color="#d97706" />
        ) : (
          <Tag label="Pending" color="#64748b" />
        )}
      </View>

      <View style={styles.metaRow}>
        {app.member_group_name ? <Tag label={app.member_group_name} color="#3b82f6" /> : null}
        {app.paid_to_member_id && app.paid_to_member_id !== app.member_id ? (
          <Tag label={`To ${app.paid_to_display_name}`} color="#d97706" />
        ) : null}
        {app.paid_to_external_name ? (
          <Tag label={`To ${app.paid_to_external_name}`} color="#d97706" />
        ) : null}
        {adjustedOut > 0 ? (
          <Tag label={`Adjusted ${formatCurrency(adjustedOut)}`} color="#0891b2" />
        ) : null}
        {app.adjusted_from_application_id ? (
          <Tag label="From adjust" color="#0891b2" />
        ) : null}
      </View>

      {categoryOptions.length > 1 ? (
        <>
          <Text style={styles.sectionTitle}>Category</Text>
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
        </>
      ) : null}

      <TextInput
        dense
        label="Amount (₹)"
        value={String(amount ?? '')}
        onChangeText={(v) => updateAmount(app, v === '' ? null : Number(v))}
        keyboardType="numeric"
        mode="outlined"
        disabled={amountLocked}
        style={ui.input}
      />
      {adjustedOut > 0 && !isFundReturned(app) ? (
        <Text style={ui.hint}>
          Adjusted out {formatCurrency(adjustedOut)} · pending collect {formatCurrency(remaining)}
        </Text>
      ) : null}

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
                clearAllotmentPnL(app.id);
              }
            }}
          >
            <Text style={[ui.chipText, status === opt.value && ui.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {status === 'ALLOTED' && ipoIsListed(ipo) ? (
        <>
          <TextInput
            dense
            label="Withdrawal money (₹ received back)"
            value={withdrawal != null ? String(withdrawal) : ''}
            onChangeText={(v) => updateWithdrawal(app, v === '' ? null : Number(v))}
            keyboardType="numeric"
            mode="outlined"
            disabled={isClosed}
            style={ui.input}
          />
          <Text style={[styles.sectionTitle, { color: pnlColor(pnl) }]}>
            P&L (profit): {pnl != null ? formatCurrency(pnl) : '—'}
          </Text>
          <Text style={ui.hint}>Profit = withdrawal − distributed amount</Text>
        </>
      ) : status === 'ALLOTED' ? (
        <Text style={ui.hint}>Waiting for listing — tap Mark listed on this IPO to enter withdrawal and P&L.</Text>
      ) : null}

      {app.profit_share_distribution_id ? (
        <Tag label="P&L split done" color="#7c3aed" />
      ) : status === 'ALLOTED' && !waitingForListing && pnl != null && Number(pnl) !== 0 ? (
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

      {isFundReturned(app) ? (
        <View style={{ gap: 8 }}>
          <Tag label="Settled" color="#059669" />
          <Button compact mode="outlined" textColor="#dc2626" loading={undoing} onPress={onUndoReceive}>
            Undo settle
          </Button>
          {hasProfitSplit ? (
            <Button compact mode="text" textColor="#dc2626" loading={undoing} onPress={onUndoReceiveWithProfit}>
              Undo settle + P&L
            </Button>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {waitingForListing ? (
            <Tag label="Waiting for listing" color="#64748b" />
          ) : canReceive ? (
            <Button compact mode="contained" loading={receiving} onPress={onReceive}>
              {adjustedOut > 0
                ? `Receive ${formatCurrency(remaining)} — return to wallet`
                : 'Receive — return to wallet'}
            </Button>
          ) : null}
          {canUndistribute ? (
            <Button compact mode="outlined" textColor="#dc2626" loading={undistributing} onPress={onUndistribute}>
              Undistribute
            </Button>
          ) : null}
          {hasProfitSplit ? (
            <Button compact mode="outlined" textColor="#dc2626" onPress={onRevokeProfitSplit}>
              Undo P&L split
            </Button>
          ) : null}
        </View>
      )}
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  warnText: { color: '#dc2626', fontSize: 13, marginTop: 4 },
  errorText: { color: '#dc2626', marginBottom: 12 },
  summaryMeta: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  fullBtn: { width: '100%' },
  primaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryBtn: { flexGrow: 1, minWidth: 120 },
  accountDisabled: { opacity: 0.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  sectionTitle: { fontWeight: '600', fontSize: 13, marginTop: 4, color: colors.text },
  bold: { fontWeight: '600' },
  groupBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, marginBottom: 12, padding: 4, backgroundColor: '#fff' },
  selectActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
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
