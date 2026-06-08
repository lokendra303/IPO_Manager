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
  Select,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, TeamOutlined, EyeOutlined, BankOutlined, UserOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
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
  const [ownerMemberId, setOwnerMemberId] = useState(null);
  const [viewGroup, setViewGroup] = useState(null);
  const [viewOwnerId, setViewOwnerId] = useState(null);
  const [groupBulkTxns, setGroupBulkTxns] = useState([]);
  const [bulkTxnsLoading, setBulkTxnsLoading] = useState(false);
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

  const openViewInfo = (group) => {
    setViewGroup(group);
    setViewOwnerId(group.ownerMemberId ?? null);
    setGroupBulkTxns([]);
    setBulkTxnsLoading(true);
    client.get(`/member-groups/${group.id}/bulk-transactions`)
      .then((res) => setGroupBulkTxns(res.data))
      .catch(() => setGroupBulkTxns([]))
      .finally(() => setBulkTxnsLoading(false));
  };

  const onSaveViewOwner = async () => {
    if (!viewGroup) return;
    if (!viewOwnerId) {
      message.warning('Select a group owner from the list');
      return;
    }
    setSaving(true);
    try {
      const { data } = await client.patch(`/member-groups/${viewGroup.id}`, {
        ownerMemberId: viewOwnerId,
      });
      message.success('Group owner saved');
      setViewGroup(data);
      setViewOwnerId(data.ownerMemberId ?? null);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not save owner'));
    } finally {
      setSaving(false);
    }
  };

  const openAssignMembers = (group) => {
    setAssignGroup(group);
    setSelectedMemberIds(group.members.map((m) => m.id));
    setOwnerMemberId(group.ownerMemberId ?? null);
    setMembersModalOpen(true);
  };

  const onSaveMembers = async () => {
    if (!assignGroup) return;
    setSaving(true);
    try {
      await client.put(`/member-groups/${assignGroup.id}/members`, {
        memberIds: selectedMemberIds,
        ownerMemberId: ownerMemberId ?? null,
      });
      message.success(ownerMemberId ? 'Group members and owner updated' : 'Group members updated');
      setMembersModalOpen(false);
      if (viewGroup?.id === assignGroup.id) {
        const { data: refreshed } = await client.get('/member-groups');
        const updated = refreshed.data.find((g) => g.id === assignGroup.id);
        if (updated) {
          setViewGroup(updated);
          setViewOwnerId(updated.ownerMemberId ?? null);
        }
      }
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

  const getOwnerLabel = (group) => {
    if (!group) return null;
    if (group.ownerDisplayName) {
      return group.ownerPan
        ? `${group.ownerDisplayName} (${group.ownerPan})`
        : group.ownerDisplayName;
    }
    if (group.ownerMemberId && group.members?.length) {
      const owner = group.members.find((m) => m.id === group.ownerMemberId);
      if (owner) {
        return owner.pan ? `${owner.displayName} (${owner.pan})` : owner.displayName;
      }
    }
    return null;
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
    {
      title: 'Group',
      dataIndex: 'name',
      render: (v, row) => {
        const ownerLabel = getOwnerLabel(row);
        return (
          <div>
            <strong>{v}</strong>
            {ownerLabel ? (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Owner: <span style={{ color: '#b45309', fontWeight: 500 }}>{ownerLabel}</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Owner: not set</div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Owner',
      key: 'owner',
      render: (_, row) =>
        row.ownerDisplayName ? (
          <Tag color="gold">{row.ownerDisplayName}</Tag>
        ) : (
          <Typography.Text type="secondary">Not set</Typography.Text>
        ),
    },
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
          <Button size="small" icon={<EyeOutlined />} onClick={() => openViewInfo(row)}>
            View info
          </Button>
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
        subtitle="Create teams with a group owner — IPO funds can be paid in one bulk transfer to the owner for all members"
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
        className="subgroup-view-modal"
        title={viewGroup ? `Sub-group — ${viewGroup.name}` : 'Sub-group info'}
        open={!!viewGroup}
        onCancel={() => setViewGroup(null)}
        footer={[
          <Button key="close" onClick={() => setViewGroup(null)}>Close</Button>,
          <Button
            key="manage"
            type="primary"
            onClick={() => {
              const g = viewGroup;
              setViewGroup(null);
              openAssignMembers(g);
            }}
          >
            Manage members
          </Button>,
        ]}
        width={960}
        destroyOnClose
      >
        {viewGroup && (() => {
          const ownerMember = viewGroup.members?.find((m) => m.id === viewGroup.ownerMemberId);
          const ownerName = viewGroup.ownerDisplayName || ownerMember?.displayName;
          const ownerPan = viewGroup.ownerPan || ownerMember?.pan;
          const hasOwner = Boolean(viewGroup.ownerMemberId && ownerName);
          const bulkTotal = groupBulkTxns.reduce((s, t) => s + Number(t.totalAmount || 0), 0);
          return (
          <div className="subgroup-view">
            <div className="subgroup-view__owner-bar">
              {hasOwner ? (
                <Space wrap size="middle">
                  <Tag color="gold" icon={<UserOutlined />}>Owner</Tag>
                  <Typography.Text strong style={{ fontSize: 16 }}>{ownerName}</Typography.Text>
                  {ownerPan && (
                    <Typography.Text type="secondary">PAN {ownerPan}</Typography.Text>
                  )}
                </Space>
              ) : (
                <Typography.Text type="warning">No owner set — bulk IPO pay requires an owner</Typography.Text>
              )}
            </div>

            <Row gutter={[12, 12]} className="subgroup-view__stats">
              <Col xs={24} sm={8}>
                <div className="subgroup-view__stat">
                  <TeamOutlined className="subgroup-view__stat-icon" />
                  <div>
                    <div className="subgroup-view__stat-value">{viewGroup.memberCount}</div>
                    <div className="subgroup-view__stat-label">Members</div>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={8}>
                <div className="subgroup-view__stat">
                  <BankOutlined className="subgroup-view__stat-icon subgroup-view__stat-icon--gold" />
                  <div>
                    <div className="subgroup-view__stat-value">{groupBulkTxns.length}</div>
                    <div className="subgroup-view__stat-label">Bulk IPO pays</div>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={8}>
                <div className="subgroup-view__stat">
                  <BankOutlined className="subgroup-view__stat-icon subgroup-view__stat-icon--green" />
                  <div>
                    <div className="subgroup-view__stat-value">{formatCurrency(bulkTotal)}</div>
                    <div className="subgroup-view__stat-label">Total to owner</div>
                  </div>
                </div>
              </Col>
            </Row>

            {!hasOwner && viewGroup.members.length > 0 && (
              <div className="subgroup-view__alert">
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Set group owner
                </Typography.Text>
                <Space wrap>
                  <Select
                    style={{ minWidth: 260 }}
                    placeholder="Choose owner from members"
                    value={viewOwnerId}
                    onChange={setViewOwnerId}
                    options={viewGroup.members.map((m) => ({
                      value: m.id,
                      label: `${m.displayName} (${m.pan})`,
                    }))}
                  />
                  <Button type="primary" loading={saving} onClick={onSaveViewOwner}>
                    Save owner
                  </Button>
                </Space>
              </div>
            )}

            <Divider orientation="left" plain className="subgroup-view__divider">
              Members ({viewGroup.members.length})
            </Divider>
            <div className="subgroup-view__panel subgroup-view__panel--members">
              {viewGroup.members.length ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content', y: 240 }}
                  dataSource={viewGroup.members}
                  columns={[
                    {
                      title: 'Name',
                      dataIndex: 'displayName',
                      render: (v, m) => (
                        <Space size={6}>
                          <span style={{ fontWeight: m.id === viewGroup.ownerMemberId ? 600 : 400 }}>{v}</span>
                          {m.id === viewGroup.ownerMemberId && <Tag color="gold">Owner</Tag>}
                        </Space>
                      ),
                    },
                    { title: 'PAN', dataIndex: 'pan', width: 140 },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      width: 96,
                      align: 'center',
                      render: (s) => (
                        <Tag color={s === 'ACTIVE' ? 'success' : 'default'}>
                          {s === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </Tag>
                      ),
                    },
                  ]}
                />
              ) : (
                <Typography.Paragraph type="secondary" style={{ margin: 12 }}>
                  No members assigned — use Manage members to add people to this group.
                </Typography.Paragraph>
              )}
            </div>

            <Divider orientation="left" plain className="subgroup-view__divider subgroup-view__divider--history">
              Group transaction history
            </Divider>
            <Typography.Paragraph type="secondary" className="subgroup-view__hint">
              One transfer per IPO (<strong>Bulk to owner</strong> on Distribute). Count includes owner.
              Each member’s share appears on Summary → Total Given.
            </Typography.Paragraph>
            <div className="subgroup-view__panel subgroup-view__panel--history">
              <Table
                className="subgroup-history-table"
                rowKey="id"
                size="small"
                loading={bulkTxnsLoading}
                pagination={false}
                tableLayout="fixed"
                locale={{ emptyText: 'No bulk payments yet — use Bulk to owner on an IPO' }}
                dataSource={groupBulkTxns}
                columns={[
                  {
                    title: 'Date',
                    dataIndex: 'paidAt',
                    width: 118,
                    align: 'left',
                    render: (v) => (
                      <span className="subgroup-history-table__date">
                        {v ? new Date(v).toLocaleDateString('en-IN') : '—'}
                      </span>
                    ),
                  },
                  {
                    title: 'IPO',
                    dataIndex: 'ipoName',
                    align: 'left',
                    ellipsis: { showTitle: true },
                  },
                  {
                    title: 'Transfer',
                    dataIndex: 'totalAmount',
                    width: 132,
                    align: 'right',
                    render: (v) => (
                      <span className="subgroup-history-table__amount">{formatCurrency(v)}</span>
                    ),
                  },
                  {
                    title: 'Members',
                    dataIndex: 'memberCount',
                    width: 96,
                    align: 'center',
                    render: (n) => n,
                  },
                  {
                    title: 'Type',
                    dataIndex: 'investorCategory',
                    width: 72,
                    align: 'center',
                    render: (v) => (v ? <Tag>{v}</Tag> : '—'),
                  },
                ]}
              />
            </div>
          </div>
          );
        })()}
      </Modal>

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
        <Form.Item
          label="Group owner"
          style={{ marginTop: 16, marginBottom: 0 }}
          extra="Receives bulk IPO payments for the whole group. Must be one of the members above."
        >
          <Select
            allowClear
            placeholder="Select owner from group members"
            value={ownerMemberId}
            onChange={setOwnerMemberId}
            options={selectedMemberIds.map((mid) => {
              const m = memberOptions.find((o) => o.id === mid);
              return m ? { value: m.id, label: `${m.displayName} (${m.pan})` } : null;
            }).filter(Boolean)}
          />
        </Form.Item>
      </Modal>
    </div>
  );
}
