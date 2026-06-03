import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  LinkOutlined,
  CopyOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { openAllotmentPortal, copyToClipboard, REGISTRAR_OPTIONS } from '../utils/allotmentCheck';
import { tableDefaults } from '../utils/table';

const statusColors = {
  PENDING: 'processing',
  ALLOTED: 'success',
  NOT_ALLOTED: 'default',
};

export default function AllotmentCheckModal({ ipoId, open, onClose, onApplyStatus }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingRegistrar, setSavingRegistrar] = useState(false);

  useEffect(() => {
    if (!open || !ipoId) {
      setData(null);
      return;
    }
    setLoading(true);
    client
      .get(`/ipos/${ipoId}/allotment-check`)
      .then((r) => setData(r.data))
      .catch((err) => message.error(getErrorMessage(err, 'Failed to load')))
      .finally(() => setLoading(false));
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

  const copyPan = async (pan) => {
    const ok = await copyToClipboard(pan);
    message[ok ? 'success' : 'error'](ok ? 'PAN copied' : 'Could not copy');
  };

  const memberCols = [
    { title: 'Member', dataIndex: 'display_name' },
    {
      title: 'PAN',
      dataIndex: 'pan',
      render: (pan) => (
        <Space>
          <Typography.Text code>{pan}</Typography.Text>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyPan(pan)} />
        </Space>
      ),
    },
    {
      title: 'In app',
      dataIndex: 'allotment_status',
      render: (s) => (
        <Tag color={statusColors[s]}>{s.replace(/_/g, ' ')}</Tag>
      ),
    },
    {
      title: 'After check',
      key: 'apply',
      width: 200,
      render: (_, row) => (
        <Space size="small">
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => {
              onApplyStatus?.(row.id, 'ALLOTED');
              message.success(`Marked ${row.display_name} as allotted — save grid to persist`);
            }}
          >
            Allotted
          </Button>
          <Button
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={() => {
              onApplyStatus?.(row.id, 'NOT_ALLOTED');
              message.success(`Marked ${row.display_name} as not allotted — save grid to persist`);
            }}
          >
            Not
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={data ? `Check allotment — ${data.ipo.name}` : 'Check allotment'}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={900}
      destroyOnClose
      className="allotment-check-modal"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="No free API for automatic PAN allotment lookup"
        description="SEBI registrars (KFintech, Link Intime, etc.) and BSE/NSE only offer website checks with PAN. Copy each member PAN, open an official portal, select this IPO, then update status below or in the grid."
      />

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
          options={REGISTRAR_OPTIONS}
        />
      </div>

      {data?.portals?.length > 0 && (
        <div className="allotment-check-portals" style={{ marginBottom: 20 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            Official check portals
          </Typography.Text>
          <Space wrap>
            {data.portals.map((p) => (
              <Button
                key={p.id}
                type={p.recommended ? 'primary' : 'default'}
                icon={<LinkOutlined />}
                onClick={() => openAllotmentPortal(p.url)}
              >
                {p.name}
                {p.recommended ? ' (recommended)' : ''}
              </Button>
            ))}
          </Space>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {data.portals.find((p) => p.recommended)?.steps ||
              'On BSE/NSE: select issue name, enter PAN, complete captcha if shown.'}
          </Typography.Paragraph>
        </div>
      )}

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        Team members — copy PAN and check
      </Typography.Text>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={memberCols}
        dataSource={data?.applications ?? []}
        pagination={data?.applications?.length > 8 ? { pageSize: 8 } : false}
        {...tableDefaults}
      />
    </Modal>
  );
}
