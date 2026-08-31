import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Col, Descriptions, Row, Tag, Typography, message } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import GmpSparkline from '../components/GmpSparkline';
import { formatCurrency, relativeTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { formatGmp, formatPriceBand, liveStatusMeta, canAddLiveIpoToMyIpos } from '../utils/liveIpo';

function d(v) {
  if (!v) return '—';
  const x = dayjs(v);
  return x.isValid() ? x.format('DD MMM YYYY') : '—';
}

export default function LiveIpoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ipo, setIpo] = useState(null);
  const [gmp, setGmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get(`/live-ipos/${id}`),
      client.get(`/live-ipos/${id}/gmp/history`).catch(() => ({ data: null })),
    ])
      .then(([ipoRes, gmpRes]) => {
        setIpo(ipoRes.data.data);
        setGmp(gmpRes.data);
      })
      .catch((err) => message.error(getErrorMessage(err, 'Failed to load')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const add = async () => {
    setAdding(true);
    try {
      const { data } = await client.post(`/live-ipos/${id}/add-to-my-ipos`);
      message.success('Added to My IPOs');
      if (data.ipo?.id) navigate(`/ipos/${data.ipo.id}`);
      else load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not add IPO'));
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <PageLoading />;
  if (!ipo) return <Typography.Paragraph>Live IPO not found.</Typography.Paragraph>;

  const meta = liveStatusMeta(ipo.status);
  const sub = ipo.subscription || {};

  return (
    <div>
      <PageHeader
        title={
          <>
            {ipo.name}{' '}
            <Tag color={meta.color}>
              <span className={meta.dot} /> {meta.label}
            </Tag>
          </>
        }
        subtitle={`${ipo.companyName || ''} · ${ipo.marketType === 'SME' ? 'SME' : 'Mainboard'}${ipo.symbol ? ` · ${ipo.symbol}` : ''}`}
        extra={
          <>
            <Link to="/live-ipos">
              <Button icon={<ArrowLeftOutlined />}>Live IPOs</Button>
            </Link>
            {ipo.isMyIpo ? (
              <Link to={`/ipos/${ipo.myIpoId}`}>
                <Button type="primary" icon={<CheckOutlined />}>
                  Added to My IPOs — open
                </Button>
              </Link>
            ) : canAddLiveIpoToMyIpos(ipo) ? (
              <Button type="primary" icon={<PlusOutlined />} loading={adding} onClick={add}>
                Add to My IPOs
              </Button>
            ) : (
              <Button disabled>
                {ipo.status === 'LISTED' ? 'Listed — cannot add' : 'Closed — cannot add'}
              </Button>
            )}
          </>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <ContentCard title="IPO information" padded>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Company">{ipo.companyName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Type">{ipo.marketType === 'SME' ? 'SME' : 'Mainboard'}</Descriptions.Item>
              <Descriptions.Item label="Symbol">{ipo.symbol || '—'}</Descriptions.Item>
              <Descriptions.Item label="Exchange">{ipo.exchange || '—'}</Descriptions.Item>
              <Descriptions.Item label="Issue size">{ipo.issueSize || '—'}</Descriptions.Item>
              <Descriptions.Item label="Registrar">{ipo.registrarName || ipo.registrar || '—'}</Descriptions.Item>
            </Descriptions>
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="Price information" padded>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Price band">{formatPriceBand(ipo)}</Descriptions.Item>
              <Descriptions.Item label="Issue price">{ipo.issuePrice != null ? formatCurrency(ipo.issuePrice) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Lot size">{ipo.lotSize ?? '—'}</Descriptions.Item>
            </Descriptions>
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="Important dates" padded>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Open">{d(ipo.openDate)}</Descriptions.Item>
              <Descriptions.Item label="Close">{d(ipo.closeDate)}</Descriptions.Item>
              <Descriptions.Item label="Allotment">{d(ipo.allotmentDate)}</Descriptions.Item>
              <Descriptions.Item label="Listing">{d(ipo.listingDate)}</Descriptions.Item>
            </Descriptions>
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="GMP" padded>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Current GMP">{formatGmp(ipo.gmp)}</Descriptions.Item>
              <Descriptions.Item label="GMP %">{ipo.gmpPercentage != null ? `${ipo.gmpPercentage}%` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Est. listing">{ipo.estimatedListingPrice != null ? formatCurrency(ipo.estimatedListingPrice) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Last updated">{relativeTime(ipo.gmpLastUpdated)}</Descriptions.Item>
              {gmp?.summary && (
                <>
                  <Descriptions.Item label="Highest">{formatGmp(gmp.summary.highest)}</Descriptions.Item>
                  <Descriptions.Item label="Lowest">{formatGmp(gmp.summary.lowest)}</Descriptions.Item>
                  <Descriptions.Item label="Change">{formatGmp(gmp.summary.change)}</Descriptions.Item>
                </>
              )}
            </Descriptions>
            <GmpSparkline points={gmp?.history || []} />
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="Subscription" padded>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="QIB">{sub.qib ? `${sub.qib}x` : '—'}</Descriptions.Item>
              <Descriptions.Item label="NII">{sub.nii ? `${sub.nii}x` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Retail">{sub.retail ? `${sub.retail}x` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Total">{sub.total ? `${sub.total}x` : '—'}</Descriptions.Item>
            </Descriptions>
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="Team applications" padded>
            {ipo.isMyIpo ? (
              <Link to={`/ipos/${ipo.myIpoId}`}>Open team applications, allotment, and P&L</Link>
            ) : canAddLiveIpoToMyIpos(ipo) ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Add this IPO to My IPOs to manage team applications, allotment, and profit.
              </Typography.Paragraph>
            ) : (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Closed and listed IPOs cannot be added to My IPOs.
              </Typography.Paragraph>
            )}
          </ContentCard>
        </Col>
      </Row>
    </div>
  );
}
