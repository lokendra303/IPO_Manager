import { Typography, Space } from 'antd';

export default function PageHeader({ title, subtitle, extra }) {
  return (
    <div className="page-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Typography.Title level={3} className="page-header-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Paragraph className="page-header-subtitle">{subtitle}</Typography.Paragraph>
          )}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
    </div>
  );
}
