import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Table, Button, Tag, Modal, InputNumber, Steps, Checkbox, Alert, Form,
  message, Space, Typography, Select, Input, Popconfirm, Switch, Result, Tooltip, Segmented, Divider,
  Row, Col,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, UndoOutlined, LockOutlined, UnlockOutlined, PercentageOutlined, SearchOutlined, BankOutlined, TeamOutlined, StopOutlined, RollbackOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import AllotmentCheckModal from '../components/AllotmentCheckModal';
import ModalDatePicker from '../components/ModalDatePicker';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import { getErrorMessage, getUndoSettleBlockedModal } from '../utils/errors';
import {
  categoryCompactOptionsForIpo,
  categoryOptionsForIpo,
  parseAllowedCategories,
  categoryTagColor,
  INVESTOR_CATEGORY_LABELS,
  getLotAmountForCategory,
  ipoAllowsHni,
  ipoHasHniLot,
} from '../utils/ipoCategories';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import IpoSummaryStats from '../components/IpoSummaryStats';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';
import { computeProfitFromWithdrawal, getApplicationProfit } from '../utils/ipoProfit';

function toDateParam(v) {
  if (!v) return null;
  return dayjs.isDayjs(v) ? v.format('YYYY-MM-DD') : dayjs(v).format('YYYY-MM-DD');
}

function toDayjsOrNull(v) {
  if (!v) return null;
  const d = dayjs(v);
  return d.isValid() ? d : null;
}

function formatIpoDate(v) {
  const d = toDayjsOrNull(v);
  return d ? d.format('DD MMM YYYY') : '—';
}

function groupHasOwner(group) {
  return Boolean(group?.ownerMemberId || (group?.ownerExternalName && String(group.ownerExternalName).trim()));
}

