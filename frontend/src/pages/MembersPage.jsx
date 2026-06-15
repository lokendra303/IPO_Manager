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
  Alert,
  Result,
  Row,
  Col,
  Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import MemberDetailDrawer from '../components/MemberDetailDrawer';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { tableDefaults } from '../utils/table';
import { formatPan } from '../utils/format';

function memberMatchesSearch(member, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    member.display_name,
    member.pan,
    member.email,
    member.upi,
    member.relationship_note,
    member.member_group_name,
    member.fund_provider_name,
    member.share_provider_name,
    member.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailMemberId, setDetailMemberId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    setLoadError(null);
    Promise.allSettled([client.get('/members'), client.get('/member-groups')])
      .then(([membersRes, groupsRes]) => {
        if (membersRes.status === 'fulfilled') {
          setMembers(Array.isArray(membersRes.value.data) ? membersRes.value.data : []);
        } else {
          setMembers([]);
          setLoadError(getErrorMessage(membersRes.reason, 'Could not load members'));
        }
        if (groupsRes.status === 'fulfilled') {
          setMemberGroups(Array.isArray(groupsRes.value.data) ? groupsRes.value.data : []);
        } else {
          setMemberGroups([]);
          if (membersRes.status === 'fulfilled') {
            message.warning('Sub-groups could not be loaded — members list is still available');
          }
        }
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

  const statusFilteredMembers = useMemo(() => {
    if (statusFilter === 'ALL') return uniqueMembers;
    return uniqueMembers.filter((m) => m.status === statusFilter);
  }, [uniqueMembers, statusFilter]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return statusFilteredMembers;
    return statusFilteredMembers.filter((m) => memberMatchesSearch(m, search));
  }, [statusFilteredMembers, search]);

  const activeCount = uniqueMembers.filter((m) => m.status === 'ACTIVE').length;
  const inactiveCount = uniqueMembers.filter((m) => m.status === 'INACTIVE').length;

  const nextSortOrder = useMemo(() => {
    if (!uniqueMembers.length) return 0;
    return uniqueMembers.reduce((max, m) => Math.max(max, Number(m.sort_order) || 0), -1) + 1;
  }, [uniqueMembers]);

  const openDetail = (record) => {
    setDetailMemberId(record.id);
    setDetailOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE', sortOrder: nextSortOrder });
    setModalOpen(true);
  };

  const openEdit = (record, e) => {
    e?.stopPropagation();
    setEditing(record);
    form.setFieldsValue({
      pan: record.pan,
      displayName: record.display_name,
      email: record.email || undefined,
      upi: record.upi || undefined,
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
        setModalOpen(false);
      } else {
        await client.post('/members', values);
        message.success('Member added');
        const usedOrder = Number.isFinite(Number(values.sortOrder)) ? Number(values.sortOrder) : nextSortOrder;
        form.resetFields();
        form.setFieldsValue({ status: 'ACTIVE', sortOrder: usedOrder + 1 });
      }
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
      width: 72,
      align: 'center',
      render: (_, r) => (
        <Tooltip title={r.status === 'ACTIVE' ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
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
              size="small"
              onClick={(_, e) => e.stopPropagation()}
            />
          </Popconfirm>
        </Tooltip>
      ),
    },
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
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

  if (loadError && !loading && !uniqueMembers.length) {
    return (
      <div>
        <PageHeader title="Team Members" />
        <Result
          status="error"
          title="Could not load members"
          subTitle={loadError}
          extra={
            <Button type="primary" onClick={load}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

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
      {loadError && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          message="Some data could not be refreshed"
          description={loadError}
          action={
            <Button size="small" onClick={load}>
              Retry
            </Button>
          }
        />
      )}
      <ContentCard
        title={`Members (${filteredMembers.length}${
          statusFilter !== 'ALL' || search.trim()
            ? ` of ${
                search.trim() && statusFilter !== 'ALL'
                  ? statusFilteredMembers.length
                  : uniqueMembers.length
              }`
            : ''
        })`}
      >
        <div className="members-toolbar">
          <Input.Search
            className="members-search"
            placeholder="Search name, PAN, email, UPI, group…"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: `All (${uniqueMembers.length})`, value: 'ALL' },
              { label: `Active (${activeCount})`, value: 'ACTIVE' },
              { label: `Inactive (${inactiveCount})`, value: 'INACTIVE' },
            ]}
          />
        </div>
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
        width={760}
        className="member-form-modal"
        styles={{ body: { maxHeight: 'none', overflow: 'visible', paddingTop: 8 } }}
      >
        <Form form={form} layout="vertical" onFinish={onSave}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="displayName" label="Name" rules={[{ required: true }]}>
                <Input placeholder="Rahul (ME)" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="pan"
                label="PAN"
                normalize={(v) => (v ? String(v).toUpperCase() : v)}
                rules={[{ required: true, len: 10, message: 'PAN must be 10 characters' }]}
              >
                <Input maxLength={10} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  {
                    validator: (_, value) => {
                      const v = value?.trim();
                      if (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return Promise.resolve();
                      return Promise.reject(new Error('Enter a valid email'));
                    },
                  },
                ]}
              >
                <Input type="email" placeholder="member@example.com" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="upi"
                label="UPI ID"
                extra="e.g. name@paytm or 9876543210@ybl"
                rules={[
                  {
                    validator: (_, value) => {
                      const v = value?.trim();
                      if (!v || /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/i.test(v)) return Promise.resolve();
                      return Promise.reject(new Error('Enter a valid UPI ID (name@bank)'));
                    },
                  },
                ]}
              >
                <Input placeholder="name@paytm" allowClear style={{ textTransform: 'lowercase' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="status"
                label="Status"
                rules={[{ required: true }]}
                extra={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Active: IPO distribute + login. Inactive: hidden from new IPOs; history kept.
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
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="memberGroupId"
                label="Sub-Group"
                extra={
                  editing?.member_group_id
                    ? 'To change groups: clear this field and save, then assign the new group.'
                    : undefined
                }
              >
                <Select
                  allowClear
                  placeholder="None — or pick e.g. Rinku"
                  options={memberGroups
                    .filter((g) => {
                      if (!editing?.member_group_id) return true;
                      return g.id === editing.member_group_id;
                    })
                    .map((g) => ({ value: g.id, label: g.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="relationshipNote" label="Relationship Note">
                <Input placeholder="MOTHER, BROTHER, etc." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="sortOrder"
                label="Sort Order"
                extra={!editing ? 'Auto-increments for each new member (list order).' : undefined}
              >
                <Input type="number" min={0} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
