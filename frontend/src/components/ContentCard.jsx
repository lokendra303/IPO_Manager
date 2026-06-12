import { Card } from 'antd';

export default function ContentCard({ title, extra, children, padded = false, className = '', style }) {
  return (
    <Card
      title={title}
      extra={extra}
      className={['content-card', className].filter(Boolean).join(' ')}
      bordered={false}
      style={style}
    >
      <div className={padded ? 'ant-card-body--padded' : undefined}>{children}</div>
    </Card>
  );
}
