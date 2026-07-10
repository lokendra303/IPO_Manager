import { useEffect, useState } from 'react';
import { Descriptions, Drawer, Spin, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency, formatPan } from '../utils/format';
import { ALLOTMENT_COLORS, formatAllotmentLabel } from '../utils/memberPortal';
import { tableDefaults } from '../utils/table';
import { getErrorMessage } from '../utils/errors';

export default function MemberIpoDetailDrawer({ ipoId, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !ipoId) return;
    setLoading(true);
    setError(null);
    client
      .get(`/member-portal/ipo/${ipoId}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Could not load IPO detail')))
      .finally(() => setLoading(false));
  }, [open, ipoId]);

  const ipo = data?.ipo;
  const personal = data?.personalApplication;
  const groupApps = data?.groupApplications ?? [];

  return (
    <Drawer
      title={ipo?.name || 'IPO detail'}
      open={open}
      onClose={onClose}
      width={Math.min(720, window.innerWidth - 24)}
      destroyOnClose
    >
      {loading ? (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      ) : error ? (
        <Typography.Text type="danger">{error}</Typography.Text>
      ) : (
        <>
          {ipo ? (
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Status">{ipo.status}</Descriptions.Item>
              <Descriptions.Item label="Open date">
                {ipo.openDate ? dayjs(ipo.openDate).format('DD MMM YYYY') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="RII lot">{formatCurrency(ipo.lotAmountRii)}</Descriptions.Item>
              <Descriptions.Item label="Segment">{ipo.ipoSegment}</Descriptions.Item>
            </Descriptions>
          ) : null}

          <Typography.Title level={5}>Your application</Typography.Title>
          {personal ? (
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Amount">{formatCurrency(personal.amount)}</Descriptions.Item>
              <Descriptions.Item label="Category">{personal.investorCategory}</Descriptions.Item>
              <Descriptions.Item label="Allotment">
                <Tag color={ALLOTMENT_COLORS[personal.allotmentStatus]}>{formatAllotmentLabel(personal.allotmentStatus)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Fund return">
                {personal.fundReturned ? <Tag color="success">Returned</Tag> : <Tag color="warning">Pending</Tag>}
              </Descriptions.Item>
              {personal.grossProfitLoss != null ? (
                <Descriptions.Item label="Gross P&L">{formatCurrency(personal.grossProfitLoss)}</Descriptions.Item>
              ) : null}
              {personal.memberShare != null ? (
                <Descriptions.Item label="Your share">{formatCurrency(personal.memberShare)}</Descriptions.Item>
              ) : null}
            </Descriptions>
          ) : (
            <Typography.Paragraph type="secondary">Not applied for this IPO yet.</Typography.Paragraph>
          )}

          {data?.isLeader ? (
            <>
              <Typography.Title level={5}>Group members ({groupApps.length})</Typography.Title>
              <Typography.Paragraph type="secondary">
                Fund return and allotment status per member for this IPO.
              </Typography.Paragraph>
              <Table
                rowKey="id"
                size="small"
                dataSource={groupApps}
                pagination={groupApps.length > 8 ? { pageSize: 8 } : false}
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    title: 'Member',
                    dataIndex: 'memberName',
                    render: (v, row) => (
                      <span style={{ fontWeight: row.isLeader ? 600 : 400 }}>
                        {v}
                        {row.isLeader ? ' (You)' : ''}
                      </span>
                    ),
                  },
                  { title: 'PAN', dataIndex: 'memberPan', render: (v) => formatPan(v) },
                  { title: 'UPI', dataIndex: 'memberUpi', render: (v) => v || '—' },
                  { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                  {
                    title: 'Allotment',
                    dataIndex: 'allotmentStatus',
                    render: (s) => <Tag color={ALLOTMENT_COLORS[s]}>{formatAllotmentLabel(s)}</Tag>,
                  },
                  {
                    title: 'Fund',
                    dataIndex: 'fundReturned',
                    render: (v) => (v ? <Tag color="success">Returned</Tag> : <Tag color="warning">Pending</Tag>),
                  },
                  {
                    title: 'P&L',
                    dataIndex: 'grossProfitLoss',
                    render: (v, row) =>
                      row.allotmentStatus === 'ALLOTED' && v != null ? formatCurrency(v) : '—',
                  },
                  {
                    title: 'Share',
                    dataIndex: 'memberShare',
                    render: (v, row) =>
                      row.allotmentStatus === 'ALLOTED' && v != null ? formatCurrency(v) : '—',
                  },
                ]}
                {...tableDefaults}
              />
            </>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
