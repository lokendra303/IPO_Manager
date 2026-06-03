import { useEffect, useState } from 'react';
import {
  Button,
  Modal,
  Form,
  Input,
  Table,
  Space,
  message,
  Popconfirm,
  Tag,
  Checkbox,
  Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, TeamOutlined } from '@ant-design/icons';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { tableDefaults } from '../utils/table';

export default function MemberGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignGroup, setAssignGroup] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    Promise.all([client.get('/member-groups'), client.get('/members')])
      .then(([g, m]) => {
        setGroups(g.data);
        setAllMembers(m.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (group) => {
    setEditing(group);
    form.setFieldsValue({ name: group.name, sortOrder: group.sortOrder });
    setModalOpen(true);
  };

  const onSaveGroup = async (values) => {
    setSaving(true);
    try {
      if (editing) {
        await client.patch(`/member-groups/${editing.id}`, values);
        message.success('Group updated');
      } else {
        await client.post('/member-groups', values);
        message.success('Group created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const openAssignMembers = (group) => {
    setAssignGroup(group);
    setSelectedMemberIds(group.members.map((m) => m.id));
    setMembersModalOpen(true);
  };

  const onSaveMembers = async () => {
    if (!assignGroup) return;
    setSaving(true);
    try {
      await client.put(`/member-groups/${assignGroup.id}/members`, { memberIds: selectedMemberIds });
      message.success('Group members updated');
      setMembersModalOpen(false);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    try {
      await client.delete(`/member-groups/${id}`);
      message.success('Group removed — members are unassigned, not deleted');
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Delete failed'));
    }
  };

  const memberOptions = allMembers.reduce((acc, row) => {
    if (acc.some((m) => m.id === row.id)) return acc;
    acc.push({
      id: row.id,
      displayName: row.display_name,
      pan: row.pan,
      status: row.status,
      currentGroupId: row.member_group_id,
      currentGroupName: row.member_group_name,
    });
    return acc;
  }, []);

  const columns = [
    { title: 'Group', dataIndex: 'name', render: (v) => <strong>{v}</strong> },
    {
      title: 'Members',
      dataIndex: 'memberCount',
      render: (count, row) => (
        <Space wrap>
          <Tag icon={<TeamOutlined />}>{count}</Tag>
          {row.members.slice(0, 4).map((m) => (
            <Tag key={m.id} color={m.status === 'ACTIVE' ? 'blue' : 'default'}>
              {m.displayName}
            </Tag>
          ))}
          {row.members.length > 4 && <Tag>+{row.members.length - 4} more</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openAssignMembers(row)}>
            Manage members
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm
            title="Remove this group?"
            description="Members stay in your team — only the group label is removed."
            onConfirm={() => onDelete(row.id)}
          >
            <Button size="small" danger>
              Remove
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Member Sub-Groups"
        subtitle="Create teams like “Rinku” with members — distribute IPO funds to the whole group or pick members with checkboxes"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add group
          </Button>
        }
      />

      <ContentCard title={`Groups (${groups.length})`}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={groups}
          locale={{ emptyText: 'No sub-groups yet — create one for Rinku or similar teams' }}
          {...tableDefaults}
        />
      </ContentCard>

      <Modal
        title={editing ? 'Edit group' : 'New sub-group'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSaveGroup}>
          <Form.Item name="name" label="Group name" rules={[{ required: true }]}>
            <Input placeholder="Rinku" />
          </Form.Item>
          <Form.Item name="sortOrder" label="Sort order">
            <Input type="number" placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={assignGroup ? `Members in “${assignGroup.name}”` : 'Group members'}
        open={membersModalOpen}
        onCancel={() => setMembersModalOpen(false)}
        onOk={onSaveMembers}
        confirmLoading={saving}
        width={560}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          A member can belong to one group only. Assigning here moves them into this group.
        </Typography.Paragraph>
        <Checkbox.Group
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflow: 'auto' }}
          value={selectedMemberIds}
          onChange={setSelectedMemberIds}
        >
          {memberOptions.map((m) => {
            const inOtherGroup =
              m.currentGroupId && assignGroup && m.currentGroupId !== assignGroup.id;
            return (
              <Checkbox key={m.id} value={m.id}>
                {m.displayName} ({m.pan})
                {m.status === 'INACTIVE' && <Tag style={{ marginLeft: 8 }}>Inactive</Tag>}
                {inOtherGroup && (
                  <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                    currently in {m.currentGroupName}
                  </Typography.Text>
                )}
              </Checkbox>
            );
          })}
        </Checkbox.Group>
        <Button
          type="link"
          style={{ paddingLeft: 0, marginTop: 8 }}
          onClick={() => setSelectedMemberIds(memberOptions.map((m) => m.id))}
        >
          Select all members
        </Button>
      </Modal>
    </div>
  );
}
