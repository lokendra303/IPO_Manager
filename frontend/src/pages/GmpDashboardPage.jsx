import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Col, Row, Select, Typography } from 'antd';
import client from '../api/client';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import GmpSparkline from '../components/GmpSparkline';
import PageLoading from '../components/PageLoading';
import { formatCurrency, relativeTime } from '../utils/format';
import { formatGmp } from '../utils/liveIpo';

export default function GmpDashboardPage() {
  const [ipos, setIpos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get('/my-ipos')
      .then((r) => {
        const rows = (r.data.data || []).filter((x) => x.catalog_id || x.gmp != null);
        setIpos(rows);
        setSelectedId(rows[0]?.id || null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHistory(null);
      return;
    }
    client.get(`/ipos/${selectedId}/gmp/history`).then((r) => setHistory(r.data));
  }, [selectedId]);

  if (loading) return <PageLoading />;
  const current = history?.current;
  const summary = history?.summary || {};
  const selected = ipos.find((i) => i.id === selectedId);

  return (
    <div>
      <PageHeader
        title="GMP"
        subtitle="Grey market premium for IPOs you added to My IPOs. History is stored on every meaningful update."
      />
      <ContentCard padded style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">IPO</Typography.Text>
        <Select
          style={{ minWidth: 280, display: 'block', marginTop: 8 }}
          placeholder="Select a My IPO with live data"
          value={selectedId}
          onChange={setSelectedId}
          options={ipos.map((i) => ({ value: i.id, label: i.name }))}
        />
      </ContentCard>
      {selected ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title="Current GMP" value={formatGmp(current?.gmp)} variant="primary" />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title="GMP %" value={current?.gmpPercentage != null ? `${current.gmpPercentage}%` : '—'} variant="info" />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                title="Est. listing"
                value={current?.estimatedListingPrice != null ? formatCurrency(current.estimatedListingPrice) : '—'}
                variant="success"
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title="Last updated" value={relativeTime(current?.lastUpdated)} variant="default" />
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <ContentCard title="GMP history" padded>
                <GmpSparkline points={history?.history || []} height={140} />
                <div style={{ marginTop: 12 }}>
                  {(history?.history || []).slice(-8).reverse().map((h) => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                      <span>{new Date(h.recordedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</span>
                      <strong>{formatGmp(h.gmp)}</strong>
                    </div>
                  ))}
                </div>
              </ContentCard>
            </Col>
            <Col xs={24} lg={10}>
              <ContentCard title="Range" padded>
                <p>Highest {formatGmp(summary.highest)}</p>
                <p>Lowest {formatGmp(summary.lowest)}</p>
                <p>Current {formatGmp(summary.current)}</p>
                <p>Change {formatGmp(summary.change)}</p>
                <Link to={`/ipos/${selectedId}`}>Open IPO details</Link>
              </ContentCard>
            </Col>
          </Row>
        </>
      ) : (
        <ContentCard padded>
          <Typography.Paragraph type="secondary">
            Add a live IPO to My IPOs to start tracking GMP.
          </Typography.Paragraph>
          <Link to="/live-ipos">Browse Live IPOs</Link>
        </ContentCard>
      )}
    </div>
  );
}
