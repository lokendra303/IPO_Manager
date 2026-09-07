import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Form, Input, InputNumber, message, Popconfirm, Typography, Select, Checkbox, Row, Col, Tooltip } from 'antd';
import {
  IPO_SEGMENT_OPTIONS,
  ipoAllowsHni,
  ipoHasHniLot,
  getLotAmountForCategory,
} from '../utils/ipoCategories';
import {
  PlusOutlined,
  StockOutlined,
  LockOutlined,
  UnlockOutlined,
  StopOutlined,
  RollbackOutlined,
  DeleteOutlined,
  SwapOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { fetchRegistrarOptions } from '../utils/allotmentCheck';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { formatGmp } from '../utils/liveIpo';
import { getErrorMessage } from '../utils/errors';
import ModalDatePicker from '../components/ModalDatePicker';

function toDateParam(v) {
  if (!v) return null;
  return dayjs.isDayjs(v) ? v.format('YYYY-MM-DD') : dayjs(v).format('YYYY-MM-DD');
}

function matchesIpoSearch(ipo, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [ipo.name, ipo.company_name, ipo.symbol].some((v) => String(v || '').toLowerCase().includes(q));
}

function gmpTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'ipo-gmp--up' : 'ipo-gmp--down';
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

function IpoCard({ ipo, invalid, onOpen }) {
  const rii = formatCurrency(getLotAmountForCategory(ipo, 'RII'));
  const showHni = ipoAllowsHni(ipo);
  const apps = Number(ipo.application_count) || 0;
  const allotted = Number(ipo.allotted_count) || 0;
  const pending = Number(ipo.pending_return_count) || 0;
  const open = ipo.status === 'OPEN';

  return (
    <article className={`ipo-item${invalid ? ' is-invalid' : ''}${open ? '' : ' is-closed'}`}>
      <header className="ipo-item-head">
        <div>
          <div className="ipo-item-tags">
            <span className={`ipo-pill ${open ? 'is-open' : 'is-closed'}`}>{open ? 'Open' : 'Closed'}</span>
            <span className="ipo-pill is-muted">{ipo.ipo_segment === 'SME' ? 'SME' : 'Mainboard'}</span>
            {invalid && <span className="ipo-pill is-warn">Invalid</span>}
          </div>
          <h3>{ipo.name}</h3>
          {(ipo.company_name || ipo.symbol) && (
            <p className="ipo-item-sub">{ipo.company_name || ipo.symbol}</p>
          )}
        </div>
        <div className={`ipo-gmp ${gmpTone(ipo.gmp)}`}>
          <span>GMP</span>
          <strong>{formatGmp(ipo.gmp)}</strong>
          {ipo.gmpPercentage != null && <em>{ipo.gmpPercentage}%</em>}
        </div>
      </header>

      <div className="ipo-facts">
        <div>
          <span>RII lot</span>
          <b>{rii}</b>
        </div>
        {showHni && (
          <div>
            <span>HNI lot</span>
            <b>{ipoHasHniLot(ipo) ? formatCurrency(getLotAmountForCategory(ipo, 'HNI')) : 'Not set'}</b>
          </div>
        )}
        <div>
          <span>Applications</span>
          <b>{apps}</b>
        </div>
        <div>
          <span>Allotted</span>
          <b className={allotted > 0 ? 'ipo-gmp--up' : ''}>{allotted}</b>
        </div>
        <div>
          <span>Pending return</span>
          <b className={pending > 0 ? 'ipo-gmp--down' : ''}>{pending}</b>
        </div>
      </div>

      <div className="ipo-item-actions" onClick={(e) => e.stopPropagation()}>
        <Link to={`/ipos/${ipo.id}`} className="dash-btn dash-btn--primary sg-mini">View</Link>
        {invalid ? (
          <>
            <Popconfirm title="Restore to main IPO list?" onConfirm={() => onOpen('restore', ipo)}>
              <button type="button" className="dash-btn sg-mini">
                <RollbackOutlined /> Restore
              </button>
            </Popconfirm>
            <Popconfirm
              title="Permanently delete this IPO?"
              description="Only empty invalid IPOs can be deleted. This cannot be undone."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => onOpen('delete', ipo)}
            >
              <button type="button" className="dash-btn sg-mini ipo-btn-danger">
                <DeleteOutlined /> Delete
              </button>
            </Popconfirm>
          </>
        ) : (
          <>
            {ipo.allotmentCheckReady === false ? (
              <Tooltip title={ipo.allotmentCheckBlockedReason || 'Allotment is not open on NSE/BSE yet'}>
                <span>
                  <button type="button" className="dash-btn sg-mini" disabled>
                    <SearchOutlined /> Allotment
                  </button>
                </span>
              </Tooltip>
            ) : (
              <Link to={`/ipos/${ipo.id}/allotment`} className="dash-btn sg-mini">
                <SearchOutlined /> Allotment
              </Link>
            )}
            {open ? (
              <Popconfirm
                title="Close this IPO?"
                description="Status only — does not return funds to providers or members."
                onConfirm={() => onOpen('close', ipo)}
              >
                <button type="button" className="dash-btn sg-mini ipo-btn-danger">
                  <LockOutlined /> Close
                </button>
              </Popconfirm>
            ) : (
              <Popconfirm title="Reopen this IPO?" onConfirm={() => onOpen('reopen', ipo)}>
                <button type="button" className="dash-btn sg-mini">
                  <UnlockOutlined /> Reopen
                </button>
              </Popconfirm>
            )}
            <Popconfirm
              title="Mark as invalid IPO?"
              description="Hides from the main list. Records are kept — you can restore later."
              onConfirm={() => onOpen('invalidate', ipo)}
            >
              <button type="button" className="mem-icon-btn" title="Invalid">
                <StopOutlined />
              </button>
            </Popconfirm>
            <Popconfirm
              title="Remove from My IPOs?"
              description="Live catalog data is kept. If applications exist, the IPO is hidden rather than deleted."
              onConfirm={() => onOpen('remove', ipo)}
            >
              <button type="button" className="mem-icon-btn mem-icon-btn--danger" title="Remove">
                <DeleteOutlined />
              </button>
            </Popconfirm>
          </>
        )}
      </div>
    </article>
  );
}

