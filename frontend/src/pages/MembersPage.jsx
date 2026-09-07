import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Switch,
  Typography,
  Popconfirm,
  Alert,
  Result,
  Row,
  Col,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  PercentageOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import MemberDetailDrawer from '../components/MemberDetailDrawer';
import { formatPan } from '../utils/format';

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

function Kpi({ label, value, hint, tone = 'neutral', active, onClick }) {
  return (
    <button
      type="button"
      className={`dash-kpi-a mem-kpi-btn${active ? ' is-on' : ''}`}
      onClick={onClick}
    >
      <article className={`dash-kpi dash-kpi--${tone}`}>
        <span className="dash-kpi-label">{label}</span>
        <strong className="dash-kpi-value">{value}</strong>
        {hint ? <span className="dash-kpi-hint">{hint}</span> : null}
      </article>
    </button>
  );
}

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [needsShareOnly, setNeedsShareOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
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

  const activeCount = uniqueMembers.filter((m) => m.status === 'ACTIVE').length;
  const inactiveCount = uniqueMembers.filter((m) => m.status === 'INACTIVE').length;
  const needsShareCount = uniqueMembers.filter(
    (m) => m.status === 'ACTIVE' && !m.share_rule_id
  ).length;
  const ungroupedCount = uniqueMembers.filter((m) => !m.member_group_id).length;

  const filteredMembers = useMemo(() => {
    let list = uniqueMembers;
    if (statusFilter !== 'ALL') list = list.filter((m) => m.status === statusFilter);
    if (needsShareOnly) list = list.filter((m) => !m.share_rule_id);
    if (groupFilter === 'NONE') list = list.filter((m) => !m.member_group_id);
    else if (groupFilter != null) list = list.filter((m) => Number(m.member_group_id) === Number(groupFilter));
    if (search.trim()) list = list.filter((m) => memberMatchesSearch(m, search));
    return list;
  }, [uniqueMembers, statusFilter, needsShareOnly, groupFilter, search]);

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

  const setStatusKpi = (value) => {
    setStatusFilter(value);
    setNeedsShareOnly(false);
  };

  if (loadError && !loading && !uniqueMembers.length) {
    return (
      <div className="mem">
        <header className="dash-head">
          <div>
            <p className="dash-hello">Team</p>
            <h1>Members</h1>
          </div>
        </header>
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
    <div className="mem">
      <header className="dash-head">
        <div>
          <p className="dash-hello">Team</p>
          <h1>Members</h1>
          <p className="dash-lead">People who receive IPOs. Inactive keeps history — it is not a delete.</p>
        </div>
        <div className="dash-head-actions">
          <Link to="/member-groups" className="dash-btn">Sub-groups</Link>
          <button type="button" className="dash-btn dash-btn--primary" onClick={openCreate}>
            <PlusOutlined /> Add member
          </button>
        </div>
      </header>

      {loadError && (
        <Alert
          type="warning"
          showIcon
          closable
          className="mem-alert"
          message="Some data could not be refreshed"
          description={loadError}
          action={
            <Button size="small" onClick={load}>
              Retry
            </Button>
          }
        />
      )}

      <section className="dash-kpi-grid mem-kpis">
        <Kpi
          label="All"
          value={uniqueMembers.length}
          hint="Everyone on the team"
          active={statusFilter === 'ALL' && !needsShareOnly}
          onClick={() => setStatusKpi('ALL')}
        />
        <Kpi
          label="Active"
          value={activeCount}
          hint="Can receive IPOs"
          tone="teal"
          active={statusFilter === 'ACTIVE' && !needsShareOnly}
          onClick={() => setStatusKpi('ACTIVE')}
        />
        <Kpi
          label="Inactive"
          value={inactiveCount}
          hint="Hidden from new IPOs"
          tone="down"
          active={statusFilter === 'INACTIVE' && !needsShareOnly}
          onClick={() => setStatusKpi('INACTIVE')}
        />
        <Kpi
          label="Need share %"
          value={needsShareCount}
          hint="Active, no P&L rule"
          tone={needsShareCount > 0 ? 'warn' : 'neutral'}
          active={needsShareOnly}
          onClick={() => {
            setNeedsShareOnly(true);
            setStatusFilter('ALL');
          }}
        />
      </section>

      <section className="dash-card mem-card">
        <div className="mem-toolbar">
          <Input.Search
            className="mem-search"
            placeholder="Search name, PAN, email, UPI, group…"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="mem-count">
            Showing <strong>{filteredMembers.length}</strong>
            {filteredMembers.length !== uniqueMembers.length ? ` of ${uniqueMembers.length}` : ''}
          </p>
        </div>

        {memberGroups.length > 0 && (
          <div className="mem-chips" role="tablist" aria-label="Filter by sub-group">
            <button
              type="button"
              className={`mem-chip${groupFilter == null ? ' is-on' : ''}`}
              onClick={() => setGroupFilter(null)}
            >
              All groups
            </button>
            {memberGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`mem-chip${groupFilter === g.id ? ' is-on' : ''}`}
                onClick={() => setGroupFilter(g.id)}
              >
                {g.name}
              </button>
            ))}
            <button
              type="button"
              className={`mem-chip${groupFilter === 'NONE' ? ' is-on' : ''}`}
              onClick={() => setGroupFilter('NONE')}
            >
              No group ({ungroupedCount})
            </button>
          </div>
        )}

        {loading && uniqueMembers.length === 0 ? (
          <ul className="mem-list" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className="mem-skel" />
            ))}
          </ul>
        ) : filteredMembers.length === 0 ? (
          <div className="mem-empty">
            <p>{search.trim() || statusFilter !== 'ALL' || needsShareOnly || groupFilter != null
              ? 'No members match these filters.'
              : 'No members yet. Add the first person on your team.'}</p>
            {!uniqueMembers.length && (
              <button type="button" className="dash-btn dash-btn--primary" onClick={openCreate}>
                <PlusOutlined /> Add member
              </button>
            )}
          </div>
        ) : (
          <ul className="mem-list">
            {filteredMembers.map((row) => {
              const inactive = row.status !== 'ACTIVE';
              return (
                <li key={row.id}>
                  <article
                    className={`mem-person${inactive ? ' is-inactive' : ''}`}
                    onClick={() => openDetail(row)}
                  >
                    <span className={`mem-avatar mem-avatar--${avatarTone(row.id)}`}>
                      {initials(row.display_name)}
                    </span>
                    <div className="mem-person-main">
                      <div className="mem-person-top">
                        <strong>{row.display_name}</strong>
                        <span className={`mem-status ${inactive ? 'is-off' : 'is-on'}`}>
                          {inactive ? 'Inactive' : 'Active'}
                        </span>
                      </div>
                      <p className="mem-person-meta">
                        <span>{formatPan(row.pan) || 'No PAN'}</span>
                        {row.relationship_note ? <span>{row.relationship_note}</span> : null}
                        {row.member_group_name ? <span>{row.member_group_name}</span> : null}
                        {row.email ? <span>{row.email}</span> : null}
                      </p>
                      <div className="mem-share">
                        {row.share_rule_id ? (
                          <>
                            <span className="mem-share-ok">
                              {row.share_provider_name || row.fund_provider_name || 'Share set'}
                            </span>
                            <span className="mem-share-split">
                              P {row.share_profit_provider_percent}/{row.share_profit_manager_percent}%
                              {' · '}
                              L {row.share_loss_provider_percent}/{row.share_loss_manager_percent}%
                            </span>
                          </>
                        ) : (
                          <span className="mem-share-miss">Needs share %</span>
                        )}
                      </div>
                    </div>
                    <div className="mem-person-actions" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={inactive ? 'Inactive — click to activate' : 'Active — click to deactivate'}>
                        <Popconfirm
                          title={inactive ? 'Activate this member?' : 'Set member inactive?'}
                          description={
                            inactive
                              ? 'Member can receive IPOs and log in with PAN again.'
                              : 'Inactive members are hidden from IPO distribute and cannot log in. History is kept.'
                          }
                          onConfirm={() => setMemberStatus(row, inactive)}
                          okText={inactive ? 'Activate' : 'Set inactive'}
                          disabled={togglingId === row.id}
                        >
                          <Switch
                            checked={!inactive}
                            loading={togglingId === row.id}
                            size="small"
                          />
                        </Popconfirm>
                      </Tooltip>
                      <button type="button" className="mem-icon-btn" title="View details" onClick={() => openDetail(row)}>
                        <EyeOutlined />
                      </button>
                      <button
                        type="button"
                        className="mem-icon-btn"
                        title="Share %"
                        onClick={() => navigate('/profit-sharing', { state: { editMemberId: row.id } })}
                      >
                        <PercentageOutlined />
                      </button>
                      <button type="button" className="mem-icon-btn" title="Edit" onClick={(e) => openEdit(row, e)}>
                        <EditOutlined />
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <MemberDetailDrawer
        memberId={detailMemberId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <Modal
        title={editing ? 'Edit member' : 'Add member'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={760}
        className="member-form-modal"
        okText={editing ? 'Save' : 'Add member'}
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