function ProfitShareAmounts({ record }) {
  if (!record?.profit_share_distribution_id) return null;
  const rows = [
    { label: 'Member', amount: record.share_member_amount },
    { label: 'Manager', amount: record.share_manager_amount },
    { label: 'Provider', amount: record.share_provider_amount },
  ];
  return (
    <div style={{ marginBottom: 6, lineHeight: 1.45 }}>
      {rows.map(({ label, amount }) => (
        <div key={label} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          <Typography.Text type="secondary">{label}: </Typography.Text>
          <Typography.Text className={pnlClassName(amount)} strong>
            {formatCurrency(amount)}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

export default function IpoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ipo, setIpo] = useState(null);
  const [applications, setApplications] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [distributeMode, setDistributeMode] = useState('groups');
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
  const [markGiven, setMarkGiven] = useState(true);
  const [editedRows, setEditedRows] = useState({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [profitPreview, setProfitPreview] = useState([]);
  const [profitLoading, setProfitLoading] = useState(false);
  const [allotmentCheckOpen, setAllotmentCheckOpen] = useState(false);
  const [distributeInvestorCategory, setDistributeInvestorCategory] = useState('RII');
  const [selectedGroupBulkIds, setSelectedGroupBulkIds] = useState([]);
  const [hniModalOpen, setHniModalOpen] = useState(false);
  const [hniSaving, setHniSaving] = useState(false);
  const [hniForm] = Form.useForm();
  const [editIpoModalOpen, setEditIpoModalOpen] = useState(false);
  const [editIpoSaving, setEditIpoSaving] = useState(false);
  const [editIpoForm] = Form.useForm();
  const [returnFilter, setReturnFilter] = useState('all');
  const [selectedReceiveIds, setSelectedReceiveIds] = useState([]);
  const [receivingAppId, setReceivingAppId] = useState(null);
  const [undoingAppId, setUndoingAppId] = useState(null);
  const [revokingProfitAppId, setRevokingProfitAppId] = useState(null);
  const [receivingBulk, setReceivingBulk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ipoSummary, setIpoSummary] = useState(null);

  const load = async () => {
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
      const activeMembers = membersRes.data.filter((m) => m.status === 'ACTIVE');
      const uniqueActive = [...new Map(activeMembers.map((m) => [m.id, m])).values()];
      setMembers(uniqueActive);
      setMemberGroups(groupsRes.data);
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

  const refreshReceiveData = async () => {
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
      message.error(getErrorMessage(err, 'Failed to refresh'));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setEditedRows({});
    load();
  }, [id]);

  const appliedMemberIds = new Set(applications.map((a) => a.member_id));
  const availableMembers = members.filter((m) => !appliedMemberIds.has(m.id));
  const isMemberAvailable = (memberId) => availableMembers.some((m) => m.id === memberId);
  const getGroupMemberDistributeReason = (m) => {
    if (m.status === 'INACTIVE' || !members.some((am) => am.id === m.id)) return 'inactive';
    if (appliedMemberIds.has(m.id)) return 'applied';
    return null;
  };
  const ungroupedAvailable = availableMembers.filter((m) => !m.member_group_id);
  const isClosed = ipo?.status === 'CLOSED';
  const isInvalid = !!ipo?.is_invalid;
  const isFrozen = isClosed || isInvalid;
  const riiLotAmount = getLotAmountForCategory(ipo, 'RII') ?? 0;
  const hniLotAmount = getLotAmountForCategory(ipo, 'HNI');
  const requiredFundForActiveRii = availableMembers.length * riiLotAmount;
  const requiredFundForActiveHni =
    hniLotAmount != null && ipoHasHniLot(ipo) ? availableMembers.length * hniLotAmount : null;

  const isFundReturned = (app) => app.trns_received === 'Received';
  const getAllotmentStatus = (app) =>
    editedRows[app.id]?.allotmentStatus ?? app.allotment_status;
  const isNotApplied = (app) => getAllotmentStatus(app) === 'NOT_APPLIED';
  const isAllotted = (app) => getAllotmentStatus(app) === 'ALLOTED';
  const isNotAllotted = (app) => getAllotmentStatus(app) === 'NOT_ALLOTED';
  const returnedCount = applications.filter(isFundReturned).length;
  const pendingReturnCount = applications.length - returnedCount;
  const notAppliedCount = applications.filter(isNotApplied).length;
  const allottedCount = applications.filter(isAllotted).length;
  const notAllottedCount = applications.filter(isNotAllotted).length;
  const allotmentSortOrder = (app) => {
    const rank = { ALLOTED: 0, PENDING: 1, NOT_ALLOTED: 2, NOT_APPLIED: 3 };
    return rank[getAllotmentStatus(app)] ?? 9;
  };
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
    return app && !isFundReturned(app);
  });

  const displaySummary = useMemo(() => {
    if (!ipoSummary) return null;
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
    return { ...ipoSummary, totalProfitLoss: hasPnL ? totalProfitLoss : null };
  }, [ipoSummary, applications, editedRows]);

  const groupAvailableIds = (group) =>
    group.members.filter((m) => isMemberAvailable(m.id)).map((m) => m.id);

  const isGroupBulkSelected = (groupId) => selectedGroupBulkIds.includes(groupId);

  const toggleGroupBulk = (group, checked) => {
    const ids = groupAvailableIds(group);
    setSelectedGroupBulkIds((prev) => {
      if (checked) return [...new Set([...prev, group.id])];
      return prev.filter((id) => id !== group.id);
    });
    if (checked) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const toggleGroupSelection = (group, checked) => {
    if (isGroupBulkSelected(group.id)) return;
    const ids = groupAvailableIds(group);
    setSelectedIds((prev) => {
      if (checked) return [...new Set([...prev, ...ids])];
      return prev.filter((id) => !ids.includes(id));
    });
  };

  const toggleMemberSelection = (memberId, groupId) => {
    if (!isMemberAvailable(memberId)) return;
    if (groupId && isGroupBulkSelected(groupId)) return;
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const bulkMemberCount = selectedGroupBulkIds.reduce((sum, gid) => {
    const g = memberGroups.find((gr) => gr.id === gid);
    return sum + (g ? groupAvailableIds(g).length : 0);
  }, 0);

  const distributeSelectionCount = selectedIds.length + bulkMemberCount;

  const ipoCategoryOptions = categoryOptionsForIpo(ipo);
  const allowedCategoryTags = parseAllowedCategories(ipo);

  const openHniSetup = () => {
    hniForm.setFieldsValue({
      enableHni: ipoAllowsHni(ipo),
      lotAmountHni: ipo?.lot_amount_hni ?? undefined,
    });
    setHniModalOpen(true);
  };

  const openEditIpo = () => {
    editIpoForm.setFieldsValue({
      name: ipo?.name || '',
      openDate: toDayjsOrNull(ipo?.open_date),
      lastApplyDate: toDayjsOrNull(ipo?.last_apply_date),
    });
    setEditIpoModalOpen(true);
  };

  const onSaveEditIpo = async (values) => {
    setEditIpoSaving(true);
    try {
      const { data } = await client.patch(`/ipos/${id}`, {
        name: values.name?.trim(),
        openDate: toDateParam(values.openDate),
        lastApplyDate: toDateParam(values.lastApplyDate),
      });
      setIpo(data);
      message.success('IPO updated');
      setEditIpoModalOpen(false);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not update IPO'));
    } finally {
      setEditIpoSaving(false);
    }
  };

  const onSaveHniConfig = async (values) => {
    setHniSaving(true);
    try {
      const allowedCategories = values.enableHni ? ['RII', 'HNI'] : ['RII'];
      const body = { allowedCategories };
      if (values.enableHni && values.lotAmountHni != null && values.lotAmountHni !== '') {
        body.lotAmountHni = values.lotAmountHni;
      }
      const { data } = await client.patch(`/ipos/${id}`, body);
      setIpo(data);
      message.success(values.enableHni ? 'HNI settings updated' : 'HNI disabled for this IPO');
      setHniModalOpen(false);
      if (distributeInvestorCategory === 'HNI' && !ipoHasHniLot(data)) {
        setDistributeInvestorCategory('RII');
      }
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not save HNI settings'));
    } finally {
      setHniSaving(false);
    }
  };

  const openDistribute = async () => {
    setSelectedIds([]);
    setSelectedGroupBulkIds([]);
    setStep(0);
    const defaultCat = ipoCategoryOptions.some((o) => o.value === 'RII') ? 'RII' : ipoCategoryOptions[0]?.value || 'RII';
    setDistributeInvestorCategory(defaultCat);
    setDistributeMode(memberGroups.length ? 'groups' : 'individual');
    setPaySplits({});
    try {
      const { data } = await client.get('/wallet');
      const accts = data.accounts || [];
      setBankAccounts(accts);
      setWallet(Number(data.balance));
      if (accts.length === 0) {
        setPayAccountId(null);
      } else if (accts.length === 1) {
        setPayMode('single');
        setPayAccountId(accts[0].id);
      } else {
        setPayMode('single');
        const best = [...accts].sort((a, b) => Number(b.balance) - Number(a.balance))[0];
        setPayAccountId(best?.id ?? null);
      }
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not load bank accounts'));
    }
    setDistributeOpen(true);
  };

  const lotForSelectedCategory = getLotAmountForCategory(ipo, distributeInvestorCategory);
  const hniLotMissing = distributeInvestorCategory === 'HNI' && lotForSelectedCategory == null;
  const totalNeeded = distributeSelectionCount * (lotForSelectedCategory ?? 0);

  const splitDebits = Object.entries(paySplits)
    .map(([bankAccountId, amount]) => ({ bankAccountId: Number(bankAccountId), amount: Number(amount) || 0 }))
    .filter((d) => d.amount > 0);
  const splitTotal = splitDebits.reduce((s, d) => s + d.amount, 0);

  const selectedPayAccount = bankAccounts.find((a) => a.id === payAccountId);
  const hasBankAccounts = bankAccounts.length > 0;
  const insufficientWallet = hasBankAccounts && payMode === 'single' && !selectedPayAccount
    ? false
    : totalNeeded > wallet;
  const missingPayAccount = payMode === 'single' && hasBankAccounts && !payAccountId;
  const insufficientSingle =
    payMode === 'single' && selectedPayAccount && totalNeeded > Number(selectedPayAccount.balance);
  const insufficientSplit =
    payMode === 'split' && (splitTotal !== totalNeeded || splitDebits.some((d) => {
      const acc = bankAccounts.find((a) => a.id === d.bankAccountId);
      return !acc || d.amount > Number(acc.balance);
    }));
  const insufficient = !hasBankAccounts || insufficientSingle || insufficientSplit;
  const bankStepValid =
    hasBankAccounts &&
    (payMode === 'split'
      ? splitDebits.length > 0 && splitTotal === totalNeeded && !insufficientSplit
      : payAccountId != null && !insufficientSingle);
  const missingReceiveAccount = bankAccounts.length > 1 && !receiveAccountId;

  const onCloseIpo = async () => {
    setStatusLoading(true);
    try {
      const { data } = await client.post(`/ipos/${id}/close`);
      setIpo(data);
      message.success('IPO closed — no wallet or provider transactions will run until you reopen');
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
      if (!data.length) message.info('No pending or outdated P&L splits for this IPO');
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
    if (!distributeSelectionCount) {
      message.warning('Select at least one member or a sub-group bulk payment');
      return;
    }
    if (!bankAccounts.length) {
      message.warning('Add a bank account under Wallet before distributing');
      return;
    }
    if (payMode === 'single') {
      if (!payAccountId) {
        message.warning('Select which bank account to pay from');
        return;
      }
      if (insufficientSingle) {
        message.warning('Selected account does not have enough balance');
        return;
      }
    } else if (payMode === 'split') {
      if (splitTotal !== totalNeeded) {
        message.warning('Split amounts must equal the total required');
        return;
      }
      if (insufficientSplit) {
        message.warning('One or more accounts do not have enough balance');
        return;
      }
    }
    setDistributing(true);
    try {
      const body = {
        memberIds: selectedIds,
        groupBulks: selectedGroupBulkIds.map((groupId) => ({
          groupId,
          investorCategory: distributeInvestorCategory,
        })),
        markGiven,
        investorCategory: distributeInvestorCategory,
      };
      if (payMode === 'split' && splitDebits.length) {
        body.accountDebits = splitDebits;
      } else {
        body.bankAccountId = payAccountId;
      }
      await client.post(`/ipos/${id}/distribute`, body);
      message.success('Funds distributed to team');
      setDistributeOpen(false);
      setSelectedIds([]);
      setSelectedGroupBulkIds([]);
      setStep(0);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Distribution failed'));
    } finally {
      setDistributing(false);
    }
  };

  const unsavedRowCount = Object.keys(editedRows).length;

  const onUndoChanges = () => {
    if (!unsavedRowCount) return;
    setEditedRows({});
    message.info('Unsaved changes discarded — restored to last saved state');
  };

  const onSaveBulk = async () => {
    if (isFrozen) {
      message.warning('IPO is closed or invalid — reopen or restore the IPO to save changes');
      return;
    }
    const updates = Object.entries(editedRows).map(([appId, vals]) => {
      const update = { id: Number(appId) };
      if (vals.allotmentStatus !== undefined) update.allotmentStatus = vals.allotmentStatus;
      if (vals.withdrawalMoney !== undefined) update.withdrawalMoney = vals.withdrawalMoney;
      if (vals.profitLoss !== undefined) update.profitLoss = vals.profitLoss;
      if (vals.remarks !== undefined) update.remarks = vals.remarks;
      if (vals.amount !== undefined) update.amount = vals.amount;
      if (vals.investorCategory !== undefined) update.investorCategory = vals.investorCategory;
      return update;
    }).filter((u) => Object.keys(u).length > 1);

    if (!updates.length) {
      message.info('No changes to save');
      return;
    }

    for (const u of updates) {
      const row = applications.find((a) => a.id === u.id);
      const status = u.allotmentStatus ?? row?.allotment_status;
      if (status === 'ALLOTED') {
        const withdrawal = u.withdrawalMoney !== undefined
          ? u.withdrawalMoney
          : (editedRows[u.id]?.withdrawalMoney ?? row?.withdrawal_money);
        const wasAllotted = row?.allotment_status === 'ALLOTED';
        const hadPnL = row?.profit_loss != null || row?.withdrawal_money != null;
        if (!wasAllotted && !hadPnL && (withdrawal == null || withdrawal === '')) {
          message.warning('Enter withdrawal money for newly allotted applications before saving');
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
    if (isFrozen) {
      message.warning('IPO is closed or invalid — reopen or restore the IPO to mark returns');
      return;
    }
    if (missingReceiveAccount) {
      message.warning('Select which bank account should receive the returned funds');
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
      setSelectedReceiveIds((prev) => prev.filter((id) => id !== appId));
      message.success('Marked as received — funds returned to wallet');
      void refreshReceiveData();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    } finally {
      setReceivingAppId(null);
    }
  };

  const onUndoReceive = async (appId, { revokeProfitSplit = false } = {}) => {
    if (isFrozen) {
      message.warning('IPO is closed or invalid — reopen or restore the IPO to undo actions');
      return;
    }
    setUndoingAppId(appId);
    try {
      const { data } = await client.post(`/ipos/applications/${appId}/undo-receive`, {
        revokeProfitSplit,
      });
      message.success(
        revokeProfitSplit && data.profitRevoked
          ? 'Settle undone and P&L split revoked'
          : 'Settle undone — wallet and member ledger reversed'
      );
      await refreshReceiveData();
    } catch (err) {
      const info = getUndoSettleBlockedModal(err);
      Modal.warning({
        title: info.title,
        width: 520,
        okText: 'Got it',
        content: (
          <div>
            <Typography.Paragraph style={{ marginBottom: 12 }}>
              {info.summary}
            </Typography.Paragraph>
            {info.rows.length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                {info.rows.map((row) => (
                  <div
                    key={row.label}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}
                  >
                    <Typography.Text type="secondary">{row.label}</Typography.Text>
                    <Typography.Text strong>{row.value}</Typography.Text>
                  </div>
                ))}
              </div>
            )}
            <Typography.Text strong>What to do</Typography.Text>
            <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {info.steps.map((step) => (
                <li key={step} style={{ marginBottom: 4 }}>{step}</li>
              ))}
            </ol>
          </div>
        ),
      });
    } finally {
      setUndoingAppId(null);
    }
  };

  const onRevokeProfitSplit = async (appId) => {
    if (isFrozen) {
      message.warning('IPO is closed or invalid — reopen or restore the IPO to change P&L splits');
      return;
    }
    setRevokingProfitAppId(appId);
    try {
      await client.post('/profit-shares/revoke', { applicationId: appId });
      message.success('P&L split revoked — provider accruals reversed');
      await refreshReceiveData();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not revoke P&L split'));
    } finally {
      setRevokingProfitAppId(null);
    }
  };

  const onReceiveBulk = async () => {
    if (isFrozen) {
      message.warning('IPO is closed or invalid — reopen or restore the IPO to mark returns');
      return;
    }
    if (!receivableSelectedIds.length) {
      message.warning('Select members whose funds you have received back');
      return;
    }
    if (missingReceiveAccount) {
      message.warning('Select which bank account should receive the returned funds');
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
      const receivedIds = new Set((data.received || []).map((r) => r.appId));
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
        const credited = data.received.reduce((sum, r) => sum + Number(r.walletAmount || 0), 0);
        setBankAccounts((prev) =>
          prev.map((a) =>
            a.id === receiveAccountId
              ? { ...a, balance: Math.round((Number(a.balance) + credited) * 100) / 100 }
              : a
          )
        );
      }
      if (ok) {
        message.success(`Received funds for ${ok} member${ok !== 1 ? 's' : ''} — credited to wallet`);
      }
      if (fail) {
        message.warning(`${fail} could not be received — check those rows individually`);
      }
      setSelectedReceiveIds([]);
      void refreshReceiveData();
    } catch (err) {
      message.error(getErrorMessage(err, 'Bulk receive failed'));
    } finally {
      setReceivingBulk(false);
    }
  };

  const updateRow = (appId, field, value) => {
    setEditedRows((prev) => ({
      ...prev,
      [appId]: { ...(prev[appId] || {}), id: Number(appId), [field]: value },
    }));
  };

  const updateWithdrawal = (record, withdrawalVal) => {
    const distributed = getRowVal(record, 'amount', 'amount');
    const profit = withdrawalVal == null || withdrawalVal === ''
      ? null
      : computeProfitFromWithdrawal(withdrawalVal, distributed);
    setEditedRows((prev) => ({
      ...prev,
      [record.id]: {
        ...(prev[record.id] || {}),
        id: Number(record.id),
        withdrawalMoney: withdrawalVal,
        profitLoss: profit,
      },
    }));
  };

  const updateAmount = (record, amountVal) => {
    const withdrawal = getRowVal(record, 'withdrawalMoney', 'withdrawal_money');
    const profit = withdrawal != null && withdrawal !== ''
      ? computeProfitFromWithdrawal(withdrawal, amountVal)
      : editedRows[record.id]?.profitLoss;
    setEditedRows((prev) => ({
      ...prev,
      [record.id]: {
        ...(prev[record.id] || {}),
        id: Number(record.id),
        amount: amountVal,
        ...(withdrawal != null && withdrawal !== '' ? { profitLoss: profit } : {}),
      },
    }));
  };

  const clearAllotmentPnL = (appId) => {
    setEditedRows((prev) => ({
      ...prev,
      [appId]: {
        ...(prev[appId] || {}),
        id: Number(appId),
        profitLoss: null,
        withdrawalMoney: null,
      },
    }));
  };

  const getComputedProfit = (record) => {
    const edited = editedRows[record.id];
    return getApplicationProfit({
      ...record,
      withdrawalMoney: edited?.withdrawalMoney,
      profitLoss: edited?.profitLoss,
      amount: edited?.amount !== undefined ? edited.amount : record.amount,
    });
  };

  const getRowVal = (record, field, dbField) => {
    const edited = editedRows[record.id];
    if (edited && edited[field] !== undefined) return edited[field];
    return record[dbField];
  };

  const columns = [
    {
      title: 'Member',
      dataIndex: 'display_name',
      fixed: 'left',
      width: 148,
      ellipsis: true,
      render: (v) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: 'Sub-group',
      dataIndex: 'member_group_name',
      width: 112,
      ellipsis: true,
      render: (v) => (v ? <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> : '—'),
    },
    {
      title: 'Payment',
      width: 108,
      ellipsis: true,
      render: (_, r) => {
        if (r.paid_to_member_id && r.paid_to_member_id !== r.member_id) {
          return (
            <Tooltip title="Group bulk — collect return from this owner, then mark each member below">
              <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                To {r.paid_to_display_name}
              </Tag>
            </Tooltip>
          );
        }
        if (r.paid_to_external_name) {
          return (
            <Tooltip title="Group bulk — paid to third-party owner; collect from them, then receive per member">
              <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                To {r.paid_to_external_name}
              </Tag>
            </Tooltip>
          );
        }
        return <Typography.Text type="secondary">Direct</Typography.Text>;
      },
    },
    {
      title: 'Cat.',
      dataIndex: 'investor_category',
      width: 76,
      align: 'center',
      render: (v, r) => {
        const value = getRowVal(r, 'investorCategory', 'investor_category') || 'RII';
        return (
          <Select
            size="small"
            style={{ width: 68 }}
            disabled={isFrozen}
            value={value}
            onChange={(val) => updateRow(r.id, 'investorCategory', val)}
            options={categoryCompactOptionsForIpo(ipo)}
            popupMatchSelectWidth={false}
            title={INVESTOR_CATEGORY_LABELS[value]}
          />
        );
      },
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      width: 112,
      render: (v, r) => (
        <InputNumber
          size="small"
          min={1}
          disabled={isFrozen}
          style={{ width: '100%' }}
          value={getRowVal(r, 'amount', 'amount')}
          onChange={(val) => updateAmount(r, val)}
        />
      ),
    },
    {
      title: 'Fund returned',
      dataIndex: 'trns_received',
      width: 118,
      align: 'center',
      sorter: (a, b) => Number(isFundReturned(b)) - Number(isFundReturned(a)),
      render: (v) =>
        v === 'Received' ? (
          <Tag color="success" style={{ marginInlineEnd: 0 }}>Returned</Tag>
        ) : (
          <Tag style={{ marginInlineEnd: 0 }}>Pending</Tag>
        ),
    },
    {
      title: 'Given',
      dataIndex: 'trns_given',
      width: 80,
      align: 'center',
      render: (v) => (v ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>{v}</Tag> : '—'),
    },
    {
      title: 'Allotment',
      dataIndex: 'allotment_status',
      width: 132,
      sorter: (a, b) => allotmentSortOrder(a) - allotmentSortOrder(b),
      sortDirections: ['ascend', 'descend'],
      render: (v, r) => (
        <Select
          size="small"
          style={{ width: '100%', minWidth: 132 }}
          disabled={isFrozen}
          value={getRowVal(r, 'allotmentStatus', 'allotment_status')}
          onChange={(val) => {
            updateRow(r.id, 'allotmentStatus', val);
            if (val === 'NOT_ALLOTED' || val === 'NOT_APPLIED') clearAllotmentPnL(r.id);
          }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'ALLOTED', label: 'Alloted' },
            { value: 'NOT_ALLOTED', label: 'Not Alloted' },
            { value: 'NOT_APPLIED', label: 'Did not apply' },
          ]}
        />
      ),
    },
    {
      title: 'Withdrawal',
      dataIndex: 'withdrawal_money',
      width: 120,
      render: (v, r) => {
        const status = getRowVal(r, 'allotmentStatus', 'allotment_status');
        if (status !== 'ALLOTED') return '—';
        return (
          <InputNumber
            size="small"
            min={0}
            disabled={isFrozen}
            style={{ width: '100%' }}
            placeholder="Received"
            value={getRowVal(r, 'withdrawalMoney', 'withdrawal_money')}
            onChange={(val) => updateWithdrawal(r, val)}
          />
        );
      },
    },
    {
      title: 'P&L (profit)',
      dataIndex: 'profit_loss',
      width: 108,
      render: (v, r) => {
        const status = getRowVal(r, 'allotmentStatus', 'allotment_status');
        if (status !== 'ALLOTED') return '—';
        const pl = getComputedProfit(r);
        if (pl == null) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Typography.Text className={pnlClassName(pl)} strong>
            {formatCurrency(pl)}
          </Typography.Text>
        );
      },
    },
    {
      title: 'P&L share',
      width: 108,
      render: (_, r) => {
        if (r.profit_share_distribution_id) {
          return (
            <Tag color="purple" style={{ marginInlineEnd: 0 }}>
              Split done
            </Tag>
          );
        }
        const status = getRowVal(r, 'allotmentStatus', 'allotment_status');
        const pl = getComputedProfit(r);
        if (status === 'ALLOTED' && pl != null && Number(pl) !== 0) {
          return <Tag color="gold" style={{ marginInlineEnd: 0 }}>On save</Tag>;
        }
        return '—';
      },
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      width: 200,
      render: (v, r) => (
        <div style={{ minWidth: 168 }}>
          <ProfitShareAmounts record={r} />
          <Input
            size="small"
            disabled={isFrozen}
            placeholder={r.profit_share_distribution_id ? 'Notes' : 'Remarks'}
            value={getRowVal(r, 'remarks', 'remarks') ?? ''}
            onChange={(e) => updateRow(r.id, 'remarks', e.target.value)}
          />
        </div>
      ),
    },
    {
      title: 'Action',
      fixed: 'right',
      width: 200,
      align: 'center',
      render: (_, r) => {
        const hasProfitSplit = Boolean(r.profit_share_distribution_id);
        if (isFrozen) {
          if (r.trns_received === 'Received') {
            return <Tag color="green" style={{ marginInlineEnd: 0 }}>Settled</Tag>;
          }
          return (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Reopen IPO
            </Typography.Text>
          );
        }
        if (r.trns_received === 'Received') {
          return (
            <Space size={4} wrap>
              <Tag color="green" style={{ marginInlineEnd: 0 }}>Settled</Tag>
              <Popconfirm
                title="Undo settle for this member?"
                description="Reverses wallet credit and member RECEIVED ledger. Blocked if wallet balance is too low (e.g. you already repaid a provider)."
                onConfirm={() => onUndoReceive(r.id, { revokeProfitSplit: false })}
                okText="Undo settle"
              >
                <Button
                  size="small"
                  danger
                  ghost
                  icon={<UndoOutlined />}
                  loading={undoingAppId === r.id}
                >
                  Undo
                </Button>
              </Popconfirm>
              {hasProfitSplit && (
                <Popconfirm
                  title="Also undo settle and revoke P&L split?"
                  description="Undoes fund settle and removes the profit split (provider accruals reversed)."
                  onConfirm={() => onUndoReceive(r.id, { revokeProfitSplit: true })}
                  okText="Undo all"
                >
                  <Button size="small" type="link" danger loading={undoingAppId === r.id}>
                    + P&L
                  </Button>
                </Popconfirm>
              )}
            </Space>
          );
        }
        return (
          <Space size={4} wrap>
            <Popconfirm title="Mark received and return to wallet?" onConfirm={() => onReceive(r.id)}>
              <Button size="small" type="primary" ghost loading={receivingAppId === r.id}>
                Receive
              </Button>
            </Popconfirm>
            {hasProfitSplit && (
              <Popconfirm
                title="Revoke P&L profit split?"
                description="Removes the split and reverses provider accruals. Does not undo fund settle."
                onConfirm={() => onRevokeProfitSplit(r.id)}
                okText="Revoke split"
              >
                <Button
                  size="small"
                  type="link"
                  danger
                  loading={revokingProfitAppId === r.id}
                >
                  Undo P&L
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
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
            {isInvalid && <Tag color="default">INVALID</Tag>}
            <Button size="small" type="text" icon={<EditOutlined />} onClick={openEditIpo} disabled={isInvalid}>
              Edit
            </Button>
          </Space>
        }
        subtitle={
          <>
            Open {formatIpoDate(ipo?.open_date)}
            {' '}
            · Close {formatIpoDate(ipo?.last_apply_date)}
            {' '}
            · RII lot {formatCurrency(getLotAmountForCategory(ipo, 'RII'))}
            {ipoAllowsHni(ipo) && (
              <>
                {' '}
                · HNI lot{' '}
                {ipoHasHniLot(ipo)
                  ? formatCurrency(getLotAmountForCategory(ipo, 'HNI'))
                  : 'not set'}
              </>
            )}
            {' '}
            · Wallet {formatCurrency(wallet)}
            {ipo?.ipo_segment && (
              <> · <Tag>{ipo.ipo_segment === 'SME' ? 'SME IPO' : 'Mainboard IPO'}</Tag></>
            )}
            {allowedCategoryTags.map((c) => (
              <Tag key={c} color={categoryTagColor(c)} style={{ marginLeft: 4 }}>{c}</Tag>
            ))}
          </>
        }
        extra={
          <Space wrap>
            <Link to="/ipos"><Button icon={<ArrowLeftOutlined />}>Back</Button></Link>
            {!isFrozen && (
              <Button onClick={openHniSetup}>
                {ipoAllowsHni(ipo) ? 'HNI settings' : 'Set up HNI'}
              </Button>
            )}
            <Tooltip
              title={
                isInvalid
                  ? 'Invalid IPO — restore to main list before distributing'
                  : isClosed
                  ? 'IPO is closed — reopen to distribute funds to more members'
                  : !availableMembers.length
                    ? 'All active members already have an application for this IPO'
                    : 'Distribute lot amount from wallet to selected members'
              }
            >
              <Button
                type="primary"
                onClick={openDistribute}
                disabled={!availableMembers.length || isFrozen}
              >
                Distribute Funds
              </Button>
            </Tooltip>
            <Button icon={<UndoOutlined />} onClick={onUndoChanges} disabled={!unsavedRowCount || isFrozen}>
              Undo{unsavedRowCount ? ` (${unsavedRowCount})` : ''}
            </Button>
            <Button icon={<SaveOutlined />} onClick={onSaveBulk} disabled={!unsavedRowCount || isFrozen} type={unsavedRowCount && !isFrozen ? 'primary' : 'default'}>
              Save Changes
            </Button>
            {applications.length > 0 && (
              <Button icon={<SearchOutlined />} onClick={() => setAllotmentCheckOpen(true)} disabled={isFrozen}>
                Check allotment (PAN)
              </Button>
            )}
            <Link
              to="/profit-sharing"
              state={{ presetIpoId: Number(id), presetIpoName: ipo?.name }}
            >
              <Button icon={<TeamOutlined />}>Share rules for this IPO</Button>
            </Link>
            <Button
              icon={<PercentageOutlined />}
              onClick={onPreviewProfitShare}
              loading={profitLoading}
              disabled={isFrozen}
            >
              Split / re-split P&L
            </Button>
            {isInvalid ? (
              <>
                <Popconfirm
                  title="Restore to main IPO list?"
                  onConfirm={async () => {
                    setStatusLoading(true);
                    try {
                      const { data } = await client.post(`/ipos/${id}/restore`);
                      setIpo(data);
                      message.success('IPO restored to main list');
                    } catch (err) {
                      message.error(getErrorMessage(err));
                    } finally {
                      setStatusLoading(false);
                    }
                  }}
                >
                  <Button icon={<RollbackOutlined />} loading={statusLoading}>
                    Restore IPO
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="Permanently delete this IPO?"
                  description="Only empty invalid IPOs can be deleted. This cannot be undone."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    setStatusLoading(true);
                    try {
                      await client.delete(`/ipos/${id}`);
                      message.success('IPO deleted');
                      navigate('/ipos');
                    } catch (err) {
                      message.error(getErrorMessage(err));
                    } finally {
                      setStatusLoading(false);
                    }
                  }}
                >
                  <Button danger icon={<DeleteOutlined />} loading={statusLoading}>
                    Delete IPO
                  </Button>
                </Popconfirm>
              </>
            ) : isClosed ? (
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
              <>
                <Popconfirm
                  title="Close this IPO?"
                  description="Close updates status only — no wallet or fund-provider transactions. Reopen to distribute funds or run P&L splits."
                  onConfirm={onCloseIpo}
                >
                  <Button icon={<LockOutlined />} danger loading={statusLoading}>
                    Close IPO
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="Mark as invalid IPO?"
                  description="Hides from the main list. Records are kept — you can restore later."
                  onConfirm={async () => {
                    setStatusLoading(true);
                    try {
                      const { data } = await client.post(`/ipos/${id}/invalidate`);
                      setIpo(data);
                      message.success('IPO marked invalid');
                    } catch (err) {
                      message.error(getErrorMessage(err));
                    } finally {
                      setStatusLoading(false);
                    }
                  }}
                >
                  <Button icon={<StopOutlined />} loading={statusLoading}>
                    Mark invalid
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        }
      />

      {isInvalid && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Invalid IPO"
          description="This IPO is hidden from the main list. You can still view records here. Restore it to distribute funds or use it normally."
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <IpoSummaryStats summary={displaySummary} loading={loading} />
      </div>

      {!isFrozen && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Required fund for active members"
          description={
            availableMembers.length === 0 ? (
              'All active members already have an application for this IPO.'
            ) : (
              <>
                <strong>{availableMembers.length}</strong> active member
                {availableMembers.length !== 1 ? 's' : ''} available ×{' '}
                <strong>{formatCurrency(riiLotAmount)}</strong> (RII) ={' '}
                <strong>{formatCurrency(requiredFundForActiveRii)}</strong>
                {requiredFundForActiveHni != null && (
                  <>
                    {' '}
                    · HNI:{' '}
                    <strong>{availableMembers.length}</strong> ×{' '}
                    <strong>{formatCurrency(hniLotAmount)}</strong> ={' '}
                    <strong>{formatCurrency(requiredFundForActiveHni)}</strong>
                  </>
                )}
                {' '}
                · Wallet {formatCurrency(wallet)}
                {wallet < requiredFundForActiveRii && (
                  <Typography.Text type="danger"> — wallet is short for full RII distribution</Typography.Text>
                )}
              </>
            )
          }
        />
      )}

      {!isFrozen && !ipoAllowsHni(ipo) && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="HNI is optional for this IPO"
          description="Retail (RII) is always available. Enable HNI and set its lot amount when you need high net-worth applications."
          action={
            <Button size="small" type="primary" onClick={openHniSetup}>
              Set up HNI
            </Button>
          }
        />
      )}
      {!isFrozen && ipoAllowsHni(ipo) && !ipoHasHniLot(ipo) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="HNI enabled — lot amount not set"
          description="Members cannot be distributed as HNI until you enter the HNI lot amount."
          action={
            <Button size="small" type="primary" onClick={openHniSetup}>
              Set HNI lot
            </Button>
          }
        />
      )}

      {!isFrozen && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="P&L share runs automatically on save"
          description="When you set Alloted and enter profit or loss (e.g. ₹4,000), Save Changes splits it by that member's rules and adds a row in Profit Sharing → History."
        />
      )}

      {isClosed && (
        <Alert
          type="warning"
          message="IPO is closed"
          description="Applications are read-only while closed — no edits, receive, undo, or P&L changes. Reopen the IPO from the header to continue working."
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {isInvalid && !isClosed && (
        <Alert
          type="warning"
          message="Invalid IPO"
          description="Applications are read-only. Restore this IPO from the IPO list to edit or perform actions."
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {notAppliedPendingReturn.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${notAppliedPendingReturn.length} member${notAppliedPendingReturn.length !== 1 ? 's' : ''} did not apply — return funds pending`}
          description={
            <>
              Set allotment to <strong>Did not apply</strong>, save, then use Receive when money is back.
              For sub-group members paid to a group owner, collect from the owner first — each member row still needs its own Receive so ledgers stay correct.
            </>
          }
        />
      )}

      {!isFrozen && bankAccounts.length > 0 && (
        <div className="ipo-receive-account-row" style={{ marginBottom: 16 }}>
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

      <ContentCard
        title={`Applications (${filteredApplications.length}${returnFilter !== 'all' ? ` of ${applications.length}` : ''})`}
      >
        {applications.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Allotted members: enter Withdrawal money (total received back). P&L = withdrawal − distributed amount. On save, profit is shared using share rules for this IPO."
          />
        )}
        {applications.length > 0 && (
          <Space wrap style={{ marginBottom: 16 }}>
            <Segmented
              value={returnFilter}
              onChange={setReturnFilter}
              options={[
                { label: `All (${applications.length})`, value: 'all' },
                { label: `Returned (${returnedCount})`, value: 'returned' },
                { label: `Pending payment (${pendingReturnCount})`, value: 'pending' },
                { label: `Did not apply (${notAppliedCount})`, value: 'not_applied' },
                { label: `Alloted (${allottedCount})`, value: 'allotted' },
                { label: `Not Alloted (${notAllottedCount})`, value: 'not_allotted' },
              ]}
            />
            {returnedCount > 0 && (
              <Typography.Text type="secondary">
                {returnedCount} of {applications.length} member{applications.length !== 1 ? 's' : ''} returned funds
              </Typography.Text>
            )}
            {receivableSelectedIds.length > 0 && !isFrozen && (
              <Button type="primary" loading={receivingBulk} onClick={onReceiveBulk}>
                Receive selected ({receivableSelectedIds.length})
              </Button>
            )}
          </Space>
        )}
        <Table
          key={returnFilter}
          rowKey="id"
          loading={loading || refreshing}
          className="pro-table ipo-applications-table"
          size="middle"
          columns={columns}
          dataSource={filteredApplications}
          rowSelection={isFrozen ? undefined : {
            selectedRowKeys: selectedReceiveIds,
            onChange: setSelectedReceiveIds,
            getCheckboxProps: (record) => ({
              disabled: isFundReturned(record),
              title: isFundReturned(record) ? 'Already returned' : undefined,
            }),
          }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `${total} member${total !== 1 ? 's' : ''}`,
          }}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: returnFilter === 'all'
              ? 'No applications yet — distribute funds to members'
              : returnFilter === 'returned'
                ? 'No members have returned funds yet'
                : returnFilter === 'not_applied'
                  ? 'No members marked as did not apply'
                  : returnFilter === 'allotted'
                    ? 'No members marked as alloted yet'
                    : returnFilter === 'not_allotted'
                      ? 'No members marked as not alloted yet'
                      : 'All members have returned funds',
          }}
        />
      </ContentCard>

      <Modal
        title="Split / re-split P&L (by %)"
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
          message="Split or re-split P&L"
          description="Includes new splits and rows where share rules changed since the last split. Re-split reverses the old split first."
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
          scroll={{ x: 'max-content' }}
          className="pro-table"
          dataSource={profitPreview}
          columns={[
            { title: 'Member', dataIndex: 'memberName' },
            {
              title: 'Status',
              render: (_, r) => (r.needsResplit
                ? <Tag color="warning">Re-split</Tag>
                : <Tag color="processing">New</Tag>),
            },
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
          <Button key="go" type="primary" disabled={insufficient || distributing || hniLotMissing} loading={distributing} onClick={onDistribute}>
            Confirm Distribution
          </Button>,
        ]}
        width={720}
        destroyOnClose
      >
        <Steps current={step} items={[{ title: 'Members' }, { title: 'Category & pay' }, { title: 'Confirm' }]} style={{ marginBottom: 24 }} />

        {step === 0 && (
          <>
            {availableMembers.length ? (
              <>
                {memberGroups.length > 0 && (
                  <Segmented
                    value={distributeMode}
                    onChange={setDistributeMode}
                    options={[
                      { label: 'By sub-group', value: 'groups' },
                      { label: 'All members', value: 'individual' },
                    ]}
                    style={{ marginBottom: 16 }}
                  />
                )}

                {distributeMode === 'groups' && memberGroups.length > 0 ? (
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {memberGroups.map((group) => {
                      const groupAvailable = group.members.filter((m) => isMemberAvailable(m.id));
                      const bulkSelected = isGroupBulkSelected(group.id);
                      const selectedInGroup = groupAvailable.filter((m) => selectedIds.includes(m.id));
                      const allSelected =
                        !bulkSelected
                        && groupAvailable.length > 0
                        && selectedInGroup.length === groupAvailable.length;
                      const someSelected = selectedInGroup.length > 0 && !allSelected;
                      const hasOwner = groupHasOwner(group);
                      const bulkTotal = groupAvailable.length * (lotForSelectedCategory ?? 0);
                      const noAvailableLabel = group.members.every(
                        (m) => getGroupMemberDistributeReason(m) === 'inactive'
                      )
                        ? ' · no active members'
                        : group.members.some((m) => getGroupMemberDistributeReason(m) === 'inactive')
                          ? ' · no available members'
                          : ' · all already applied';

                      return (
                        <div
                          key={group.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: 12,
                            background: bulkSelected || selectedInGroup.length ? '#f8fafc' : undefined,
                          }}
                        >
                          <Checkbox
                            checked={bulkSelected}
                            disabled={!groupAvailable.length || !hasOwner}
                            onChange={(e) => toggleGroupBulk(group, e.target.checked)}
                          >
                            <Typography.Text strong>{group.name}</Typography.Text>
                            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                              Bulk to owner
                              {hasOwner ? (
                                <> — <Tag color="gold">{group.ownerDisplayName}</Tag></>
                              ) : (
                                <> — <Link to="/member-groups">set owner</Link></>
                              )}
                              {bulkSelected && groupAvailable.length > 0 && (
                                <> · {groupAvailable.length} members · {formatCurrency(bulkTotal)}</>
                              )}
                              {!groupAvailable.length && noAvailableLabel}
                            </Typography.Text>
                          </Checkbox>
                          {!bulkSelected && (
                            <>
                              <div style={{ marginLeft: 24, marginTop: 8 }}>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  Or pay each member individually:
                                </Typography.Text>
                              </div>
                              <div style={{ marginLeft: 24, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <Checkbox
                                  indeterminate={someSelected}
                                  checked={allSelected}
                                  disabled={!groupAvailable.length}
                                  onChange={(e) => toggleGroupSelection(group, e.target.checked)}
                                >
                                  Select all in group
                                </Checkbox>
                                {group.members.map((m) => {
                                  const available = isMemberAvailable(m.id);
                                  const reason = getGroupMemberDistributeReason(m);
                                  return (
                                    <Checkbox
                                      key={m.id}
                                      checked={selectedIds.includes(m.id)}
                                      disabled={!available}
                                      onChange={() => toggleMemberSelection(m.id, group.id)}
                                    >
                                      {m.displayName} ({formatPan(m.pan)})
                                      {m.id === group.ownerMemberId && (
                                        <Tag color="gold" style={{ marginLeft: 6 }}>Owner</Tag>
                                      )}
                                      {reason === 'inactive' && (
                                        <Typography.Text type="secondary"> — inactive</Typography.Text>
                                      )}
                                      {reason === 'applied' && (
                                        <Typography.Text type="secondary"> — already applied</Typography.Text>
                                      )}
                                    </Checkbox>
                                  );
                                })}
                              </div>
                            </>
                          )}
                          {bulkSelected && (
                            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0 24px', fontSize: 12 }}>
                              One payment to {group.ownerDisplayName} for:{' '}
                              {groupAvailable.map((m) => m.displayName).join(', ') || '—'}
                            </Typography.Paragraph>
                          )}
                        </div>
                      );
                    })}

                    {ungroupedAvailable.length > 0 && (
                      <>
                        <Divider style={{ margin: '8px 0' }}>No sub-group</Divider>
                        <Checkbox.Group
                          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                          value={selectedIds}
                          onChange={setSelectedIds}
                          options={ungroupedAvailable.map((m) => ({
                            label: `${m.display_name} (${formatPan(m.pan)})`,
                            value: m.id,
                          }))}
                        />
                      </>
                    )}
                    <Space size={0}>
                      <Button
                        type="link"
                        onClick={() => {
                          setSelectedGroupBulkIds([]);
                          setSelectedIds(availableMembers.map((m) => m.id));
                        }}
                      >
                        Select all
                      </Button>
                      <Button
                        type="link"
                        disabled={!selectedIds.length && !selectedGroupBulkIds.length}
                        onClick={() => {
                          setSelectedIds([]);
                          setSelectedGroupBulkIds([]);
                        }}
                      >
                        Deselect all
                      </Button>
                    </Space>
                  </Space>
                ) : (
                  <>
                    <Checkbox.Group
                      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                      value={selectedIds}
                      onChange={setSelectedIds}
                      options={availableMembers.map((m) => ({ label: `${m.display_name} (${formatPan(m.pan)})`, value: m.id }))}
                    />
                    <Space size={0}>
                      <Button
                        type="link"
                        onClick={() => {
                          setSelectedGroupBulkIds([]);
                          setSelectedIds(availableMembers.map((m) => m.id));
                        }}
                      >
                        Select all
                      </Button>
                      <Button
                        type="link"
                        disabled={!selectedIds.length && !selectedGroupBulkIds.length}
                        onClick={() => {
                          setSelectedIds([]);
                          setSelectedGroupBulkIds([]);
                        }}
                      >
                        Deselect all
                      </Button>
                    </Space>
                  </>
                )}

                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                  message={
                    <>
                      Selected: <strong>{distributeSelectionCount}</strong> application(s) ×{' '}
                      <strong>{formatCurrency(lotForSelectedCategory)}</strong> ({distributeInvestorCategory}) ={' '}
                      <strong>{formatCurrency(totalNeeded)}</strong>
                      {selectedGroupBulkIds.length > 0 && (
                        <span> · {selectedGroupBulkIds.length} group bulk payment(s)</span>
                      )}
                      {availableMembers.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          Full active list: {availableMembers.length} × {formatCurrency(lotForSelectedCategory)} ={' '}
                          {formatCurrency(availableMembers.length * (lotForSelectedCategory ?? 0))}
                        </div>
                      )}
                    </>
                  }
                />
              </>
            ) : (
              <Alert type="warning" message="All active members already have applications for this IPO" showIcon />
            )}
            <div style={{ marginTop: 16 }}>
              <Button disabled={!distributeSelectionCount} type="primary" onClick={() => setStep(1)}>Next</Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Typography.Text strong>Application category</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                  Applies to all {distributeSelectionCount} selected application(s). Default is RII (
                  {formatCurrency(getLotAmountForCategory(ipo, 'RII'))}).
                  {ipoHasHniLot(ipo) && (
                    <> HNI lot is {formatCurrency(getLotAmountForCategory(ipo, 'HNI'))}.</>
                  )}
                  {ipoAllowsHni(ipo) && !ipoHasHniLot(ipo) && (
                    <> Set HNI lot on the IPO page to distribute as HNI.</>
                  )}
                </Typography.Paragraph>
                <Select
                  style={{ width: '100%', maxWidth: 400 }}
                  value={distributeInvestorCategory}
                  onChange={setDistributeInvestorCategory}
                  options={ipoCategoryOptions.map((o) => ({
                    value: o.value,
                    label: INVESTOR_CATEGORY_LABELS[o.value] || o.label,
                  }))}
                />
              </div>

              <div>
                <label>
                  <Switch checked={markGiven} onChange={setMarkGiven} /> Mark as applied (Given)
                </label>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0 24px' }}>
                  Use Receive in the applications table later when IPO funds are returned to your wallet.
                </Typography.Paragraph>
              </div>

              {!hasBankAccounts ? (
                <Alert
                  type="error"
                  showIcon
                  message="No bank accounts"
                  description={
                    <>
                      Add at least one bank account under{' '}
                      <Link to="/wallet">Wallet</Link> before distributing IPO funds.
                    </>
                  }
                />
              ) : (
                <div className="distribute-bank-section">
                  <Typography.Text strong>
                    <BankOutlined style={{ marginRight: 6 }} />
                    Pay from bank account
                  </Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
                    Total needed: {formatCurrency(totalNeeded)} · Team wallet total: {formatCurrency(wallet)}
                  </Typography.Paragraph>

                  {bankAccounts.length > 1 && (
                    <Select
                      style={{ width: '100%', marginBottom: 12 }}
                      value={payMode}
                      onChange={(v) => {
                        setPayMode(v);
                        if (v === 'split') setPaySplits({});
                      }}
                      options={[
                        { value: 'single', label: 'Pay from one account' },
                        { value: 'split', label: 'Split across multiple accounts' },
                      ]}
                    />
                  )}

                  {payMode === 'single' ? (
                    <div className="distribute-bank-options">
                      {bankAccounts.map((a) => {
                        const canAfford = Number(a.balance) >= totalNeeded;
                        return (
                          <div
                            key={a.id}
                            className={`distribute-bank-option${payAccountId === a.id ? ' distribute-bank-option--selected' : ''}${!canAfford ? ' distribute-bank-option--disabled' : ''}`}
                            onClick={() => canAfford && setPayAccountId(a.id)}
                            onKeyDown={(e) => {
                              if (canAfford && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setPayAccountId(a.id);
                              }
                            }}
                            role="button"
                            tabIndex={canAfford ? 0 : -1}
                          >
                            <div className="distribute-bank-option-main">
                              <span className="distribute-bank-option-label">{a.label}</span>
                              {a.bank_name && (
                                <span className="distribute-bank-option-sub">{a.bank_name}</span>
                              )}
                            </div>
                            <div className="distribute-bank-option-balance">
                              <span className={canAfford ? '' : 'amount-negative'}>
                                {formatCurrency(a.balance)} available
                              </span>
                              {!canAfford && (
                                <Typography.Text type="danger" style={{ fontSize: 11, display: 'block' }}>
                                  Need {formatCurrency(totalNeeded)}
                                </Typography.Text>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      {bankAccounts.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ flex: 1 }}>
                            <strong>{a.label}</strong>
                            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                              ({formatCurrency(a.balance)} available)
                            </Typography.Text>
                          </span>
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

                  {missingPayAccount && (
                    <Typography.Text type="danger" style={{ display: 'block', marginTop: 8 }}>
                      Select an account to pay from
                    </Typography.Text>
                  )}
                  {insufficientSingle && selectedPayAccount && (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginTop: 8 }}
                      message={`${selectedPayAccount.label} does not have enough balance`}
                      description={`Available ${formatCurrency(selectedPayAccount.balance)}, need ${formatCurrency(totalNeeded)}`}
                    />
                  )}
                </div>
              )}
            </Space>
            <div style={{ marginTop: 16 }}>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button
                type="primary"
                style={{ marginLeft: 8 }}
                disabled={!bankStepValid}
                onClick={() => setStep(2)}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p>Applications: <strong>{distributeSelectionCount}</strong></p>
            {selectedGroupBulkIds.length > 0 && (
              <p>Group bulk: <strong>{selectedGroupBulkIds.length}</strong> (paid to group owners)</p>
            )}
            <p>
              Application category:{' '}
              <Tag color={categoryTagColor(distributeInvestorCategory)}>{distributeInvestorCategory}</Tag>
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {INVESTOR_CATEGORY_LABELS[distributeInvestorCategory]}
              </Typography.Text>
            </p>
            <p>
              Lot amount ({distributeInvestorCategory}):{' '}
              <strong>{formatCurrency(lotForSelectedCategory)}</strong>
            </p>
            <p>Total required: <strong>{formatCurrency(totalNeeded)}</strong></p>
            {payMode === 'single' && selectedPayAccount ? (
              <Alert
                type="info"
                showIcon
                icon={<BankOutlined />}
                style={{ marginBottom: 12 }}
                message={`Pay from: ${selectedPayAccount.label}`}
                description={`${formatCurrency(totalNeeded)} will be debited from this account (${formatCurrency(selectedPayAccount.balance)} available)`}
              />
            ) : payMode === 'split' && splitDebits.length > 0 ? (
              <Alert
                type="info"
                showIcon
                icon={<BankOutlined />}
                style={{ marginBottom: 12 }}
                message="Pay from multiple accounts"
                description={
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {splitDebits.map((d) => {
                      const acc = bankAccounts.find((a) => a.id === d.bankAccountId);
                      return (
                        <li key={d.bankAccountId}>
                          {acc?.label}: {formatCurrency(d.amount)}
                        </li>
                      );
                    })}
                  </ul>
                }
              />
            ) : null}
            {insufficient && (
              <Alert
                type="error"
                message="Cannot distribute"
                description={
                  !hasBankAccounts
                    ? 'Add bank accounts under Wallet first.'
                    : missingPayAccount
                    ? 'Select which bank account to pay from.'
                    : insufficientSplit
                    ? 'Adjust split amounts so they match the total and each account has enough balance.'
                    : insufficientSingle
                      ? `${selectedPayAccount?.label} does not have enough for ${formatCurrency(totalNeeded)}.`
                      : 'Check bank balances and try again.'
                }
                showIcon
              />
            )}
          </>
        )}
      </Modal>

      <Modal
        title="Edit IPO"
        open={editIpoModalOpen}
        onCancel={() => setEditIpoModalOpen(false)}
        onOk={() => editIpoForm.submit()}
        confirmLoading={editIpoSaving}
        destroyOnClose
      >
        <Form form={editIpoForm} layout="vertical" onFinish={onSaveEditIpo}>
          <Form.Item
            name="name"
            label="IPO name"
            rules={[{ required: true, message: 'Enter IPO name' }, { whitespace: true, message: 'Enter IPO name' }]}
          >
            <Input placeholder="e.g. Acme Industries" maxLength={120} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="openDate" label="Open date">
                <ModalDatePicker allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastApplyDate" label="Close date (last apply)">
                <ModalDatePicker allowClear />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="HNI settings"
        open={hniModalOpen}
        onCancel={() => setHniModalOpen(false)}
        onOk={() => hniForm.submit()}
        confirmLoading={hniSaving}
        destroyOnClose
      >
        <Form form={hniForm} layout="vertical" onFinish={onSaveHniConfig}>
          <Form.Item name="enableHni" valuePropName="checked">
            <Checkbox>Enable HNI applications for this IPO</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.enableHni !== cur.enableHni}>
            {({ getFieldValue }) =>
              getFieldValue('enableHni') ? (
                <Form.Item
                  name="lotAmountHni"
                  label="HNI lot amount (₹)"
                  extra="Required before you can distribute funds as HNI."
                >
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="HNI application amount" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <AllotmentCheckModal
        ipoId={Number(id)}
        open={allotmentCheckOpen}
        onClose={() => setAllotmentCheckOpen(false)}
        onApplyStatus={(appId, status) => {
          updateRow(appId, 'allotmentStatus', status);
          if (status === 'NOT_ALLOTED' || status === 'NOT_APPLIED') clearAllotmentPnL(appId);
        }}
      />
    </div>
  );
}
