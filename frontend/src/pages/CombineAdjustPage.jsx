import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Col, Modal, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, SwapOutlined, SendOutlined, DownloadOutlined, ClockCircleOutlined, FundOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import StatCard from '../components/StatCard';

export default function CombineAdjustPage() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ sources: [], targets: [] });
  const [fromIpoIds, setFromIpoIds] = useState([]);
  const [targetIpoIds, setTargetIpoIds] = useState([]);
  const [category, setCategory] = useState('RII');
  const [preview, setPreview] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [assignments, setAssignments] = useState({}); // applicationId -> targetIpoId
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adjustingId, setAdjustingId] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [providerBalance, setProviderBalance] = useState(0);
  const [payAccountId, setPayAccountId] = useState(null);

  const reloadMeta = () =>
    client
      .get('/ipos/adjust-combine/meta')
      .then((r) => setMeta(r.data || { sources: [], targets: [] }))
      .catch((err) => message.error(getErrorMessage(err)));

  const reloadWallet = () =>
    client
      .get('/wallet')
      .then((r) => {
        const accts = (r.data.accounts || []).filter((a) => a.purpose !== 'MANAGER');
        setBankAccounts(accts);
        setProviderBalance(Number(r.data.providerBalance ?? r.data.balance ?? 0));
        setPayAccountId((prev) => {
          if (prev && accts.some((a) => a.id === prev)) return prev;
          return accts.length === 1 ? accts[0].id : prev;
        });
      })
      .catch(() => {});

  const reloadPreview = async (nextAssign = assignments) => {
    if (!fromIpoIds.length || !targetIpoIds.length) {
      setPreview(null);
      setSelectedKeys([]);
      return;
    }
    setPreviewLoading(true);
    try {
      const assignmentList = Object.entries(nextAssign)
        .filter(([, tid]) => tid)
        .map(([applicationId, targetIpoId]) => ({
          applicationId: Number(applicationId),
          targetIpoId: Number(targetIpoId),
        }));
      const { data } = await client.post('/ipos/adjust-combine/preview', {
        fromIpoIds,
        targetIpoIds,
        investorCategory: category,
        assignments: assignmentList,
      });
      setPreview(data);
      const eligible = (data.rows || []).filter((r) => r.eligible);
      setSelectedKeys(eligible.map((r) => r.applicationId));
      setAssignments((prev) => {
        const next = { ...prev };
        for (const r of eligible) {
          if (r.targetIpoId) next[r.applicationId] = r.targetIpoId;
        }
        // drop adjusted apps that disappeared
        for (const key of Object.keys(next)) {
          if (!(data.rows || []).some((r) => String(r.applicationId) === String(key))) {
            delete next[key];
          }
        }
        return next;
      });
    } catch (err) {
      message.error(getErrorMessage(err, 'Preview failed'));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      client.get('/ipos/adjust-combine/meta'),
      client.get('/wallet').catch(() => ({ data: {} })),
    ])
      .then(([metaRes, walletRes]) => {
        setMeta(metaRes.data || { sources: [], targets: [] });
        const accts = (walletRes.data?.accounts || []).filter((a) => a.purpose !== 'MANAGER');
        setBankAccounts(accts);
        setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
        if (accts.length === 1) setPayAccountId(accts[0].id);
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Reload preview when sources/targets/category change (target per-row via changeTarget)
  useEffect(() => {
    if (!fromIpoIds.length || !targetIpoIds.length) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const assignmentList = Object.entries(assignments)
          .filter(([, tid]) => tid)
          .map(([applicationId, targetIpoId]) => ({
            applicationId: Number(applicationId),
            targetIpoId: Number(targetIpoId),
          }));
        const { data } = await client.post('/ipos/adjust-combine/preview', {
          fromIpoIds,
          targetIpoIds,
          investorCategory: category,
          assignments: assignmentList,
        });
        if (cancelled) return;
        setPreview(data);
        const eligible = (data.rows || []).filter((r) => r.eligible);
        setSelectedKeys(eligible.map((r) => r.applicationId));
        setAssignments((prev) => {
          const next = { ...prev };
          for (const r of eligible) {
            if (r.targetIpoId) next[r.applicationId] = r.targetIpoId;
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          message.error(getErrorMessage(err, 'Preview failed'));
          setPreview(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments refreshed via changeTarget
  }, [fromIpoIds, targetIpoIds, category]);

  const changeTarget = async (applicationId, targetIpoId) => {
    const nextAssign = { ...assignments, [applicationId]: targetIpoId };
    setAssignments(nextAssign);
    if (!fromIpoIds.length || !targetIpoIds.length) return;
    setPreviewLoading(true);
    try {
      const assignmentList = Object.entries(nextAssign)
        .filter(([, tid]) => tid)
        .map(([appId, tid]) => ({
          applicationId: Number(appId),
          targetIpoId: Number(tid),
        }));
      const { data } = await client.post('/ipos/adjust-combine/preview', {
        fromIpoIds,
        targetIpoIds,
        investorCategory: category,
        assignments: assignmentList,
      });
      setPreview(data);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedRows = useMemo(() => {
    if (!preview) return [];
    const set = new Set(selectedKeys);
    return (preview.rows || []).filter((r) => r.eligible && set.has(r.applicationId));
  }, [preview, selectedKeys]);

  const selectedBySource = useMemo(() => {
    const map = new Map();
    for (const r of selectedRows) {
      if (!map.has(r.sourceIpoId)) {
        map.set(r.sourceIpoId, {
          sourceIpoId: r.sourceIpoId,
          sourceIpoName: r.sourceIpoName,
          count: 0,
          totalToSend: 0,
          totalToCollect: 0,
        });
      }
      const s = map.get(r.sourceIpoId);
      s.count += 1;
      s.totalToSend += Number(r.toSend || 0);
      s.totalToCollect += Number(r.toCollect || 0);
    }
    return [...map.values()];
  }, [selectedRows]);

  const selectedByTarget = useMemo(() => {
    const map = new Map();
    for (const r of selectedRows) {
      const tid = assignments[r.applicationId] || r.targetIpoId;
      const name =
        r.targetOptions?.find((o) => o.targetIpoId === tid)?.targetIpoName || r.targetIpoName;
      if (!map.has(tid)) {
        map.set(tid, {
          targetIpoId: tid,
          targetIpoName: name,
          count: 0,
          totalToSend: 0,
          totalToCollect: 0,
        });
      }
      const t = map.get(tid);
      t.count += 1;
      t.totalToSend += Number(r.toSend || 0);
      t.totalToCollect += Number(r.toCollect || 0);
    }
    return [...map.values()];
  }, [selectedRows, assignments]);

  const selectedByMember = useMemo(() => {
    if (!preview) return [];

    const targetMetaById = new Map(
      (preview.targetIpos || meta.targets || []).map((t) => [
        t.id,
        {
          id: t.id,
          name: t.name,
          lot:
            category === 'HNI'
              ? Number(t.lotAmountHni ?? t.lot_amount_hni ?? 0)
              : Number(t.lotAmountRii ?? t.lot_amount_rii ?? 0),
        },
      ])
    );

    const blockedByMember = new Map();
    const pushBlocked = (list) => {
      for (const u of list || []) {
        if (!blockedByMember.has(u.memberId)) blockedByMember.set(u.memberId, []);
        blockedByMember.get(u.memberId).push(u);
      }
    };
    pushBlocked(preview.unadjustedPending);
    pushBlocked(preview.allottedExcluded);
    // Ineligible rows (couldn't assign a target) also mean fund not unlocked for another new IPO
    for (const r of preview.rows || []) {
      if (!r.eligible && r.remainder > 0) {
        if (!blockedByMember.has(r.memberId)) blockedByMember.set(r.memberId, []);
        blockedByMember.get(r.memberId).push({
          applicationId: r.applicationId,
          memberId: r.memberId,
          memberName: r.memberName,
          sourceIpoName: r.sourceIpoName,
          remainder: r.remainder,
          allotmentStatus: r.allotmentStatus,
          reason: r.blockedReason || 'Not adjustable',
        });
      }
    }

    const map = new Map();
    for (const r of selectedRows) {
      const key = r.memberId;
      const tid = assignments[r.applicationId] || r.targetIpoId;
      const opt = r.targetOptions?.find((o) => o.targetIpoId === tid);
      const targetName = opt?.targetIpoName || r.targetIpoName;
      const newLot = opt?.newLot ?? r.newLot ?? null;
      if (!map.has(key)) {
        map.set(key, {
          memberId: r.memberId,
          memberName: r.memberName,
          groupName: r.groupName || null,
          count: 0,
          adjustToSend: 0,
          freshToSend: 0,
          totalToSend: 0,
          totalToCollect: 0,
          totalAdjust: 0,
          targets: [],
          freshTargets: [],
        });
      }
      const m = map.get(key);
      m.count += 1;
      m.adjustToSend += Number(r.toSend || 0);
      m.totalToCollect += Number(r.toCollect || 0);
      m.totalAdjust += Number(r.adjustAmount || 0);
      m.targets.push({
        kind: 'adjust',
        targetIpoId: tid,
        targetIpoName: targetName,
        newLot: newLot != null ? Number(newLot) : null,
        toSend: Number(r.toSend || 0),
        toCollect: Number(r.toCollect || 0),
        sourceIpoName: r.sourceIpoName,
        remainder: Number(r.remainder || 0),
      });
    }

    // If old fund is still pending / allotted / blocked, member cannot roll it onto another
    // selected new IPO — add that new IPO's full lot as fresh "to send".
    for (const m of map.values()) {
      const covered = new Set(m.targets.map((t) => t.targetIpoId).filter(Boolean));
      const uncovered = (targetIpoIds || []).filter((id) => !covered.has(id));
      const blocked = blockedByMember.get(m.memberId) || [];
      const freshCount = Math.min(uncovered.length, blocked.length);
      m.freshTargets = [];
      m.freshToSend = 0;
      for (let i = 0; i < freshCount; i += 1) {
        const tid = uncovered[i];
        const metaT = targetMetaById.get(tid);
        const lot = metaT?.lot > 0 ? metaT.lot : null;
        const blockedOld = blocked[i];
        m.freshTargets.push({
          kind: 'fresh',
          targetIpoId: tid,
          targetIpoName: metaT?.name || `#${tid}`,
          newLot: lot,
          toSend: lot || 0,
          reason: blockedOld?.allotmentStatus === 'ALLOTED'
            ? 'Old allotted — send full new lot'
            : blockedOld?.allotmentStatus === 'PENDING'
              ? 'Old still pending — send full new lot'
              : 'Old fund not unlocked — send full new lot',
          blockedSourceIpoName: blockedOld?.sourceIpoName || null,
        });
        m.freshToSend += Number(lot || 0);
      }
      m.totalToSend = m.adjustToSend + m.freshToSend;
    }

    return [...map.values()].sort((a, b) =>
      String(a.memberName || '').localeCompare(String(b.memberName || ''))
    );
  }, [preview, selectedRows, assignments, targetIpoIds, meta.targets, category]);

  const memberTotalsById = useMemo(() => {
    const map = new Map();
    for (const m of selectedByMember) map.set(m.memberId, m);
    return map;
  }, [selectedByMember]);

  const liveTotals = useMemo(() => {
    const adjustToSend = selectedRows.reduce((s, r) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s, r) => s + Number(r.toCollect || 0), 0);
    const totalAdjust = selectedRows.reduce((s, r) => s + Number(r.adjustAmount || 0), 0);
    const freshToSend = selectedByMember.reduce((s, m) => s + Number(m.freshToSend || 0), 0);
    const totalToSend = adjustToSend + freshToSend;
    const unadjustedToCollect = Number(preview?.totals?.unadjustedToCollect || 0);
    const allottedCount = Number(preview?.totals?.allottedCount || preview?.allottedExcluded?.length || 0);
    const allottedPrincipal = Number(preview?.totals?.allottedPrincipal || 0);
    return {
      adjustToSend,
      freshToSend,
      totalToSend,
      totalToCollect,
      totalAdjust,
      unadjustedToCollect,
      allottedCount,
      allottedPrincipal,
      grandToCollect: totalToCollect + unadjustedToCollect,
      count: selectedRows.length,
      memberCount: selectedByMember.length,
    };
  }, [selectedRows, preview, selectedByMember]);

  const onSubmit = (rowsToAdjust) => {
    const rows = Array.isArray(rowsToAdjust) ? rowsToAdjust : selectedRows;
    if (!rows.length) {
      message.warning('Select at least one member');
      return;
    }

    const toSend = rows.reduce((s, r) => s + Number(r.toSend || 0), 0);
    const toCollect = rows.reduce((s, r) => s + Number(r.toCollect || 0), 0);
    const single = rows.length === 1;

    if (toSend > 0.001) {
      if (!bankAccounts.length) {
        message.error('Add a provider wallet account before adjusting top-ups');
        return;
      }
      if (bankAccounts.length > 1 && !payAccountId) {
        message.warning('Select provider wallet account for the top-up debit');
        return;
      }
      const acc = bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id));
      if (acc && Number(acc.balance) < toSend) {
        message.error(
          `Insufficient provider wallet (${acc.label}). Need ${formatCurrency(toSend)}, available ${formatCurrency(acc.balance)}`
        );
        return;
      }
    }

    Modal.confirm({
      title: single
        ? `Adjust ${rows[0].memberName}?`
        : `Adjust ${rows.length} selected applications?`,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            Top-up (to send) is debited from the provider wallet. Group leader wallets update from the new apps (paid-to leader).
          </p>
          <div>
            Roll {rows.length} row{rows.length > 1 ? 's' : ''}
            {toSend > 0 && (
              <>
                {' · '}
                <Typography.Text type="danger">
                  provider debit {formatCurrency(toSend)}
                </Typography.Text>
              </>
            )}
            {toCollect > 0 && <> · to collect {formatCurrency(toCollect)}</>}
          </div>
          {toSend > 0 && (
            <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>
              From:{' '}
              {bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id))?.label ||
                'provider wallet'}
            </div>
          )}
        </div>
      ),
      okText: single ? 'Adjust this one' : `Adjust selected (${rows.length})`,
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        if (single) setAdjustingId(rows[0].applicationId);
        try {
          const items = rows.map((r) => ({
            applicationId: r.applicationId,
            targetIpoId: assignments[r.applicationId] || r.targetIpoId,
          }));
          const body = {
            items,
            investorCategory: category,
          };
          if (toSend > 0.001) {
            body.bankAccountId = payAccountId || bankAccounts[0]?.id;
          }
          const { data } = await client.post('/ipos/adjust-combine', body);
          message.success(
            `Adjusted ${data.count}: rolled ${formatCurrency(data.totalAdjusted)}` +
              (data.providerDebited > 0
                ? ` · provider debited ${formatCurrency(data.providerDebited)}`
                : data.totalToSend > 0
                  ? ` · send ${formatCurrency(data.totalToSend)}`
                  : '') +
              (data.totalToCollect > 0 ? ` · collect ${formatCurrency(data.totalToCollect)}` : '')
          );
          await reloadMeta();
          await reloadWallet();
          await reloadPreview();
        } catch (err) {
          message.error(getErrorMessage(err, 'Combine adjust failed'));
          throw err;
        } finally {
          setSubmitting(false);
          setAdjustingId(null);
        }
      },
    });
  };

  const adjustOne = (row) => {
    if (!row?.eligible) return;
    onSubmit([row]);
  };

  const adjustMemberRows = (memberId) => {
    const rows = selectedRows.filter((r) => r.memberId === memberId);
    if (!rows.length) {
      const all = (preview?.rows || []).filter((r) => r.eligible && r.memberId === memberId);
      onSubmit(all);
      return;
    }
    onSubmit(rows);
  };

  if (loading) return <PageLoading />;

  const sourceOptions = (meta.sources || []).map((s) => ({
    value: s.id,
    label: `${s.name} (${s.adjustableCount} · ${formatCurrency(s.adjustablePrincipal)})`,
    disabled: targetIpoIds.includes(s.id),
  }));
  const targetOptions = (meta.targets || []).map((t) => ({
    value: t.id,
    label: `${t.name} · RII ${t.lotAmountRii != null ? formatCurrency(t.lotAmountRii) : '—'}`,
    disabled: fromIpoIds.includes(t.id),
  }));

  return (
    <div>
      <PageHeader
        title={
          <Space>
            <SwapOutlined />
            Combine adjust IPOs
          </Space>
        }
        subtitle="Top-up debits provider wallet. Group leader wallets follow paid-to on new apps."
        extra={
          <>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ipos')}>
              IPOs
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!selectedRows.length}
              onClick={() => onSubmit()}
            >
              Adjust selected ({liveTotals.count})
            </Button>
          </>
        }
      />

      <ContentCard title="Select IPOs" padded style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">Old IPOs (sources) — pick 1 or more</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select old IPOs with unsettled not-allotted funds"
              value={fromIpoIds}
              options={sourceOptions}
              onChange={(ids) => {
                setFromIpoIds(ids);
                setAssignments({});
              }}
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">New IPOs (targets) — pick 1 or more</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select open IPOs to adjust onto"
              value={targetIpoIds}
              options={targetOptions}
              onChange={(ids) => {
                setTargetIpoIds(ids);
                setAssignments({});
              }}
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Typography.Text type="secondary">Category on new IPOs</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={category}
              onChange={setCategory}
              options={[
                { value: 'RII', label: 'RII' },
                { value: 'HNI', label: 'HNI' },
              ]}
            />
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Typography.Text type="secondary">
              Provider wallet (for top-up debit)
            </Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              allowClear={bankAccounts.length > 1}
              placeholder={bankAccounts.length ? 'Select account' : 'No provider account'}
              value={payAccountId}
              onChange={setPayAccountId}
              options={bankAccounts.map((a) => ({
                value: a.id,
                label: `${a.label} · ${formatCurrency(a.balance)}`,
              }))}
            />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              Provider total {formatCurrency(providerBalance)}
              {liveTotals.adjustToSend > 0 && (
                <>
                  {' · '}
                  need {formatCurrency(liveTotals.adjustToSend)}
                  {liveTotals.adjustToSend > providerBalance + 0.001 && (
                    <Typography.Text type="danger"> (short)</Typography.Text>
                  )}
                </>
              )}
            </Typography.Text>
          </Col>
        </Row>
      </ContentCard>

      {preview && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="To send (selected)"
                value={formatCurrency(liveTotals.totalToSend)}
                icon={<SendOutlined />}
                variant="danger"
              />
              {liveTotals.freshToSend > 0 && (
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  top-up {formatCurrency(liveTotals.adjustToSend)} + full lots{' '}
                  {formatCurrency(liveTotals.freshToSend)}
                </Typography.Text>
              )}
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="To collect (selected)"
                value={formatCurrency(liveTotals.totalToCollect)}
                icon={<DownloadOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Pending / not adjusted"
                value={formatCurrency(liveTotals.unadjustedToCollect)}
                icon={<ClockCircleOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Total to collect"
                value={formatCurrency(liveTotals.grandToCollect)}
                icon={<FundOutlined />}
                variant="primary"
              />
            </Col>
          </Row>

          {(selectedBySource.length > 0 || selectedByTarget.length > 0) && (
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} md={12}>
                <ContentCard title="By old IPO (selected)">
                  <Table
                    size="small"
                    rowKey="sourceIpoId"
                    pagination={false}
                    dataSource={selectedBySource}
                    columns={[
                      { title: 'Old IPO', dataIndex: 'sourceIpoName' },
                      { title: 'Rows', dataIndex: 'count', width: 70 },
                      {
                        title: 'To send',
                        dataIndex: 'totalToSend',
                        align: 'right',
                        render: (v) => (
                          <Typography.Text type={v > 0 ? 'danger' : undefined} strong={v > 0}>
                            {formatCurrency(v)}
                          </Typography.Text>
                        ),
                      },
                      {
                        title: 'To collect',
                        dataIndex: 'totalToCollect',
                        align: 'right',
                        render: (v) => formatCurrency(v),
                      },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <strong>Total</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>{liveTotals.count}</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <Typography.Text type="danger" strong>
                            {formatCurrency(liveTotals.totalToSend)}
                          </Typography.Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <strong>{formatCurrency(liveTotals.totalToCollect)}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </ContentCard>
              </Col>
              <Col xs={24} md={12}>
                <ContentCard title="By new IPO (selected)">
                  <Table
                    size="small"
                    rowKey="targetIpoId"
                    pagination={false}
                    dataSource={selectedByTarget}
                    columns={[
                      { title: 'New IPO', dataIndex: 'targetIpoName' },
                      { title: 'Rows', dataIndex: 'count', width: 70 },
                      {
                        title: 'To send',
                        dataIndex: 'totalToSend',
                        align: 'right',
                        render: (v) => (
                          <Typography.Text type={v > 0 ? 'danger' : undefined} strong={v > 0}>
                            {formatCurrency(v)}
                          </Typography.Text>
                        ),
                      },
                      {
                        title: 'To collect',
                        dataIndex: 'totalToCollect',
                        align: 'right',
                        render: (v) => formatCurrency(v),
                      },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <strong>Total</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>{liveTotals.count}</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <Typography.Text type="danger" strong>
                            {formatCurrency(liveTotals.totalToSend)}
                          </Typography.Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <strong>{formatCurrency(liveTotals.totalToCollect)}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </ContentCard>
              </Col>
            </Row>
          )}

          {selectedByMember.length > 0 && (
            <ContentCard
              title={`By member (selected) · ${selectedByMember.length}`}
              style={{ marginBottom: 16 }}
              extra={
                <Button
                  type="primary"
                  size="small"
                  loading={submitting}
                  disabled={!selectedRows.length}
                  onClick={() => onSubmit()}
                >
                  Adjust selected ({liveTotals.count})
                </Button>
              }
            >
              <Table
                size="small"
                rowKey="memberId"
                pagination={false}
                dataSource={selectedByMember}
                scroll={{ x: 720 }}
                columns={[
                  {
                    title: 'Member',
                    dataIndex: 'memberName',
                    render: (v, r) => (
                      <span>
                        {v}
                        {r.groupName && (
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            {r.groupName}
                          </Typography.Text>
                        )}
                      </span>
                    ),
                  },
                  {
                    title: 'Adjust / blocked',
                    width: 90,
                    render: (_, r) => (
                      <span>
                        {r.count} adj
                        {r.freshTargets?.length > 0 && (
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            +{r.freshTargets.length} full
                          </Typography.Text>
                        )}
                      </span>
                    ),
                  },
                  {
                    title: 'Funding plan',
                    render: (_, r) => (
                      <div>
                        {(r.targets || []).map((t, i) => (
                          <Typography.Text
                            key={`a-${t.targetIpoId}-${i}`}
                            style={{ display: 'block', fontSize: 12 }}
                          >
                            Adjust → {t.targetIpoName}{' '}
                            <Typography.Text strong>
                              {t.newLot != null ? formatCurrency(t.newLot) : '—'}
                            </Typography.Text>
                            {t.toSend > 0 && (
                              <Typography.Text type="danger">
                                {' '}(+{formatCurrency(t.toSend)} top-up)
                              </Typography.Text>
                            )}
                          </Typography.Text>
                        ))}
                        {(r.freshTargets || []).map((t, i) => (
                          <Typography.Text
                            key={`f-${t.targetIpoId}-${i}`}
                            style={{ display: 'block', fontSize: 12 }}
                            type="danger"
                          >
                            Full send → {t.targetIpoName}{' '}
                            <Typography.Text type="danger" strong>
                              {t.newLot != null ? formatCurrency(t.newLot) : '—'}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                              {t.reason}
                              {t.blockedSourceIpoName ? ` (${t.blockedSourceIpoName})` : ''}
                            </Typography.Text>
                          </Typography.Text>
                        ))}
                      </div>
                    ),
                  },
                  {
                    title: 'To send',
                    dataIndex: 'totalToSend',
                    align: 'right',
                    width: 130,
                    render: (v, r) => (
                      <span>
                        <Typography.Text type={v > 0 ? 'danger' : undefined} strong>
                          {formatCurrency(v)}
                        </Typography.Text>
                        {(r.freshToSend > 0 || r.adjustToSend > 0) && (
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                            {r.adjustToSend > 0 ? `top-up ${formatCurrency(r.adjustToSend)}` : ''}
                            {r.adjustToSend > 0 && r.freshToSend > 0 ? ' + ' : ''}
                            {r.freshToSend > 0 ? `full ${formatCurrency(r.freshToSend)}` : ''}
                          </Typography.Text>
                        )}
                      </span>
                    ),
                  },
                  {
                    title: 'To collect',
                    dataIndex: 'totalToCollect',
                    align: 'right',
                    width: 110,
                    render: (v) => <strong>{formatCurrency(v)}</strong>,
                  },
                  {
                    title: '',
                    width: 100,
                    render: (_, r) => (
                      <Button
                        size="small"
                        type="link"
                        disabled={submitting}
                        loading={submitting && selectedRows.some((x) => x.memberId === r.memberId) && adjustingId == null}
                        onClick={() => adjustMemberRows(r.memberId)}
                      >
                        Adjust
                      </Button>
                    ),
                  },
                ]}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <strong>All members</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>{liveTotals.count}</Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>
                      {liveTotals.freshToSend > 0 && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          incl. full lots {formatCurrency(liveTotals.freshToSend)}
                        </Typography.Text>
                      )}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Typography.Text type="danger" strong>
                        {formatCurrency(liveTotals.totalToSend)}
                      </Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <strong>{formatCurrency(liveTotals.totalToCollect)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} />
                  </Table.Summary.Row>
                )}
              />
            </ContentCard>
          )}

          <Alert
            style={{ marginBottom: 16 }}
            type="info"
            showIcon
            message="1) Select provider wallet if there is a top-up. 2) Adjust one-by-one or multi-select. Provider wallet is checked and debited; group leader wallet updates from paid-to."
          />

          <ContentCard
            title={`Members (${preview.rows?.length || 0}) · selected ${liveTotals.count}`}
            style={{ marginBottom: 16 }}
            extra={
              <Space wrap>
                <Button
                  size="small"
                  onClick={() =>
                    setSelectedKeys(
                      (preview.rows || []).filter((r) => r.eligible).map((r) => r.applicationId)
                    )
                  }
                >
                  Select all
                </Button>
                <Button size="small" onClick={() => setSelectedKeys([])}>
                  Clear
                </Button>
                <Typography.Text type="danger" strong>
                  To send {formatCurrency(liveTotals.totalToSend)}
                </Typography.Text>
                <Button
                  type="primary"
                  size="small"
                  loading={submitting}
                  disabled={!selectedRows.length}
                  onClick={() => onSubmit()}
                >
                  Adjust selected ({liveTotals.count})
                </Button>
              </Space>
            }
          >
            <Table
              size="small"
              rowKey="applicationId"
              loading={previewLoading}
              dataSource={preview.rows || []}
              pagination={false}
              scroll={{ x: 1100 }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                getCheckboxProps: (r) => ({ disabled: !r.eligible }),
              }}
              columns={[
                {
                  title: 'Member',
                  dataIndex: 'memberName',
                  render: (v, r) => {
                    const mt = memberTotalsById.get(r.memberId);
                    return (
                      <span>
                        {v}
                        {r.groupName && (
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            {r.groupName}
                          </Typography.Text>
                        )}
                        {mt && selectedKeys.includes(r.applicationId) && (
                          <Typography.Text style={{ display: 'block', fontSize: 12 }} type="danger">
                            Member total send {formatCurrency(mt.totalToSend)}
                            {mt.freshToSend > 0
                              ? ` (top-up ${formatCurrency(mt.adjustToSend)} + full ${formatCurrency(mt.freshToSend)})`
                              : mt.totalToCollect > 0
                                ? ` · collect ${formatCurrency(mt.totalToCollect)}`
                                : ''}
                          </Typography.Text>
                        )}
                        {!r.eligible && (
                          <Typography.Text type="danger" style={{ display: 'block', fontSize: 12 }}>
                            {r.blockedReason}
                          </Typography.Text>
                        )}
                      </span>
                    );
                  },
                },
                {
                  title: 'From (old)',
                  dataIndex: 'sourceIpoName',
                  width: 140,
                },
                {
                  title: 'Old remaining',
                  dataIndex: 'remainder',
                  align: 'right',
                  width: 110,
                  render: (v) => formatCurrency(v),
                },
                {
                  title: 'Adjust to (new)',
                  width: 200,
                  render: (_, r) => (
                    <Select
                      style={{ width: '100%' }}
                      size="small"
                      disabled={!r.eligible && !(r.targetOptions || []).length}
                      value={assignments[r.applicationId] || r.targetIpoId || undefined}
                      options={(r.targetOptions || []).map((o) => ({
                        value: o.targetIpoId,
                        label: o.targetIpoName,
                        disabled: o.blocked && o.targetIpoId !== (assignments[r.applicationId] || r.targetIpoId),
                      }))}
                      onChange={(tid) => changeTarget(r.applicationId, tid)}
                    />
                  ),
                },
                {
                  title: 'New lot',
                  dataIndex: 'newLot',
                  align: 'right',
                  width: 100,
                  render: (v) => (v != null ? formatCurrency(v) : '—'),
                },
                {
                  title: 'To send',
                  dataIndex: 'toSend',
                  align: 'right',
                  width: 100,
                  render: (v) =>
                    v > 0 ? (
                      <Typography.Text type="danger" strong>
                        {formatCurrency(v)}
                      </Typography.Text>
                    ) : (
                      formatCurrency(0)
                    ),
                },
                {
                  title: 'To collect',
                  dataIndex: 'toCollect',
                  align: 'right',
                  width: 100,
                  render: (v) => (v > 0 ? formatCurrency(v) : formatCurrency(0)),
                },
                {
                  title: 'Old after',
                  width: 120,
                  render: (_, r) =>
                    r.eligible ? (
                      r.willMarkOldReceived ? (
                        <Tag color="success">Received</Tag>
                      ) : (
                        <Tag color="orange">Pending</Tag>
                      )
                    ) : (
                      '—'
                    ),
                },
                {
                  title: 'Action',
                  width: 100,
                  fixed: 'right',
                  render: (_, r) =>
                    r.eligible ? (
                      <Button
                        type="link"
                        size="small"
                        loading={adjustingId === r.applicationId}
                        disabled={submitting}
                        onClick={() => adjustOne(r)}
                      >
                        Adjust
                      </Button>
                    ) : (
                      '—'
                    ),
                },
              ]}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}>
                      <strong>Selected total ({liveTotals.count})</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Typography.Text type="danger" strong>
                        {formatCurrency(liveTotals.adjustToSend)}
                      </Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <strong>{formatCurrency(liveTotals.totalToCollect)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} />
                    <Table.Summary.Cell index={9} />
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </ContentCard>

          {(preview.allottedExcluded || []).length > 0 && (
            <ContentCard
              title={`Allotted — cannot adjust (${preview.allottedExcluded.length})`}
              style={{ marginBottom: 16 }}
            >
              <div style={{ padding: '12px 16px 0' }}>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`${formatCurrency(liveTotals.allottedPrincipal)} locked in allotted shares — not rolled, not added to collect. Same member can still adjust their other not-allotted IPOs.`}
                />
              </div>
              <Table
                size="small"
                rowKey="applicationId"
                pagination={false}
                dataSource={preview.allottedExcluded}
                columns={[
                  { title: 'Member', dataIndex: 'memberName' },
                  { title: 'Old IPO', dataIndex: 'sourceIpoName' },
                  {
                    title: 'Amount',
                    dataIndex: 'remainder',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                  { title: 'Reason', dataIndex: 'reason' },
                ]}
              />
            </ContentCard>
          )}

          {(preview.unadjustedPending || []).length > 0 && (
            <ContentCard title="Not adjusted — full amount to collect" style={{ marginBottom: 16 }}>
              <Table
                size="small"
                rowKey="applicationId"
                pagination={false}
                dataSource={preview.unadjustedPending}
                columns={[
                  { title: 'Member', dataIndex: 'memberName' },
                  { title: 'Old IPO', dataIndex: 'sourceIpoName' },
                  {
                    title: 'To collect',
                    dataIndex: 'toCollect',
                    align: 'right',
                    render: (v) => formatCurrency(v),
                  },
                  { title: 'Reason', dataIndex: 'reason' },
                ]}
              />
            </ContentCard>
          )}

          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message={
              <>
                <strong>Total to send manually: {formatCurrency(liveTotals.totalToSend)}</strong>
                {' · '}
                Total leftover to collect: {formatCurrency(liveTotals.totalToCollect)}
                {liveTotals.unadjustedToCollect > 0 && (
                  <>
                    {' · '}
                    Pending/not adjusted: {formatCurrency(liveTotals.unadjustedToCollect)}
                  </>
                )}
              </>
            }
          />

          <Button
            type="primary"
            size="large"
            loading={submitting}
            disabled={!selectedRows.length}
            onClick={() => onSubmit()}
            icon={<SwapOutlined />}
            style={{ marginBottom: 32 }}
          >
            Adjust selected ({liveTotals.count}) · send {formatCurrency(liveTotals.totalToSend)}
          </Button>
        </>
      )}

      {!preview && fromIpoIds.length > 0 && targetIpoIds.length > 0 && !previewLoading && (
        <Alert type="warning" showIcon message="No adjustable members for this selection" />
      )}
    </div>
  );
}
