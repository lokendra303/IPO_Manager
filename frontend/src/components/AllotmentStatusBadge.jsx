import {
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
  SyncOutlined,
  WarningFilled,
} from '@ant-design/icons';

const META = {
  ALLOTED: { tone: 'allotted', label: 'Allotted', icon: <CheckCircleFilled /> },
  PARTIALLY_ALLOTTED: { tone: 'partial', label: 'Partial', icon: <CheckCircleFilled /> },
  NOT_ALLOTED: { tone: 'missed', label: 'Not allotted', icon: <CloseCircleFilled /> },
  PENDING: { tone: 'pending', label: 'Pending', icon: <ClockCircleFilled /> },
  CHECKING: { tone: 'checking', label: 'Checking', icon: <SyncOutlined spin /> },
  RETRY: { tone: 'checking', label: 'Retry', icon: <WarningFilled /> },
  ERROR: { tone: 'error', label: 'Error', icon: <WarningFilled /> },
  REJECTED: { tone: 'error', label: 'Rejected', icon: <MinusCircleFilled /> },
  NOT_APPLIED: { tone: 'idle', label: 'Not applied', icon: <MinusCircleFilled /> },
};

function lotsLabel(status, lots) {
  if ((status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED') && lots != null) {
    return ` · ${lots} lot${lots === 1 ? '' : 's'}`;
  }
  return '';
}

export default function AllotmentStatusBadge({ status, lots, checking, waitingForListing }) {
  if (checking) {
    return (
      <span className="allotment-badge allotment-badge--checking">
        <SyncOutlined spin />
        Checking now
      </span>
    );
  }
  if (waitingForListing && (status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED')) {
    return (
      <span className="allotment-badge allotment-badge--waiting">
        <CalendarOutlined />
        Waiting for listing{lotsLabel(status, lots)}
      </span>
    );
  }
  const meta = META[status] || { tone: 'idle', label: status || '—', icon: null };
  return (
    <span className={`allotment-badge allotment-badge--${meta.tone}`}>
      {meta.icon}
      {meta.label}{lotsLabel(status, lots)}
    </span>
  );
}
