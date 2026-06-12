import { Card } from 'antd';

const iconClass = {
  primary: 'stat-card-icon--primary',
  success: 'stat-card-icon--success',
  warning: 'stat-card-icon--warning',
  danger: 'stat-card-icon--danger',
  info: 'stat-card-icon--info',
  default: 'stat-card-icon--default',
};

export default function StatCard({ title, value, icon, variant = 'primary', valueClassName = '' }) {
  return (
    <Card className="stat-card" bordered={false}>
      <div className={`stat-card-icon ${iconClass[variant] || iconClass.primary}`}>{icon}</div>
      <div className="stat-card-content">
        <div className="stat-card-label">{title}</div>
        <div className={`stat-card-value ${valueClassName}`}>{value}</div>
      </div>
    </Card>
  );
}
