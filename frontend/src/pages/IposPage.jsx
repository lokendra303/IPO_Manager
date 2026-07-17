import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Tag, message, Space, Popconfirm, Typography, Select, Checkbox } from 'antd';
import {
  IPO_SEGMENT_OPTIONS,
  parseAllowedCategories,
  categoryTagColor,
  getLotAmountForCategory,
} from '../utils/ipoCategories';
import { PlusOutlined, ArrowRightOutlined, StockOutlined, LockOutlined, UnlockOutlined, StopOutlined, RollbackOutlined } from '@ant-design/icons';
import { fetchRegistrarOptions } from '../utils/allotmentCheck';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { tableDefaults } from '../utils/table';

export default function IposPage() {
  const [ipos, setIpos] = useState([]);
  const [invalidIpos, setInvalidIpos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [registrarOptions, setRegistrarOptions] = useState([]);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get('/ipos'),
      client.get('/ipos', { params: { invalidOnly: 1 } }),
    ])
      .then(([active, invalid]) => {
        setIpos(active.data);
        setInvalidIpos(invalid.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    fetchRegistrarOptions(client).then(setRegistrarOptions);
  }, []);

  const onCreate = async (values) => {
    try {
      const allowedCategories = values.enableHni ? ['RII', 'HNI'] : ['RII'];
      const payload = {
        name: values.name,
        ipoSegment: values.ipoSegment,
        lotAmountRii: values.lotAmountRii,
        registrar: values.registrar,
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

  const columns = [
    { title: 'IPO Name', dataIndex: 'name', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    {
      title: 'Segment',
      dataIndex: 'ipo_segment',
      width: 120,
      render: (v) => <Tag>{v === 'SME' ? 'SME' : 'Mainboard'}</Tag>,
    },
    {
      title: 'Categories',
      dataIndex: 'allowed_categories',
      render: (v, r) => {
        const cats = parseAllowedCategories(r);
        return (
          <Space size={[4, 4]} wrap>
            {cats.map((c) => (
              <Tag key={c} color={categoryTagColor(c)}>{c}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Lot amounts',
      key: 'lots',
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ fontSize: 13 }}>
          <span>RII: {formatCurrency(getLotAmountForCategory(r, 'RII'))}</span>
          {parseAllowedCategories(r).includes('HNI') && (
            <span>
              HNI:{' '}
              {r.lot_amount_hni != null
                ? formatCurrency(getLotAmountForCategory(r, 'HNI'))
                : 'Not set'}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={s === 'OPEN' ? 'success' : 'error'}>{s}</Tag>,
    },
    { title: 'Applications', dataIndex: 'application_count' },
    {
      title: 'Actions',
      width: 280,
      render: (_, r) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Link to={`/ipos/${r.id}`}>
            <Button type="primary" ghost size="small" icon={<ArrowRightOutlined />}>
              View
            </Button>
          </Link>
          {r.status === 'OPEN' ? (
            <Popconfirm
              title="Close this IPO?"
              description="Status only — does not return funds to providers or members."
              onConfirm={async () => {
                try {
                  await client.post(`/ipos/${r.id}/close`);
                  message.success('IPO closed');
                  load();
                } catch (err) {
                  message.error(getErrorMessage(err));
                }
              }}
            >
              <Button size="small" icon={<LockOutlined />} danger>
                Close
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Reopen this IPO?"
              onConfirm={async () => {
                try {
                  await client.post(`/ipos/${r.id}/reopen`);
                  message.success('IPO reopened');
                  load();
                } catch (err) {
                  message.error(getErrorMessage(err));
                }
              }}
            >
              <Button size="small" icon={<UnlockOutlined />}>
                Reopen
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="Mark as invalid IPO?"
            description="Hides from the main list. Records are kept — you can restore later."
            onConfirm={async () => {
              try {
                await client.post(`/ipos/${r.id}/invalidate`);
                message.success('IPO marked invalid');
                load();
              } catch (err) {
                message.error(getErrorMessage(err));
              }
            }}
          >
            <Button size="small" icon={<StopOutlined />}>
              Invalid
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const invalidColumns = [
    ...columns.slice(0, -1),
    {
      title: 'Actions',
      width: 200,
      render: (_, r) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Link to={`/ipos/${r.id}`}>
            <Button type="primary" ghost size="small" icon={<ArrowRightOutlined />}>
              View
            </Button>
          </Link>
          <Popconfirm
            title="Restore to main IPO list?"
            onConfirm={async () => {
              try {
                await client.post(`/ipos/${r.id}/restore`);
                message.success('IPO restored');
                load();
              } catch (err) {
                message.error(getErrorMessage(err));
              }
            }}
          >
            <Button size="small" icon={<RollbackOutlined />}>
              Restore
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="IPOs"
        subtitle="Create IPOs, distribute funds to members, and track allotments"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                ipoSegment: 'MAINBOARD',
                enableHni: false,
              });
              setModalOpen(true);
            }}
          >
            New IPO
          </Button>
        }
      />
      <ContentCard title={`IPO List (${ipos.length})`}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={ipos}
          locale={{ emptyText: 'No IPOs yet — create one to get started' }}
          {...tableDefaults}
        />
      </ContentCard>

      {invalidIpos.length > 0 && (
        <ContentCard title={`Invalid IPOs (${invalidIpos.length})`} style={{ marginTop: 16 }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Duplicate or mistaken IPOs hidden from the main list. Restore to bring back, or view records.
          </Typography.Paragraph>
          <Table
            rowKey="id"
            loading={loading}
            columns={invalidColumns}
            dataSource={invalidIpos}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      <Modal title="Create IPO" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} destroyOnClose width={560}>
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
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            New IPOs start as OPEN. Close from the IPO page when finished.
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
