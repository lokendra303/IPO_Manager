import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Space,
  message,
  Switch,
  Segmented,
  Typography,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import MemberDetailDrawer from '../components/MemberDetailDrawer';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { tableDefaults } from '../utils/table';

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailMemberId, setDetailMemberId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    Promise.all([client.get('/members'), client.get('/member-groups')])
      .then(([m, g]) => {
        setMembers(m.data);
        setMemberGroups(g.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const uniqueMembers = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      if (!map.has(m.id)) map.set(m.id, m);
    }
    return [...map.values()];
  }, [members]);

  const filteredMembers = useMemo(() => {
    if (statusFilter === 'ALL') return uniqueMembers;
    return uniqueMembers.filter((m) => m.status === statusFilter);
  }, [uniqueMembers, statusFilter]);

  const activeCount = uniqueMembers.filter((m) => m.status === 'ACTIVE').length;
  const inactiveCount = uniqueMembers.filter((m) => m.status === 'INACTIVE').length;

  const openDetail = (record) => {
    setDetailMemberId(record.id);
    setDetailOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE' });
    setModalOpen(true);
  };

  const openEdit = (record, e) => {
    e?.stopPropagation();
    setEditing(record);
    form.setFieldsValue({
      pan: record.pan,
      displayName: record.display_name,
      status: record.status,
      relationshipNote: record.relationship_note,
      memberGroupId: record.member_group_id ?? undefined,
      sortOrder: record.sort_order,
    });
    setModalOpen(true);
  };

  const onSave = async (values) => {
    try {
      if (editing) {
        await client.patch(`/members/${editing.id}`, values);
        message.success('Member updated');
      } else {
        await client.post('/members', values);
        message.success('Member added');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Save failed'));
    }
  };

  const setMemberStatus = async (record, makeActive) => {
    const nextStatus = makeActive ? 'ACTIVE' : 'INACTIVE';
    setTogglingId(record.id);
    try {
      await client.patch(`/members/${record.id}`, { status: nextStatus });
      message.success(makeActive ? 'Member activated' : 'Member set to inactive');
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Status update failed'));
    } finally {
      setTogglingId(null);
    }
  };

  const columns = [
    {
      title: 'Active',
      key: 'active',
      width: 90,
      render: (_, r) => (
        <Popconfirm
          title={r.status === 'ACTIVE' ? 'Set member inactive?' : 'Activate this member?'}
          description={
            r.status === 'ACTIVE'
              ? 'Inactive members are hidden from IPO distribute and cannot log in. History is kept.'
              : 'Member can receive IPOs and log in with PAN again.'
          }
          onConfirm={() => setMemberStatus(r, r.status !== 'ACTIVE')}
          okText={r.status === 'ACTIVE' ? 'Set inactive' : 'Activate'}
          disabled={togglingId === r.id}
        >
          <Switch
            checked={r.status === 'ACTIVE'}
            loading={togglingId === r.id}
            onClick={(_, e) => e.stopPropagation()}
          />
        </Popconfirm>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s) => (
        <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s === 'ACTIVE' ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    { title: 'PAN', dataIndex: 'pan' },
    {
      title: 'Name',
      dataIndex: 'display_name',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(r)}>
          {v}
        </Button>
      ),
    },
    { title: 'Relationship', dataIndex: 'relationship_note' },
    {
      title: 'P&L share rules',
      render: (_, r) => {
        if (!r.share_rule_id) return <Tag color="warning">Not set</Tag>;
        return (
          <span>
            <Tag color="success">{r.share_provider_name || r.fund_provider_name}</Tag>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
              P {r.share_profit_provider_percent}/{r.share_profit_manager_percent}%
              · L {r.share_loss_provider_percent}/{r.share_loss_manager_percent}%
            </span>
          </span>
        );
      },
    },
    { title: 'Sub-Group', dataIndex: 'member_group_name', render: (v) => v ? <Tag>{v}</Tag> : '—' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button icon={<EyeOutlined />} size="small" onClick={() => openDetail(r)} title="View details" />
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              navigate('/profit-sharing', { state: { editMemberId: r.id } });
            }}
          >
            Share %
          </Button>
          <Button icon={<EditOutlined />} size="small" onClick={(e) => openEdit(r, e)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Team Members"
        subtitle="Use Active/Inactive instead of deleting — inactive members keep all IPO history"
        extra={
          <Space>
            <Link to="/member-groups">
              <Button icon={<LinkOutlined />}>Manage sub-groups</Button>
            </Link>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Member
            </Button>
          </Space>
        }
      />
      <ContentCard
        title={`Members (${filteredMembers.length}${statusFilter !== 'ALL' ? ` of ${uniqueMembers.length}` : ''})`}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: `All (${uniqueMembers.length})`, value: 'ALL' },
              { label: `Active (${activeCount})`, value: 'ACTIVE' },
              { label: `Inactive (${inactiveCount})`, value: 'INACTIVE' },
            ]}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredMembers}
          rowClassName={(record) => (record.status === 'INACTIVE' ? 'member-row-inactive' : '')}
          onRow={(record) => ({
            onClick: () => openDetail(record),
            style: { cursor: 'pointer' },
          })}
          {...tableDefaults}
        />
      </ContentCard>

      <MemberDetailDrawer
        memberId={detailMemberId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <Modal
        title={editing ? 'Edit Member' : 'Add Member'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSave}>
          <Form.Item name="displayName" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Rahul (ME)" />
          </Form.Item>
          <Form.Item name="pan" label="PAN" rules={[{ required: true, len: 10, message: 'PAN must be 10 characters' }]}>
            <Input maxLength={10} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true }]}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Active — included in IPO distribute and member PAN login. Inactive — hidden from new IPOs and login blocked; all history kept.
              </Typography.Text>
            }
          >
            <Select
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item name="memberGroupId" label="Sub-Group">
            <Select
              allowClear
              placeholder="None — or pick e.g. Rinku"
              options={memberGroups.map((g) => ({ value: g.id, label: g.name }))}
            />
          </Form.Item>
          <Form.Item name="relationshipNote" label="Relationship Note">
            <Input placeholder="MOTHER, BROTHER, etc." />
          </Form.Item>
          <Form.Item name="sortOrder" label="Sort Order">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
