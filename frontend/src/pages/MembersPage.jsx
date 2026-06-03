import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Modal, Form, Input, Select, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import MemberDetailDrawer from '../components/MemberDetailDrawer';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { tableDefaults } from '../utils/table';

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailMemberId, setDetailMemberId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    client.get('/members').then((r) => setMembers(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

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
      bulkGroupLabel: record.bulk_group_label,
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

  const onDelete = async (id) => {
    try {
      await client.delete(`/members/${id}`);
      message.success('Member deleted');
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Delete failed'));
    }
  };

  const columns = [
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag>,
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
    { title: 'Bulk Group', dataIndex: 'bulk_group_label' },
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
          <Popconfirm title="Delete member?" onConfirm={() => onDelete(r.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Team Members"
        subtitle="Manage PAN, status, and view each member's IPO history"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Member
          </Button>
        }
      />
      <ContentCard title={`Members (${members.length})`}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={members}
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
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={[{ value: 'ACTIVE', label: 'ACTIVE' }, { value: 'INACTIVE', label: 'INACTIVE' }]} />
          </Form.Item>
          <Form.Item name="relationshipNote" label="Relationship Note">
            <Input placeholder="MOTHER, BROTHER, etc." />
          </Form.Item>
          <Form.Item name="bulkGroupLabel" label="Bulk Group">
            <Input placeholder="Rinku (9 Accounts)" />
          </Form.Item>
          <Form.Item name="sortOrder" label="Sort Order">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
