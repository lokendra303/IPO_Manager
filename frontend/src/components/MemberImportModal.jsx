import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { formatPan } from '../utils/format';
import {
  downloadMemberSample,
  MEMBER_IMPORT_COLUMNS,
  normalizePanValue,
  parseMemberSpreadsheet,
  toImportPayload,
  validateMemberImportRows,
} from '../utils/memberImport';

export default function MemberImportModal({
  open,
  onClose,
  existingPans,
  groupNames,
  onImported,
}) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [importingKeys, setImportingKeys] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName('');
    setParseError(null);
    setSelectedKeys([]);
    setImportingKeys(new Set());
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const validated = useMemo(
    () => validateMemberImportRows(rows, { existingPans, groupNames }),
    [rows, existingPans, groupNames]
  );

  const validRows = validated.filter((r) => r.valid);
  const invalidRows = validated.filter((r) => !r.valid);
  const selectedValid = validated.filter((r) => r.valid && selectedKeys.includes(r.key));

  const applyFile = async (file) => {
    try {
      const parsed = await parseMemberSpreadsheet(file);
      if (parsed.error) {
        setParseError(parsed.error);
        setRows([]);
        setSelectedKeys([]);
        setFileName(file.name);
        return;
      }
      setParseError(null);
      setFileName(file.name);
      setRows(parsed.rows);
      const next = validateMemberImportRows(parsed.rows, { existingPans, groupNames });
      setSelectedKeys(next.filter((r) => r.valid).map((r) => r.key));
    } catch (err) {
      setParseError(getErrorMessage(err, 'Could not read that file'));
      setRows([]);
      setSelectedKeys([]);
    }
  };

  const markAdded = (keys) => {
    const gone = new Set(keys);
    setRows((prev) => prev.filter((r, i) => {
      const key = `r-${r.rowNumber}-${String(r.pan || '').toUpperCase().replace(/[\s-]/g, '') || 'blank'}`;
      // After validation keys include normalized pan; drop matching selected keys by rowNumber
      return !keys.some((k) => k.endsWith(`-${String(r.pan || '').toUpperCase().replace(/[\s-]/g, '')}`) || k.startsWith(`r-${r.rowNumber}-`)) || !gone.has(key);
    }));
    setSelectedKeys((prev) => prev.filter((k) => !gone.has(k)));
  };

  const addRows = async (toAdd) => {
    if (!toAdd.length) {
      message.warning('Select at least one valid member');
      return;
    }
    setBusy(true);
    const keys = toAdd.map((r) => r.key);
    setImportingKeys(new Set(keys));
    try {
      const { data } = await client.post('/members/import', {
        members: toAdd.map(toImportPayload),
      });
      const created = Number(data?.createdCount || 0);
      const failed = (data?.results || []).filter((r) => !r.ok);
      if (created) {
        message.success(created === 1 ? 'Member added' : `${created} members added`);
        onImported?.();
      }
      if (failed.length) {
        message.warning(failed.map((f) => `${f.pan || 'Row'}: ${f.error}`).slice(0, 3).join(' · '));
      }
      const addedPans = new Set(
        (data?.results || []).filter((r) => r.ok).map((r) => String(r.pan || '').toUpperCase())
      );
      setRows((prev) => prev.filter((r) => !addedPans.has(normalizePanValue(r.pan))));
      setSelectedKeys((prev) => prev.filter((k) => !keys.includes(k)));
    } catch (err) {
      message.error(getErrorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
      setImportingKeys(new Set());
    }
  };

  const columns = [
    {
      title: '',
      width: 42,
      render: (_, row) => (
        <Checkbox
          disabled={!row.valid || busy}
          checked={row.valid && selectedKeys.includes(row.key)}
          onChange={(e) => {
            setSelectedKeys((prev) => (
              e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key)
            ));
          }}
        />
      ),
    },
    { title: 'Row', dataIndex: 'rowNumber', width: 64 },
    {
      title: 'PAN',
      dataIndex: 'pan',
      width: 130,
      render: (v) => formatPan(v) || '—',
    },
    { title: 'Name', dataIndex: 'name', ellipsis: true },
    { title: 'Email', dataIndex: 'email', ellipsis: true, render: (v) => v || '—' },
    { title: 'Group', dataIndex: 'subGroup', width: 120, render: (v) => v || '—' },
    {
      title: 'Check',
      width: 280,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          {row.valid ? <Tag color="success">Valid</Tag> : <Tag color="error">Invalid</Tag>}
          {row.errors.map((err) => (
            <Typography.Text key={err} type="danger" style={{ fontSize: 12 }}>{err}</Typography.Text>
          ))}
          {row.warnings.map((warn) => (
            <Typography.Text key={warn} type="warning" style={{ fontSize: 12 }}>{warn}</Typography.Text>
          ))}
        </Space>
      ),
    },
    {
      title: '',
      width: 88,
      render: (_, row) => (
        <Button
          size="small"
          type="link"
          disabled={!row.valid || busy}
          loading={importingKeys.has(row.key)}
          onClick={() => addRows([row])}
        >
          Add
        </Button>
      ),
    },
  ];

  return (
    <Modal
      title="Import members"
      open={open}
      onCancel={close}
      width={980}
      destroyOnClose
      footer={[
        <Button key="close" onClick={close}>Close</Button>,
        <Button
          key="selected"
          type="primary"
          disabled={!selectedValid.length}
          loading={busy}
          onClick={() => addRows(selectedValid)}
        >
          Add selected ({selectedValid.length})
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="PAN and name are required"
        description="In the sample file, required columns are labeled (required) and the rest (optional). Empty optional cells are fine. PAN must be 10 characters like ABCDE1234F."
      />
      <div className="mem-import-cols">
        {MEMBER_IMPORT_COLUMNS.map((col) => (
          <div key={col.key} className={`mem-import-col${col.required ? ' is-required' : ''}`}>
            <span className="mem-import-col-name">{col.key}</span>
            <Tag color={col.required ? 'red' : 'default'}>{col.required ? 'Required' : 'Optional'}</Tag>
            <span className="mem-import-col-note">{col.note}</span>
          </div>
        ))}
      </div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button onClick={() => downloadMemberSample('csv')}>Sample CSV</Button>
        <Button onClick={() => downloadMemberSample('xlsx')}>Sample Excel</Button>
      </Space>
      <Upload.Dragger
        accept=".csv,.xlsx,.xls"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          applyFile(file);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">Drop a CSV or Excel file here, or click to choose</p>
        <p className="ant-upload-hint">{fileName || 'Use the sample so PAN and column names match.'}</p>
      </Upload.Dragger>

      {parseError ? (
        <Alert type="error" showIcon style={{ marginTop: 12 }} message={parseError} />
      ) : null}

      {validated.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, margin: '14px 0 8px', flexWrap: 'wrap' }}>
            <Tag color="success">{validRows.length} valid</Tag>
            <Tag color="error">{invalidRows.length} invalid</Tag>
            <Button
              size="small"
              onClick={() => setSelectedKeys(validRows.map((r) => r.key))}
            >
              Select all valid
            </Button>
            <Button size="small" onClick={() => setSelectedKeys([])}>Clear selection</Button>
          </div>
          <Table
            size="small"
            rowKey="key"
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            dataSource={validated}
            columns={columns}
            rowClassName={(row) => (row.valid ? '' : 'mem-import-invalid')}
            scroll={{ x: 860 }}
          />
        </>
      )}
    </Modal>
  );
}