export default function IposPage() {
  const [ipos, setIpos] = useState([]);
  const [invalidIpos, setInvalidIpos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [registrarOptions, setRegistrarOptions] = useState([]);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('ALL');

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get('/ipos'),
      client.get('/ipos', { params: { invalidOnly: 1 } }),
    ])
      .then(([active, invalid]) => {
        setIpos(Array.isArray(active.data) ? active.data : []);
        setInvalidIpos(Array.isArray(invalid.data) ? invalid.data : []);
      })
      .catch((err) => message.error(getErrorMessage(err, 'Could not load IPOs')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    fetchRegistrarOptions(client).then(setRegistrarOptions);
  }, []);

  const openCount = ipos.filter((i) => i.status === 'OPEN').length;
  const closedCount = ipos.length - openCount;

  const visible = useMemo(() => {
    if (tab === 'INVALID') return invalidIpos.filter((i) => matchesIpoSearch(i, search));
    let list = ipos;
    if (tab === 'OPEN') list = list.filter((i) => i.status === 'OPEN');
    if (tab === 'CLOSED') list = list.filter((i) => i.status !== 'OPEN');
    return list.filter((i) => matchesIpoSearch(i, search));
  }, [ipos, invalidIpos, tab, search]);

  const onCreate = async (values) => {
    try {
      const allowedCategories = values.enableHni ? ['RII', 'HNI'] : ['RII'];
      const payload = {
        name: values.name,
        ipoSegment: values.ipoSegment,
        lotAmountRii: values.lotAmountRii,
        registrar: values.registrar,
        openDate: toDateParam(values.openDate),
        lastApplyDate: toDateParam(values.lastApplyDate),
        allowedCategories,
      };
      if (values.enableHni && values.lotAmountHni != null && values.lotAmountHni !== '') {
        payload.lotAmountHni = values.lotAmountHni;
      }
      const { data } = await client.post('/ipos', payload);
      message.success('IPO created');
      setModalOpen(false);
      form.resetFields();
      navigate(`/ipos/${data.id}`);
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    }
  };

  const runAction = async (action, ipo) => {
    try {
      if (action === 'close') {
        await client.post(`/ipos/${ipo.id}/close`);
        message.success('IPO closed');
      } else if (action === 'reopen') {
        await client.post(`/ipos/${ipo.id}/reopen`);
        message.success('IPO reopened');
      } else if (action === 'invalidate') {
        await client.post(`/ipos/${ipo.id}/invalidate`);
        message.success('IPO marked invalid');
      } else if (action === 'restore') {
        await client.post(`/ipos/${ipo.id}/restore`);
        message.success('IPO restored');
      } else if (action === 'delete') {
        await client.delete(`/ipos/${ipo.id}`);
        message.success('IPO deleted');
      } else if (action === 'remove') {
        try {
          await client.post(`/ipos/${ipo.id}/remove-from-my-ipos`);
          message.success('Removed from My IPOs');
        } catch (err) {
          if (err.response?.status === 409) {
            Modal.confirm({
              title: 'This IPO has team applications',
              content: getErrorMessage(err),
              okText: 'Hide from My IPOs',
              onOk: async () => {
                await client.post(`/ipos/${ipo.id}/remove-from-my-ipos`, { confirm: true });
                message.success('Hidden from My IPOs');
                load();
              },
            });
            return;
          }
          throw err;
        }
      }
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ ipoSegment: 'MAINBOARD', enableHni: false });
    setModalOpen(true);
  };

  return (
    <div className="myipo">
      <header className="dash-head">
        <div>
          <p className="dash-hello">Portfolio</p>
          <h1>My IPOs</h1>
          <p className="dash-lead">
            Issues your team is managing. Add from Live IPOs, or create one by hand.
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/live-ipos" className="dash-btn">Live IPOs</Link>
          <Link to="/adjust-combine" className="dash-btn">
            <SwapOutlined /> Reuse leftover
          </Link>
          <button type="button" className="dash-btn dash-btn--primary" onClick={openCreate}>
            <PlusOutlined /> New IPO
          </button>
        </div>
      </header>

      <section className="dash-kpi-grid mem-kpis">
        <Kpi
          label="All"
          value={ipos.length}
          hint="On My IPOs"
          tone="teal"
          active={tab === 'ALL'}
          onClick={() => setTab('ALL')}
        />
        <Kpi
          label="Open"
          value={openCount}
          hint="Can take applications"
          tone="up"
          active={tab === 'OPEN'}
          onClick={() => setTab('OPEN')}
        />
        <Kpi
          label="Closed"
          value={closedCount}
          hint="Finished issues"
          active={tab === 'CLOSED'}
          onClick={() => setTab('CLOSED')}
        />
        <Kpi
          label="Invalid"
          value={invalidIpos.length}
          hint="Hidden from the list"
          tone={invalidIpos.length > 0 ? 'warn' : 'neutral'}
          active={tab === 'INVALID'}
          onClick={() => setTab('INVALID')}
        />
      </section>

      <section className="dash-card mem-card">
        <div className="mem-toolbar">
          <Input.Search
            className="mem-search"
            placeholder="Search name, company, symbol…"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="mem-count">
            Showing <strong>{visible.length}</strong>
          </p>
        </div>

        {loading && ipos.length === 0 && invalidIpos.length === 0 ? (
          <div className="ipo-grid" aria-hidden>
            {[1, 2, 3, 4].map((n) => <div key={n} className="mem-skel" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="mem-empty">
            <p>
              {search.trim() || tab !== 'ALL'
                ? 'No IPOs match these filters.'
                : 'No My IPOs yet — add one from Live IPOs or create it here.'}
            </p>
            {tab === 'ALL' && !ipos.length && (
              <div className="dash-head-actions" style={{ justifyContent: 'center' }}>
                <Link to="/live-ipos" className="dash-btn">Browse live IPOs</Link>
                <button type="button" className="dash-btn dash-btn--primary" onClick={openCreate}>
                  <PlusOutlined /> New IPO
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="ipo-grid">
            {visible.map((ipo) => (
              <IpoCard key={ipo.id} ipo={ipo} invalid={tab === 'INVALID'} onOpen={runAction} />
            ))}
          </div>
        )}
      </section>

      <Modal
        title="Create IPO"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="name" label="IPO Name" rules={[{ required: true }]}>
            <Input prefix={<StockOutlined style={{ color: '#94a3b8' }} />} placeholder="Orkla India" />
          </Form.Item>
          <Form.Item name="ipoSegment" label="IPO segment" rules={[{ required: true }]}>
            <Select options={IPO_SEGMENT_OPTIONS} />
          </Form.Item>
          <Form.Item name="lotAmountRii" label="RII lot amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="Retail application" />
          </Form.Item>
          <Form.Item name="enableHni" valuePropName="checked" extra="You can turn on HNI later from the IPO page if needed.">
            <Checkbox>Enable HNI applications (optional)</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.enableHni !== cur.enableHni}>
            {({ getFieldValue }) =>
              getFieldValue('enableHni') ? (
                <Form.Item
                  name="lotAmountHni"
                  label="HNI lot amount (₹)"
                  extra="Optional now — set or update anytime from the IPO detail page."
                >
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="Leave blank to set later" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="registrar" label="Allotment registrar (optional)">
            <Select allowClear placeholder="KFintech, Link Intime, etc." options={registrarOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="openDate" label="Open date">
                <ModalDatePicker />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="lastApplyDate" label="Close date (last apply)">
                <ModalDatePicker />
              </Form.Item>
            </Col>
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            New IPOs start as OPEN. Close from the IPO page when finished.
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
