import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import client from '../api/client';
import AllotmentProcessPanel from './AllotmentProcessPanel';
import AllotmentStatusBadge from './AllotmentStatusBadge';
import { getErrorMessage } from '../utils/errors';
import { fetchRegistrarOptions } from '../utils/allotmentCheck';
import { tableDefaults } from '../utils/table';
import { checkAllotmentSequentially, pickAllotmentTargets, applyAllotmentResult, sameAllotmentId } from '../utils/allotmentAutoCheck';
import { ipoIsListed } from '../utils/ipoProfit';

export default function AllotmentCheckModal({ ipoId, open, onClose, onChecked, onRowUpdate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState([]);
  const [savingRegistrar, setSavingRegistrar] = useState(false);
  const [registrarOptions, setRegistrarOptions] = useState([]);

  const load = () => {
    if (!open || !ipoId) {
      setData(null);
      setSummary(null);
      setProgress(null);
      setActivity([]);
      return;
    }
    setLoading(true);
    client
      .get(`/ipos/${ipoId}/allotment-check`)
      .then((r) => setData(r.data))
      .catch((err) => {
        if (err.response?.status === 409 && err.response?.data?.code === 'ALLOTMENT_NOT_OPEN') {
          setData({ blocked: true, message: getErrorMessage(err) });
          return;
        }
        message.error(getErrorMessage(err, 'Failed to load'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    fetchRegistrarOptions(client).then(setRegistrarOptions);
  }, [open]);

  useEffect(() => {
    load();
  }, [open, ipoId]);

  const saveRegistrar = async (registrar) => {
    setSavingRegistrar(true);
    try {
      await client.patch(`/ipos/${ipoId}`, { registrar: registrar || null });
      message.success('Registrar saved');
      const { data: refreshed } = await client.get(`/ipos/${ipoId}/allotment-check`);
      setData(refreshed);
    } catch (err) {
      message.error(getErrorMessage(err, 'Save failed'));
    } finally {
      setSavingRegistrar(false);
    }
  };

  const patchRow = (appId, result) => {
    setData((prev) => {
      if (!prev?.applications) return prev;
      return {
        ...prev,
        applications: prev.applications.map((row) => (
          sameAllotmentId(row.id, appId) ? applyAllotmentResult(row, result) : row
        )),
      };
    });
  };

  const applyQueue = (applications) => {
    if (!Array.isArray(applications)) return;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        applications: applications.map((a) => ({
          id: a.id,
          display_name: a.name || a.display_name,
          maskedPan: a.maskedPan,
          allotment_status: a.allotmentStatus || a.allotment_status,
        })),
      };
    });
  };

  const runCheck = async (recheck = false) => {
    const targets = pickAllotmentTargets(data?.applications, recheck);
    if (!targets.length) {
      message.info(recheck ? 'No members to recheck' : 'No pending members');
      return;
    }
    setChecking(true);
    setSummary(null);
    setActivity([]);
    setProgress({ current: 0, total: targets.length, name: null, phase: 'start', allotted: 0, notAllotted: 0 });
    let allotted = 0;
    let notAllotted = 0;
    try {
      const stats = await checkAllotmentSequentially({
        ipoId,
        targets,
        onProgress: ({ index, id, name, phase, row, message: blocked, providerLabel }) => {
          setCheckingId(phase === 'checking' ? id : null);
          if (row?.status === 'ALLOTED' || row?.status === 'PARTIALLY_ALLOTTED') allotted += 1;
          if (row?.status === 'NOT_ALLOTED') notAllotted += 1;
          if (phase === 'done' && row) {
            setActivity((prev) => [
              { key: `${id}-${index}`, name, status: row.status, lots: row.allottedLots },
              ...prev,
            ].slice(0, 6));
          }
          setProgress({
            current: phase === 'checking' ? index : index + 1,
            total: targets.length,
            name,
            phase,
            message: blocked,
            providerLabel,
            allotted,
            notAllotted,
          });
        },
        onQueue: applyQueue,
        onRow: (row, app) => {
          if (!row || row.skipped) return;
          patchRow(app.id, row);
          onRowUpdate?.(row);
        },
      });
      setSummary(stats);
      const { data: refreshed } = await client.get(`/ipos/${ipoId}/allotment-check`);
      setData(refreshed);
      onChecked?.(stats);
      if (stats.message && !stats.checked) message.warning(stats.message);
      else message.success(`Checked ${stats.checked} · allotted ${stats.allotted} · not allotted ${stats.notAllotted}`);
    } catch (err) {
      message.error(getErrorMessage(err, 'Allotment check failed'));
    } finally {
      setChecking(false);
      setCheckingId(null);
    }
  };

  const waitingForListing = !ipoIsListed(data?.ipo);
  const blocked = Boolean(data?.blocked);

  if (blocked) {
    return (
      <Modal
        title="Check allotment"
        open={open}
        onCancel={onClose}
        footer={<Button onClick={onClose}>Close</Button>}
        width={560}
        destroyOnClose
        className="allotment-check-modal"
      >
        <Alert
          type="info"
          showIcon
          message="Allotment not open yet"
          description={data.message}
        />
      </Modal>
    );
  }

  const memberCols = [
    {
      title: 'Member',
      dataIndex: 'display_name',
      render: (name, row) => (
        <div>
          <div className="allotment-member-name">{name}</div>
          {sameAllotmentId(checkingId, row.id) && <div className="allotment-member-hint">Querying registrar…</div>}
        </div>
      ),
    },
    {
      title: 'PAN',
      dataIndex: 'maskedPan',
      render: (v, row) => <Typography.Text code>{v || row.masked_pan || '—'}</Typography.Text>,
    },
    {
      title: 'Status',
      dataIndex: 'allotment_status',
      render: (s, row) => (
        <AllotmentStatusBadge
          status={s}
          checking={sameAllotmentId(checkingId, row.id)}
          waitingForListing={waitingForListing}
        />
      ),
    },
  ];

  return (
    <Modal
      title={data ? `Check allotment — ${data.ipo.name}` : 'Check allotment'}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button onClick={() => runCheck(true)} disabled={checking || loading}>
            Recheck all
          </Button>
          <Button type="primary" icon={<SearchOutlined />} loading={checking} onClick={() => runCheck(false)}>
            Check pending
          </Button>
        </Space>
      }
      width={860}
      destroyOnClose
      className="allotment-check-modal"
    >
      <div className="allotment-check-registrar" style={{ marginBottom: 16 }}>
        <Typography.Text strong style={{ marginRight: 8 }}>
          IPO registrar (optional)
        </Typography.Text>
        <Select
          allowClear
          placeholder="Which registrar handles this IPO?"
          style={{ minWidth: 220 }}
          loading={savingRegistrar}
          value={data?.ipo?.registrar}
          onChange={saveRegistrar}
          options={registrarOptions}
        />
      </div>

      <AllotmentProcessPanel
        checking={checking}
        progress={progress}
        summary={summary}
        activity={activity}
        waitingForListing={waitingForListing}
        compact
      />

      <Table
        {...tableDefaults}
        className="pro-table allotment-table"
        rowKey={(row) => String(row.id)}
        size="small"
        loading={loading}
        columns={memberCols}
        dataSource={data?.applications ?? []}
        rowClassName={(row) => {
          const status = row.allotment_status || row.allotmentStatus;
          const parts = ['allotment-row'];
          if (sameAllotmentId(checkingId, row.id)) parts.push('allotment-row--checking');
          else if (waitingForListing && (status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED')) parts.push('allotment-row--waiting');
          else if (status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED') parts.push('allotment-row--allotted');
          else if (status === 'NOT_ALLOTED') parts.push('allotment-row--missed');
          return parts.join(' ');
        }}
        pagination={data?.applications?.length > 8 ? { pageSize: 8, showTotal: (t) => `${t} members` } : false}
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
}
