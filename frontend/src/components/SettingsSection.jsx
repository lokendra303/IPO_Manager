import { Card, Typography, Alert } from 'antd';

export default function SettingsSection({ icon, title, description, children, alert }) {
  return (
    <Card className="settings-section-card" bordered={false}>
      <div className="settings-section-header">
        <div className="settings-section-icon">{icon}</div>
        <div className="settings-section-titles">
          <Typography.Title level={5} className="settings-section-title">
            {title}
          </Typography.Title>
          {description && (
            <Typography.Text type="secondary" className="settings-section-desc">
              {description}
            </Typography.Text>
          )}
        </div>
      </div>
      {alert && <Alert {...alert} showIcon style={{ marginBottom: 20 }} />}
      <div className="settings-section-body">{children}</div>
    </Card>
  );
}
