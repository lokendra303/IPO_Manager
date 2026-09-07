import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Checkbox,
  Typography,
  Select,
  Row,
  Col,
  Divider,
  Radio,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  TeamOutlined,
  EyeOutlined,
  BankOutlined,
  UserOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency, formatPan } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

const AVATAR_TONES = ['teal', 'slate', 'blue', 'amber', 'rose', 'violet'];

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}

function avatarTone(id) {
  return AVATAR_TONES[Math.abs(Number(id) || 0) % AVATAR_TONES.length];
}

function groupHasOwner(group) {
  return Boolean(group?.ownerMemberId || (group?.ownerExternalName && String(group.ownerExternalName).trim()));
}

function Kpi({ label, value, hint, tone = 'neutral', active, to, onClick }) {
  const body = (
    <article className={`dash-kpi dash-kpi--${tone}`}>
      <span className="dash-kpi-label">{label}</span>
      <strong className="dash-kpi-value">{value}</strong>
      {hint ? <span className="dash-kpi-hint">{hint}</span> : null}
    </article>
  );
  if (to) {
    return <Link to={to} className="dash-kpi-a">{body}</Link>;
  }
  if (!onClick) {
    return <div className="dash-kpi-a">{body}</div>;
  }
  return (
    <button
      type="button"
      className={`dash-kpi-a mem-kpi-btn${active ? ' is-on' : ''}`}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

export default function MemberGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [needOwnerOnly, setNeedOwnerOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignGroup, setAssignGroup] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [ownerMemberId, setOwnerMemberId] = useState(null);
  const [ownerMode, setOwnerMode] = useState('member');
  const [ownerExternalName, setOwnerExternalName] = useState('');
  const [ownerExternalPan, setOwnerExternalPan] = useState('');
  const [viewGroup, setViewGroup] = useState(null);
  const [viewOwnerId, setViewOwnerId] = useState(null);
  const [viewOwnerMode, setViewOwnerMode] = useState('member');
  const [viewOwnerExternalName, setViewOwnerExternalName] = useState('');
  const [viewOwnerExternalPan, setViewOwnerExternalPan] = useState('');
  const [groupBulkTxns, setGroupBulkTxns] = useState([]);
  const [bulkTxnsLoading, setBulkTxnsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    Promise.all([client.get('/member-groups'), client.get('/members')])
      .then(([g, m]) => {
        setGroups(Array.isArray(g.data) ? g.data : []);
        setAllMembers(Array.isArray(m.data) ? m.data : []);
      })
      .catch((err) => {
        message.error(getErrorMessage(err, 'Could not load sub-groups'));
        setGroups([]);
        setAllMembers([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const uniqueMembers = useMemo(() => {
    const map = new Map();
    for (const m of allMembers) {
      if (!map.has(m.id)) map.set(m.id, m);
    }
    return [...map.values()];
  }, [allMembers]);

  const groupedCount = uniqueMembers.filter((m) => m.member_group_id).length;
  const ungroupedCount = uniqueMembers.length - groupedCount;
  const needOwnerCount = groups.filter((g) => !groupHasOwner(g)).length;

  const filteredGroups = useMemo(() => {
    let list = groups;
    if (needOwnerOnly) list = list.filter((g) => !groupHasOwner(g));
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((g) => {
      const hay = [
        g.name,
        g.ownerDisplayName,
        g.ownerExternalName,
        g.ownerPan,
        ...(g.members || []).map((m) => m.displayName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [groups, needOwnerOnly, search]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (group, e) => {
    e?.stopPropagation();
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

  const syncOwnerFormFromGroup = (group) => {
    if (group?.ownerExternalName?.trim()) {
      setViewOwnerMode('external');
      setViewOwnerExternalName(group.ownerExternalName.trim());
      setViewOwnerExternalPan(group.ownerExternalPan || '');
      setViewOwnerId(null);
    } else {
      setViewOwnerMode('member');
      setViewOwnerId(group?.ownerMemberId ?? null);
      setViewOwnerExternalName('');
      setViewOwnerExternalPan('');
    }
  };

  const buildOwnerPayload = (mode, memberId, extName, extPan) => {
    if (mode === 'external') {
      const name = extName?.trim();
      if (!name) return null;
      return {
        ownerMemberId: null,
        ownerExternalName: name,
        ownerExternalPan: extPan?.trim() ? extPan.trim().toUpperCase() : null,
      };
    }
    if (!memberId) return null;
    return { ownerMemberId: memberId, ownerExternalName: null, ownerExternalPan: null };
  };

  const openViewInfo = (group) => {
    setViewGroup(group);
    syncOwnerFormFromGroup(group);
    setGroupBulkTxns([]);
    setBulkTxnsLoading(true);
    client.get(`/member-groups/${group.id}/bulk-transactions`)
      .then((res) => setGroupBulkTxns(res.data))
      .catch(() => setGroupBulkTxns([]))
      .finally(() => setBulkTxnsLoading(false));
  };

  const onSaveViewOwner = async () => {
    if (!viewGroup) return;
    const payload = buildOwnerPayload(
      viewOwnerMode,
      viewOwnerId,
      viewOwnerExternalName,
      viewOwnerExternalPan
    );
    if (!payload) {
      message.warning(
        viewOwnerMode === 'external'
          ? 'Enter a name for the third-party owner'
          : 'Select a group member as owner, or switch to third party'
      );
      return;
    }
    setSaving(true);
    try {
      const { data } = await client.patch(`/member-groups/${viewGroup.id}`, payload);
      message.success('Group owner saved');
      setViewGroup(data);
      syncOwnerFormFromGroup(data);
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not save owner'));
    } finally {
      setSaving(false);
    }
  };

  const openAssignMembers = (group, e) => {
    e?.stopPropagation();
    setAssignGroup(group);
    setSelectedMemberIds(group.members.map((m) => m.id));
    if (group.ownerExternalName?.trim()) {
      setOwnerMode('external');
      setOwnerExternalName(group.ownerExternalName.trim());
      setOwnerExternalPan(group.ownerExternalPan || '');
      setOwnerMemberId(null);
    } else {
      setOwnerMode('member');
      setOwnerMemberId(group.ownerMemberId ?? null);
      setOwnerExternalName('');
      setOwnerExternalPan('');
    }
    setMembersModalOpen(true);
  };

  const onSaveMembers = async () => {
    if (!assignGroup) return;
    setSaving(true);
    try {
      const ownerPayload = buildOwnerPayload(
        ownerMode,
        ownerMemberId,
        ownerExternalName,
        ownerExternalPan
      );
      await client.put(`/member-groups/${assignGroup.id}/members`, {
        memberIds: selectedMemberIds,
        ...(ownerPayload
          ? ownerPayload
          : { ownerMemberId: null, ownerExternalName: null, ownerExternalPan: null }),
      });
      message.success(ownerPayload ? 'Group members and owner updated' : 'Group members updated');
      setMembersModalOpen(false);
      if (viewGroup?.id === assignGroup.id) {
        const { data: refreshed } = await client.get('/member-groups');
        const list = Array.isArray(refreshed) ? refreshed : [];
        const updated = list.find((g) => g.id === assignGroup.id);
        if (updated) {
          setViewGroup(updated);
          syncOwnerFormFromGroup(updated);
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
    if (group.ownerExternalName) {
      return group.ownerExternalPan
        ? `${group.ownerExternalName} (${formatPan(group.ownerExternalPan)})`
        : group.ownerExternalName;
    }
    if (group.ownerDisplayName) {
      return group.ownerPan
        ? `${group.ownerDisplayName} (${formatPan(group.ownerPan)})`
        : group.ownerDisplayName;
    }
    if (group.ownerMemberId && group.members?.length) {
      const owner = group.members.find((m) => m.id === group.ownerMemberId);
      if (owner) {
        return owner.pan ? `${owner.displayName} (${formatPan(owner.pan)})` : owner.displayName;
      }
    }
    return null;
  };

  const memberOptions = uniqueMembers.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    pan: row.pan,
    status: row.status,
    currentGroupId: row.member_group_id,
    currentGroupName: row.member_group_name,
  }));

  return (
    <div className="sg">
      <header className="dash-head">
        <div>
          <p className="dash-hello">Team</p>
          <h1>Sub-groups</h1>
          <p className="dash-lead">
            Pay one bulk transfer to a group owner for everyone in that team.
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/members" className="dash-btn">Members</Link>
          <Link to="/group-leader-wallets" className="dash-btn">Leader wallets</Link>
          <button type="button" className="dash-btn dash-btn--primary" onClick={openCreate}>
            <PlusOutlined /> Add group
          </button>
        </div>
      </header>

      <section className="dash-kpi-grid mem-kpis">
        <Kpi
          label="Groups"
          value={groups.length}
          hint="All sub-groups"
          tone="teal"
          active={!needOwnerOnly}
          onClick={() => setNeedOwnerOnly(false)}
        />
        <Kpi
          label="Need owner"
          value={needOwnerCount}
          hint="Bulk pay blocked"
          tone={needOwnerCount > 0 ? 'warn' : 'neutral'}
          active={needOwnerOnly}
          onClick={() => setNeedOwnerOnly(true)}
        />
        <Kpi
          label="In a group"
          value={groupedCount}
          hint="Assigned members"
        />
        <Kpi
          to="/members"
          label="Ungrouped"
          value={ungroupedCount}
          hint="Open members"
          tone={ungroupedCount > 0 ? 'info' : 'neutral'}
        />
      </section>

      <section className="dash-card mem-card">
        <div className="mem-toolbar">
          <Input.Search
            className="mem-search"
            placeholder="Search group, owner, or member…"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="mem-count">
            Showing <strong>{filteredGroups.length}</strong>
            {filteredGroups.length !== groups.length ? ` of ${groups.length}` : ''}
          </p>
        </div>

        {loading && groups.length === 0 ? (
          <div className="sg-grid" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="mem-skel" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="mem-empty">
            <p>
              {search.trim() || needOwnerOnly
                ? 'No groups match these filters.'
                : 'No sub-groups yet. Create one for a team like Rinku.'}
            </p>
            {!groups.length && (
              <button type="button" className="dash-btn dash-btn--primary" onClick={openCreate}>
                <PlusOutlined /> Add group
              </button>
            )}
          </div>
        ) : (
          <div className="sg-grid">
            {filteredGroups.map((row) => {
              const ownerLabel = getOwnerLabel(row);
              const faces = row.members.slice(0, 5);
              const extra = row.members.length - faces.length;
              return (
                <article
                  key={row.id}
                  className="sg-group"
                  onClick={() => openViewInfo(row)}
                >
                  <header className="sg-group-head">
                    <span className={`mem-avatar mem-avatar--${avatarTone(row.id)}`}>
                      {initials(row.name)}
                    </span>
                    <div>
                      <strong>{row.name}</strong>
                      {ownerLabel ? (
                        <p className="sg-owner">Owner · {ownerLabel}</p>
                      ) : (
                        <p className="sg-owner sg-owner--miss">Owner not set</p>
                      )}
                    </div>
                  </header>

                  <div className="sg-group-meta">
                    <span>{row.memberCount} member{row.memberCount === 1 ? '' : 's'}</span>
                    {!groupHasOwner(row) && <span className="mem-share-miss">Needs owner</span>}
                  </div>

                  {row.members.length > 0 ? (
                    <div className="sg-faces">
                      {faces.map((m) => (
                        <span
                          key={m.id}
                          className={`sg-face mem-avatar--${avatarTone(m.id)}${m.id === row.ownerMemberId ? ' is-owner' : ''}`}
                          title={m.displayName}
                        >
                          {initials(m.displayName)}
                        </span>
                      ))}
                      {extra > 0 && <span className="sg-face sg-face--more">+{extra}</span>}
                    </div>
                  ) : (
                    <p className="sg-none">No members assigned yet</p>
                  )}

                  <div className="sg-group-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="mem-icon-btn" title="View info" onClick={() => openViewInfo(row)}>
                      <EyeOutlined />
                    </button>
                    <button type="button" className="dash-btn sg-mini" onClick={(e) => openAssignMembers(row, e)}>
                      <TeamOutlined /> Members
                    </button>
                    <button type="button" className="mem-icon-btn" title="Edit" onClick={(e) => openEdit(row, e)}>
                      <EditOutlined />
                    </button>
                    <Popconfirm
                      title="Remove this group?"
                      description="Members stay in your team — only the group label is removed."
                      onConfirm={() => onDelete(row.id)}
                    >
                      <button type="button" className="mem-icon-btn mem-icon-btn--danger" title="Remove">
                        <DeleteOutlined />
                      </button>
                    </Popconfirm>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

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
          const hasOwner = groupHasOwner(viewGroup);
          const bulkTotal = groupBulkTxns.reduce((s, t) => s + Number(t.totalAmount || 0), 0);
          return (
          <div className="subgroup-view">
            <div className="subgroup-view__owner-bar">
              {hasOwner ? (
                <div className="sg-view-owner">
                  <span className="mem-share-ok"><UserOutlined /> Owner</span>
                  <strong>{ownerName}</strong>
                  {ownerPan && <span>PAN {formatPan(ownerPan)}</span>}
                </div>
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
                <Radio.Group
                  value={viewOwnerMode}
                  onChange={(e) => setViewOwnerMode(e.target.value)}
                  style={{ marginBottom: 12 }}
                >
                  <Radio value="member">Member in this group</Radio>
                  <Radio value="external">Third party (name only)</Radio>
                </Radio.Group>
                {viewOwnerMode === 'member' ? (
                  <Select
                    style={{ minWidth: 260, maxWidth: '100%' }}
                    placeholder="Choose owner from members"
                    value={viewOwnerId}
                    onChange={setViewOwnerId}
                    options={viewGroup.members.map((m) => ({
                      value: m.id,
                      label: `${m.displayName} (${formatPan(m.pan)})`,
                    }))}
                  />
                ) : (
                  <div className="sg-ext-fields">
                    <Input
                      placeholder="Owner name (not on member list)"
                      value={viewOwnerExternalName}
                      onChange={(e) => setViewOwnerExternalName(e.target.value)}
                    />
                    <Input
                      placeholder="PAN (optional)"
                      value={viewOwnerExternalPan}
                      onChange={(e) => setViewOwnerExternalPan(e.target.value.toUpperCase())}
                      maxLength={10}
                    />
                  </div>
                )}
                <Button type="primary" loading={saving} onClick={onSaveViewOwner} style={{ marginTop: 12 }}>
                  Save owner
                </Button>
              </div>
            )}

            <Divider orientation="left" plain className="subgroup-view__divider">
              Members ({viewGroup.members.length})
            </Divider>
            <div className="subgroup-view__panel subgroup-view__panel--members">
              {viewGroup.members.length ? (
                <ul className="sg-view-members">
                  {viewGroup.members.map((m) => (
                    <li key={m.id}>
                      <span className={`sg-face mem-avatar--${avatarTone(m.id)}`}>{initials(m.displayName)}</span>
                      <div>
                        <strong>
                          {m.displayName}
                          {m.id === viewGroup.ownerMemberId ? <em>Owner</em> : null}
                        </strong>
                        <span>{formatPan(m.pan) || '—'}</span>
                      </div>
                      <span className={`mem-status ${m.status === 'ACTIVE' ? 'is-on' : 'is-off'}`}>
                        {m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </li>
                  ))}
                </ul>
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
              {bulkTxnsLoading ? (
                <p className="dash-empty">Loading payments…</p>
              ) : groupBulkTxns.length === 0 ? (
                <p className="dash-empty">No bulk payments yet — use Bulk to owner on an IPO.</p>
              ) : (
                <ul className="sg-history">
                  {groupBulkTxns.map((t) => (
                    <li key={t.id}>
                      <div>
                        <strong>{t.ipoName}</strong>
                        <span>
                          {t.paidAt ? new Date(t.paidAt).toLocaleDateString('en-IN') : '—'}
                          {t.investorCategory ? ` · ${t.investorCategory}` : ''}
                          {t.memberCount != null ? ` · ${t.memberCount} members` : ''}
                        </span>
                      </div>
                      <b>{formatCurrency(t.totalAmount)}</b>
                    </li>
                  ))}
                </ul>
              )}
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
        className="sg-assign-modal"
        okText="Save members"
      >
        <p className="sg-assign-hint">
          A member can belong to one sub-group only. To move someone, unassign them from the other group first.
        </p>
        <Checkbox.Group
          className="sg-pick"
          value={selectedMemberIds}
          onChange={setSelectedMemberIds}
        >
          {memberOptions.map((m) => {
            const inOtherGroup =
              m.currentGroupId && assignGroup && m.currentGroupId !== assignGroup.id;
            return (
              <Checkbox key={m.id} value={m.id} disabled={inOtherGroup} className="sg-pick-row">
                <span className={`sg-face mem-avatar--${avatarTone(m.id)}`}>{initials(m.displayName)}</span>
                <span className="sg-pick-copy">
                  <strong>{m.displayName}</strong>
                  <span>
                    {formatPan(m.pan)}
                    {m.status === 'INACTIVE' ? ' · Inactive' : ''}
                    {inOtherGroup ? ` · in “${m.currentGroupName}” — unassign first` : ''}
                  </span>
                </span>
              </Checkbox>
            );
          })}
        </Checkbox.Group>
        <Button
          type="link"
          style={{ paddingLeft: 0, marginTop: 8 }}
          onClick={() =>
            setSelectedMemberIds(
              memberOptions
                .filter((m) => !m.currentGroupId || m.currentGroupId === assignGroup?.id)
                .map((m) => m.id)
            )
          }
        >
          Select all available members
        </Button>
        <Form.Item
          label="Group owner"
          style={{ marginTop: 16, marginBottom: 0 }}
          extra="Receives bulk IPO payments. Pick a member in this group, or enter a third-party name."
        >
          <Radio.Group
            value={ownerMode}
            onChange={(e) => setOwnerMode(e.target.value)}
            style={{ marginBottom: 12 }}
          >
            <Radio value="member">Member in group</Radio>
            <Radio value="external">Third party (name only)</Radio>
          </Radio.Group>
          {ownerMode === 'member' ? (
            <Select
              allowClear
              placeholder="Select owner from group members"
              value={ownerMemberId}
              onChange={setOwnerMemberId}
              options={selectedMemberIds.map((mid) => {
                const m = memberOptions.find((o) => o.id === mid);
                return m ? { value: m.id, label: `${m.displayName} (${formatPan(m.pan)})` } : null;
              }).filter(Boolean)}
            />
          ) : (
            <div className="sg-ext-fields">
              <Input
                placeholder="Owner name"
                value={ownerExternalName}
                onChange={(e) => setOwnerExternalName(e.target.value)}
              />
              <Input
                placeholder="PAN (optional)"
                value={ownerExternalPan}
                onChange={(e) => setOwnerExternalPan(e.target.value.toUpperCase())}
                maxLength={10}
              />
            </div>
          )}
        </Form.Item>
      </Modal>
    </div>
  );
}
