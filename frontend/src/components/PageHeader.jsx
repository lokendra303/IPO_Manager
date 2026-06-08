import { Typography, Space } from 'antd';

export default function PageHeader({ title, subtitle, extra }) {
  return (
    <div className="page-header">
      <div className="page-header-inner">
        <div className="page-header-main">
          <Typography.Title level={3} className="page-header-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Paragraph className="page-header-subtitle">{subtitle}</Typography.Paragraph>
          )}
        </div>
        {extra && (
          <div className="page-header-extra">
            <Space wrap>{extra}</Space>
          </div>
        )}
      </div>
    </div>
  );
}
