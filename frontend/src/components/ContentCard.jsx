import { Card } from 'antd';

export default function ContentCard({ title, extra, children, padded = false }) {
  return (
    <Card title={title} extra={extra} className="content-card" bordered={false}>
      <div className={padded ? 'ant-card-body--padded' : undefined}>{children}</div>
    </Card>
  );
}
